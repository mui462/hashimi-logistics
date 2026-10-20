import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { NotificationDelivery } from '../models/NotificationDelivery.js';
import { NotificationDeliveryClaim } from '../models/NotificationDeliveryClaim.js';
import { SiteSettings } from '../models/SiteSettings.js';
import { Carrier } from '../models/Carrier.js';
import { Customer } from '../models/Customer.js';
import { User } from '../models/User.js';
import { ACCOUNT_TYPES } from '../utils/constants.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { pagination, skipFor } from '../operations/common.js';
import { normalizePhone } from './phone.js';
import { ProviderError, sanitizeError } from './providers/ProviderError.js';
import { getEmailProvider, getSmsProvider } from './providers/index.js';
import { open, seal } from './secureText.js';
import { renderNotificationEmail, renderSecurityEmail, renderSms } from './templates.js';

const SMS_TYPES = new Set(['quote', 'load', 'shipment', 'document']);
const PREFERENCE_BY_TYPE = { quote: 'quoteNotifications', load: 'shipmentNotifications', shipment: 'shipmentNotifications', document: 'documentNotifications' };
const PORTAL_BASE = { [ACCOUNT_TYPES.CUSTOMER]: '/customer', [ACCOUNT_TYPES.CARRIER]: '/carrier', [ACCOUNT_TYPES.SUPER_ADMIN]: '/admin' };

/** User.phone first, then the customer/carrier profile phone. Returned as E.164 or null (never throws, never rewrites a record). */
export async function resolvePhone(user) {
  const direct = normalizePhone(user.phone);
  if (direct) return direct;
  const Profile = user.role === ACCOUNT_TYPES.CUSTOMER ? Customer : user.role === ACCOUNT_TYPES.CARRIER ? Carrier : null;
  if (!Profile) return null;
  const profile = await Profile.findOne({ userId: user._id }).select('phone').lean();
  return normalizePhone(profile?.phone);
}

const sha = (value) => createHash('sha256').update(String(value)).digest('hex');

/* ---------- preference rules (also re-checked by the worker at send time) ---------- */

export function allowsChannel(user, channel, notificationType) {
  const prefs = user.notificationPreferences ?? {};
  const typeFlag = PREFERENCE_BY_TYPE[notificationType];
  if (typeFlag && prefs[typeFlag] === false) return false;
  if (channel === 'EMAIL') return prefs.emailNotifications !== false;
  if (channel === 'SMS') return prefs.smsNotifications === true && SMS_TYPES.has(notificationType);
  return true;
}

export const actionPathFor = (role, notification) => {
  const base = PORTAL_BASE[role];
  return base ? `${base}/notifications` : null;
};

/* ---------- enqueue (called from the request path: inserts only, never calls a provider) ---------- */

async function insertOnce(document) {
  try {
    return await NotificationDelivery.create(document);
  } catch (error) {
    if (error?.code === 11000) return null; // the same event was already queued for this recipient and channel
    throw error;
  }
}

export const deliveryKey = (eventKey, recipientId, channel) => `${eventKey}:${recipientId}:${channel}`;

/**
 * Records the in-app delivery and queues EMAIL / SMS rows for a notification that was just created. Never throws: a queueing
 * problem must not break the business action (the in-app notification already exists).
 */
export async function enqueueForNotification({ notification, eventKey }) {
  try {
    const user = await User.findById(notification.recipientId).select('role isActive isEmailVerified email phone notificationPreferences').lean();
    if (!user || !user.isActive) return [];
    const key = eventKey ?? `notification:${notification._id}`;
    const base = {
      notificationId: notification._id,
      recipientUserId: user._id,
      notificationType: notification.type,
      category: 'notification',
      content: { title: notification.title, message: notification.message, actionPath: actionPathFor(user.role, notification) },
    };
    const rows = [];
    rows.push(await insertOnce({ ...base, channel: 'IN_APP', provider: 'in_app', status: 'SENT', sentAt: new Date(), attemptCount: 1, idempotencyKey: deliveryKey(key, user._id, 'IN_APP') }));

    if (getEmailProvider() && user.email && user.isEmailVerified && allowsChannel(user, 'EMAIL', notification.type)) {
      rows.push(await insertOnce({ ...base, channel: 'EMAIL', templateKey: 'notification', status: 'QUEUED', nextAttemptAt: new Date(), idempotencyKey: deliveryKey(key, user._id, 'EMAIL') }));
    }
    if (getSmsProvider() && allowsChannel(user, 'SMS', notification.type) && (await resolvePhone(user))) {
      rows.push(await insertOnce({ ...base, channel: 'SMS', templateKey: 'sms', status: 'QUEUED', nextAttemptAt: new Date(), idempotencyKey: deliveryKey(key, user._id, 'SMS') }));
    }
    return rows.filter(Boolean);
  } catch (error) {
    logger.warn(`Could not queue deliveries for a notification: ${error.message}`);
    return [];
  }
}

/**
 * Queues a security email (password reset / email verification). Returns { queued: false } when no email provider is
 * configured, so callers never claim a message was sent. A newer token supersedes any still-waiting older one.
 */
export async function queueSecurityEmail({ user, kind, link, tokenFingerprint, expiresAt }) {
  if (!getEmailProvider()) return { queued: false, reason: 'email_not_configured' };
  await NotificationDelivery.updateMany(
    { recipientUserId: user._id, category: 'security', templateKey: kind, status: { $in: ['QUEUED', 'RETRYING'] } },
    { $set: { status: 'CANCELLED', lastError: 'superseded' }, $unset: { securePayload: '' } }
  );
  const row = await insertOnce({
    recipientUserId: user._id,
    channel: 'EMAIL',
    category: 'security',
    notificationType: 'auth',
    templateKey: kind,
    status: 'QUEUED',
    nextAttemptAt: new Date(),
    securePayload: seal({ link, expiresAt: expiresAt.toISOString() }),
    idempotencyKey: `auth:${kind}:${user._id}:${sha(tokenFingerprint).slice(0, 24)}`,
  });
  return { queued: Boolean(row) };
}

/* ---------- worker side ---------- */

export const backoffSeconds = (attempt) =>
  Math.min(env.DELIVERY_BACKOFF_MAX_SECONDS, env.DELIVERY_BACKOFF_BASE_SECONDS * 2 ** Math.max(0, attempt - 1));

async function brandName() {
  try {
    return (await SiteSettings.findOne().select('companyName').lean())?.companyName || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Claims one due row. Winning the unique (delivery, attempt) claim row decides which worker may send; the conditional update
 * that follows (same status, attemptCount and lock as read) is a second guard. A lost race just moves on to the next row.
 */
async function claimNext(now) {
  const dueFilter = {
    channel: { $in: ['EMAIL', 'SMS'] },
    $or: [
      { status: { $in: ['QUEUED', 'RETRYING'] }, nextAttemptAt: { $lte: now } },
      { status: 'PROCESSING', lockedUntil: { $lt: now } },
    ],
  };
  for (let tries = 0; tries < 10; tries += 1) {
    const candidate = await NotificationDelivery.findOne(dueFilter).sort({ nextAttemptAt: 1, _id: 1 }).select('status attemptCount retryRound lockedUntil').lean();
    if (!candidate) return null;
    try {
      await NotificationDeliveryClaim.create({ _id: `${candidate._id}:${candidate.retryRound ?? 0}:${candidate.attemptCount + 1}` });
    } catch (error) {
      if (error?.code === 11000) continue; // another worker won this attempt
      throw error;
    }
    const result = await NotificationDelivery.updateOne(
      { _id: candidate._id, status: candidate.status, attemptCount: candidate.attemptCount, ...(candidate.lockedUntil ? { lockedUntil: candidate.lockedUntil } : {}) },
      { $set: { status: 'PROCESSING', lockedUntil: new Date(now.getTime() + env.DELIVERY_LOCK_SECONDS * 1000) }, $inc: { attemptCount: 1 } }
    );
    if (result.modifiedCount === 1) return NotificationDelivery.findById(candidate._id).select('+securePayload');
  }
  return null;
}

/** Moves a claimed row on. The sealed link is dropped on every terminal state and kept only while a retry is pending. */
const finish = (row, set, { keepPayload = false, unset = {} } = {}) =>
  NotificationDelivery.updateOne(
    { _id: row._id, status: 'PROCESSING' },
    { $set: set, $unset: { lockedUntil: '', ...(keepPayload ? {} : { securePayload: '' }), ...unset } }
  );

const cancel = (row, reason) => finish(row, { status: 'CANCELLED', lastError: reason });

/** Handles one claimed row. Exported for tests. */
export async function processClaimed(row, now = new Date()) {
  const provider = row.channel === 'EMAIL' ? getEmailProvider() : getSmsProvider();
  if (!provider) return cancel(row, 'provider_not_configured');
  if (row.attemptCount > env.DELIVERY_MAX_ATTEMPTS) return finish(row, { status: 'FAILED', lastError: 'max_attempts_exceeded' });

  const user = await User.findById(row.recipientUserId).select('firstName role isActive isEmailVerified email phone notificationPreferences').lean();
  if (!user || !user.isActive) return cancel(row, 'recipient_unavailable');
  const isSecurity = row.category === 'security';
  if (!isSecurity && !allowsChannel(user, row.channel, row.notificationType)) return cancel(row, 'preference_disabled');

  let message;
  const brand = await brandName();
  if (row.channel === 'EMAIL') {
    if (!user.email) return finish(row, { status: 'FAILED', lastError: 'no_email_address' });
    if (isSecurity) {
      let payload;
      try {
        payload = open(row.securePayload);
      } catch {
        return finish(row, { status: 'FAILED', lastError: 'payload_unreadable' });
      }
      if (new Date(payload.expiresAt) <= now) return cancel(row, 'link_expired');
      message = { to: user.email, ...renderSecurityEmail({ brand, kind: row.templateKey, recipientName: user.firstName, link: payload.link }) };
    } else {
      message = { to: user.email, ...renderNotificationEmail({ brand, recipientName: user.firstName, title: row.content.title, message: row.content.message, actionPath: row.content.actionPath }) };
    }
  } else {
    const to = await resolvePhone(user);
    if (!to) return cancel(row, 'no_valid_phone');
    message = { to, body: renderSms({ brand, title: row.content.title }) };
  }

  try {
    const result = await provider.send(message);
    return finish(row, { status: 'SENT', provider: provider.name, providerMessageId: result.providerMessageId, sentAt: new Date() }, { unset: { lastError: '', nextAttemptAt: '' } });
  } catch (error) {
    const providerError = error instanceof ProviderError ? error : new ProviderError('unexpected', 'Delivery failed unexpectedly.', { temporary: true });
    const lastError = sanitizeError(providerError);
    logger.warn(`Delivery ${row._id} (${row.channel}) attempt ${row.attemptCount} failed: ${providerError.code}`);
    if (providerError.temporary && row.attemptCount < env.DELIVERY_MAX_ATTEMPTS) {
      return finish(row, { status: 'RETRYING', provider: provider.name, lastError, nextAttemptAt: new Date(now.getTime() + backoffSeconds(row.attemptCount) * 1000) }, { keepPayload: true });
    }
    return finish(row, { status: 'FAILED', provider: provider.name, lastError });
  }
}

/**
 * One worker pass: claims due rows one at a time (atomic findOneAndUpdate, so several workers never send the same row) and
 * processes them. Returns how many were handled.
 */
export async function processDueDeliveries({ limit = env.DELIVERY_BATCH_SIZE, now = new Date() } = {}) {
  let handled = 0;
  while (handled < limit) {
    const row = await claimNext(now);
    if (!row) break;
    try {
      await processClaimed(row, now);
    } catch (error) {
      logger.error(`Delivery ${row._id} could not be processed: ${error.message}`);
    }
    handled += 1;
  }
  return handled;
}

/* ---------- Super Admin visibility ---------- */

const maskEmail = (email) => {
  if (!email || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
};

function presentDelivery(row, user) {
  return {
    id: String(row._id),
    channel: row.channel,
    category: row.category,
    type: row.notificationType ?? null,
    status: row.status,
    provider: row.provider ?? null,
    attemptCount: row.attemptCount,
    maxAttempts: env.DELIVERY_MAX_ATTEMPTS,
    providerMessageId: row.providerMessageId ?? null,
    lastError: row.lastError ?? null,
    nextAttemptAt: row.nextAttemptAt ?? null,
    sentAt: row.sentAt ?? null,
    createdAt: row.createdAt,
    failed: row.status === 'FAILED',
    recipient: user ? { userId: String(user._id), role: user.role, name: `${user.firstName} ${user.lastName}`.trim(), email: row.channel === 'EMAIL' ? maskEmail(user.email) : undefined } : { userId: String(row.recipientUserId) },
  };
}

export async function listDeliveries({ page, limit, channel, status, type, category }) {
  const filter = { ...(channel && { channel }), ...(status && { status }), ...(type && { notificationType: type }), ...(category && { category }) };
  const [rows, total, counts] = await Promise.all([
    NotificationDelivery.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skipFor(page, limit)).limit(limit).lean(),
    NotificationDelivery.countDocuments(filter),
    Promise.all(['QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'RETRYING', 'CANCELLED'].map(async (s) => [s, await NotificationDelivery.countDocuments({ ...(channel && { channel }), status: s })])),
  ]);
  const users = await User.find({ _id: { $in: [...new Set(rows.map((row) => String(row.recipientUserId)))] } }).select('firstName lastName role email').lean();
  const byId = new Map(users.map((user) => [String(user._id), user]));
  return { items: rows.map((row) => presentDelivery(row, byId.get(String(row.recipientUserId)))), pagination: pagination(page, limit, total), counts: Object.fromEntries(counts) };
}

export async function getDelivery(id) {
  const row = await NotificationDelivery.findById(id).lean();
  if (!row) throw ApiError.notFound('Delivery not found.', 'DELIVERY_NOT_FOUND');
  const user = await User.findById(row.recipientUserId).select('firstName lastName role email').lean();
  return presentDelivery(row, user);
}

/** Re-queues a FAILED notification delivery. Security emails are never re-sent: their one-time link is gone by design. */
export async function retryDelivery(id) {
  const row = await NotificationDelivery.findById(id).lean();
  if (!row) throw ApiError.notFound('Delivery not found.', 'DELIVERY_NOT_FOUND');
  if (row.category === 'security') throw ApiError.conflict('Security emails cannot be re-sent. Ask the user to request a new link.', 'DELIVERY_NOT_RETRYABLE');
  const result = await NotificationDelivery.updateOne({ _id: id, status: 'FAILED' }, { $set: { status: 'QUEUED', attemptCount: 0, nextAttemptAt: new Date() }, $inc: { retryRound: 1 }, $unset: { lastError: '' } });
  if (result.matchedCount !== 1) throw ApiError.conflict('Only failed deliveries can be retried.', 'DELIVERY_NOT_RETRYABLE');
  return getDelivery(id);
}


/** Removes claim rows older than a week. Called by the worker about once an hour. */
export async function purgeOldClaims(now = new Date()) {
  const result = await NotificationDeliveryClaim.deleteMany({ createdAt: { $lt: new Date(now.getTime() - 7 * 24 * 3600 * 1000) } });
  return result.deletedCount ?? 0;
}
