import { ActivityLog } from '../models/ActivityLog.js';
import { Carrier } from '../models/Carrier.js';
import { CarrierApplication } from '../models/CarrierApplication.js';
import { ContactMessage } from '../models/ContactMessage.js';
import { Customer } from '../models/Customer.js';
import { Document } from '../models/Document.js';
import { Load } from '../models/Load.js';
import { Notification } from '../models/Notification.js';
import { Payment } from '../models/Payment.js';
import { QuoteRequest } from '../models/QuoteRequest.js';
import { Shipment } from '../models/Shipment.js';
import { SiteSettings } from '../models/SiteSettings.js';
import { User } from '../models/User.js';
import { selectionFor } from '../models/accessProjections.js';
import { env } from '../config/env.js';
import { recordActivity } from '../services/activity.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ACCOUNT_TYPES } from '../utils/constants.js';
import { escapeRegex, pagination, skipFor } from '../operations/common.js';
import {
  presentActivity,
  presentApplication,
  presentContactMessage,
  presentCarrier,
  presentCustomer,
  presentDocument,
  presentNotification,
  presentPayment,
  presentSettings,
  resultOf,
} from './admin.presenters.js';

const ADMIN = ACCOUNT_TYPES.SUPER_ADMIN;
const dayStart = (value) => new Date(`${value}T00:00:00.000Z`);
const dayEnd = (value) => new Date(`${value}T23:59:59.999Z`);
const regex = (text) => new RegExp(escapeRegex(text), 'i');
const range = (from, to) => (from || to ? { ...(from ? { $gte: dayStart(from) } : {}), ...(to ? { $lte: dayEnd(to) } : {}) } : undefined);
const FAILURE_PATTERN = /fail|denied|reject|error|locked/i;
const direction = (order) => (order === 'asc' ? 1 : -1);

async function mapBy(Model, ids, fields) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const rows = await Model.find({ _id: { $in: unique } }).select(fields).lean();
  return new Map(rows.map((row) => [String(row._id), row]));
}

const findOrThrow = async (query, label) => {
  const found = await query;
  if (!found) throw ApiError.notFound(`${label} not found.`, 'NOT_FOUND');
  return found;
};

const userName = (user) => (user ? { id: String(user._id), name: `${user.firstName} ${user.lastName}`.trim(), email: user.email, role: user.role } : null);

/* ---------- overview & search ---------- */

export async function getOverview(adminUserId) {
  const [customers, carriers, applications, unreadNotifications] = await Promise.all([
    Customer.aggregate([{ $match: { archivedAt: null } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Carrier.aggregate([{ $match: { archivedAt: null } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    CarrierApplication.aggregate([{ $match: { archivedAt: null } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Notification.countDocuments({ recipientId: adminUserId, isRead: false }),
  ]);
  const fold = (rows) => ({ total: rows.reduce((sum, row) => sum + row.count, 0), ...Object.fromEntries(rows.map((row) => [row._id, row.count])) });
  return { customers: fold(customers), carriers: fold(carriers), applications: fold(applications), unreadNotifications };
}

export async function search(q) {
  const pattern = regex(q);
  const prefix = new RegExp(`^${escapeRegex(q)}`, 'i');
  const [quotes, loads, shipments, customers, carriers] = await Promise.all([
    QuoteRequest.find({ archivedAt: null, quoteNumber: prefix }).select('quoteNumber status').limit(5).lean(),
    Load.find({ archivedAt: null, loadNumber: prefix }).select('loadNumber status').limit(5).lean(),
    Shipment.find({ archivedAt: null, $or: [{ shipmentNumber: prefix }, { trackingNumber: prefix }] }).select('shipmentNumber trackingNumber status').limit(5).lean(),
    Customer.find({ archivedAt: null, $or: [{ companyName: pattern }, { email: pattern }] }).select('companyName email').limit(5).lean(),
    Carrier.find({ archivedAt: null, $or: [{ companyName: pattern }, { MCNumber: prefix }, { DOTNumber: prefix }] }).select('companyName MCNumber DOTNumber').limit(5).lean(),
  ]);
  const results = [
    ...quotes.map((row) => ({ type: 'quote', id: String(row._id), label: row.quoteNumber, detail: row.status })),
    ...loads.map((row) => ({ type: 'load', id: String(row._id), label: row.loadNumber, detail: row.status })),
    ...shipments.map((row) => ({ type: 'shipment', id: String(row._id), label: row.shipmentNumber, detail: row.trackingNumber })),
    ...customers.map((row) => ({ type: 'customer', id: String(row._id), label: row.companyName, detail: row.email ?? null })),
    ...carriers.map((row) => ({ type: 'carrier', id: String(row._id), label: row.companyName, detail: row.MCNumber ? `MC ${row.MCNumber}` : row.DOTNumber ? `DOT ${row.DOTNumber}` : null })),
  ];
  return { query: q, results };
}

/* ---------- customers ---------- */

export async function listCustomers({ page, limit, status, q, sort, order }) {
  const filter = { archivedAt: null };
  if (status) filter.status = status;
  if (q) filter.$or = [{ companyName: regex(q) }, { contactPerson: regex(q) }, { email: regex(q) }];
  const [rows, total] = await Promise.all([
    Customer.find(filter).sort({ [sort]: direction(order), _id: direction(order) }).skip(skipFor(page, limit)).limit(limit).lean(),
    Customer.countDocuments(filter),
  ]);
  return { items: rows.map((row) => presentCustomer(row)), pagination: pagination(page, limit, total) };
}

export async function getCustomer(customerId) {
  const customer = await findOrThrow(Customer.findOne({ _id: customerId, archivedAt: null }).select(selectionFor('Customer', ADMIN)).lean(), 'Customer');
  const [user, quotes, loads, shipments, recentQuotes] = await Promise.all([
    User.findById(customer.userId).select('email isActive isEmailVerified lastLogin createdAt').lean(),
    QuoteRequest.countDocuments({ customerId, archivedAt: null }),
    Load.countDocuments({ customerId, archivedAt: null }),
    Shipment.countDocuments({ customerId, archivedAt: null }),
    QuoteRequest.find({ customerId, archivedAt: null }).select('quoteNumber status createdAt').sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  return {
    customer: {
      ...presentCustomer(customer, { user, counts: { quotes, loads, shipments }, detail: true }),
      recentQuotes: recentQuotes.map((quote) => ({ id: String(quote._id), quoteNumber: quote.quoteNumber, status: quote.status, createdAt: quote.createdAt.toISOString() })),
    },
  };
}

/* ---------- carriers ---------- */

export async function listCarriers({ page, limit, status, complianceStatus, equipmentType, crossBorder, q, sort, order }) {
  const filter = { archivedAt: null };
  if (status) filter.status = status;
  if (complianceStatus) filter.complianceStatus = complianceStatus;
  if (equipmentType) filter.equipmentTypes = equipmentType;
  if (crossBorder) filter.crossBorderCapability = crossBorder === 'true';
  if (q) filter.$or = [{ companyName: regex(q) }, { contactPerson: regex(q) }, { email: regex(q) }, { MCNumber: regex(q) }, { DOTNumber: regex(q) }];
  const [rows, total] = await Promise.all([
    Carrier.find(filter).sort({ [sort]: direction(order), _id: direction(order) }).skip(skipFor(page, limit)).limit(limit).lean(),
    Carrier.countDocuments(filter),
  ]);
  return { items: rows.map((row) => presentCarrier(row)), pagination: pagination(page, limit, total) };
}

export async function getCarrier(carrierId) {
  const carrier = await findOrThrow(Carrier.findOne({ _id: carrierId, archivedAt: null }).select(selectionFor('Carrier', ADMIN)).lean(), 'Carrier');
  const [user, loads, active, completed, recentLoads] = await Promise.all([
    User.findById(carrier.userId).select('email isActive isEmailVerified lastLogin createdAt').lean(),
    Load.countDocuments({ carrierId, archivedAt: null }),
    Load.countDocuments({ carrierId, archivedAt: null, status: { $in: ['assigned', 'dispatched', 'picked_up', 'in_transit'] } }),
    Load.countDocuments({ carrierId, archivedAt: null, status: { $in: ['delivered', 'completed'] } }),
    Load.find({ carrierId, archivedAt: null }).select('loadNumber status createdAt').sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  return {
    carrier: {
      ...presentCarrier(carrier, { user, counts: { loads, active, completed }, detail: true }),
      recentLoads: recentLoads.map((load) => ({ id: String(load._id), loadNumber: load.loadNumber, status: load.status, createdAt: load.createdAt.toISOString() })),
    },
  };
}

/* ---------- carrier applications ---------- */

export async function listApplications({ page, limit, status, q, sort, order }) {
  const filter = { archivedAt: null };
  if (status) filter.status = status;
  if (q) filter.$or = [{ companyName: regex(q) }, { contactPerson: regex(q) }, { email: regex(q) }, { MCNumber: regex(q) }, { DOTNumber: regex(q) }];
  const [rows, total] = await Promise.all([
    CarrierApplication.find(filter).sort({ [sort]: direction(order), _id: direction(order) }).skip(skipFor(page, limit)).limit(limit).lean(),
    CarrierApplication.countDocuments(filter),
  ]);
  return { items: rows.map((row) => presentApplication(row)), pagination: pagination(page, limit, total) };
}

export async function getApplication(applicationId) {
  const application = await findOrThrow(
    CarrierApplication.findOne({ _id: applicationId, archivedAt: null }).select(selectionFor('CarrierApplication', ADMIN)).lean(),
    'Application'
  );
  const reviewer = application.reviewedBy ? userName(await User.findById(application.reviewedBy).select('firstName lastName email role').lean()) : null;
  return { application: presentApplication(application, { detail: true, reviewer }) };
}

/* ---------- website contact messages ---------- */

export async function listContactMessages({ page, limit, status, interest, q, sort, order }) {
  const filter = { archivedAt: null };
  if (status) filter.status = status;
  if (interest) filter.interest = interest;
  if (q) filter.$or = [{ name: regex(q) }, { company: regex(q) }, { email: regex(q) }, { subject: regex(q) }];
  const [rows, total] = await Promise.all([
    ContactMessage.find(filter).select('-message').sort({ [sort]: direction(order), _id: direction(order) }).skip(skipFor(page, limit)).limit(limit).lean(),
    ContactMessage.countDocuments(filter),
  ]);
  return { items: rows.map((row) => presentContactMessage(row)), pagination: pagination(page, limit, total) };
}

export async function getContactMessage(messageId) {
  const message = await findOrThrow(
    ContactMessage.findOne({ _id: messageId, archivedAt: null }).select(selectionFor('ContactMessage', ADMIN)).lean(),
    'Message'
  );
  const handler = message.handledBy ? userName(await User.findById(message.handledBy).select('firstName lastName email role').lean()) : null;
  return { message: presentContactMessage(message, { detail: true, handler }) };
}

/** Marks a message handled (or back to new). Only the status and who/when change; the visitor's words are never edited. */
export async function setContactMessageStatus(messageId, status, actor, context) {
  const changes = status === 'handled' ? { status, handledBy: actor._id, handledAt: new Date() } : { status, handledBy: null, handledAt: null };
  const updated = await ContactMessage.findOneAndUpdate({ _id: messageId, archivedAt: null }, { $set: changes }, { returnDocument: 'after' }).select('_id').lean();
  if (!updated) throw ApiError.notFound('Message not found.', 'NOT_FOUND');
  await recordActivity({ userId: actor._id, action: `admin.contact_message.${status}`, module: 'contact_messages', entityId: updated._id, description: `A contact message was marked ${status}.`, context });
  return getContactMessage(messageId);
}

/* ---------- documents ---------- */

export async function listDocuments({ page, limit, type, visibility, relatedEntityType, customerId, carrierId, status, shipmentId, loadId, uploadedBy, createdFrom, createdTo, q, order }) {
  const filter = { archivedAt: status === 'archived' ? { $ne: null } : null };
  if (type) filter.type = type;
  if (visibility) filter.visibility = visibility;
  if (relatedEntityType) filter.relatedEntityType = relatedEntityType;
  if (customerId) filter.customerId = customerId;
  if (carrierId) filter.carrierId = carrierId;
  if (uploadedBy) filter.uploadedBy = uploadedBy;
  if (q) filter.name = regex(q);
  const created = range(createdFrom, createdTo);
  if (created) filter.createdAt = created;
  // A shipment or load filter matches documents attached to it directly or through the shipment/load it belongs to.
  const entityClauses = [];
  if (shipmentId) {
    const shipment = await Shipment.findById(shipmentId).select('loadId').lean();
    entityClauses.push({ relatedEntityType: 'shipment', relatedEntityId: shipmentId });
    if (shipment?.loadId && !loadId) entityClauses.push({ relatedEntityType: 'load', relatedEntityId: shipment.loadId });
  }
  if (loadId) {
    const shipment = await Shipment.findOne({ loadId }).select('_id').lean();
    entityClauses.push({ relatedEntityType: 'load', relatedEntityId: loadId });
    if (shipment) entityClauses.push({ relatedEntityType: 'shipment', relatedEntityId: shipment._id });
  }
  if (entityClauses.length) filter.$or = entityClauses;
  const [rows, total] = await Promise.all([
    Document.find(filter).sort({ createdAt: direction(order), _id: direction(order) }).skip(skipFor(page, limit)).limit(limit).lean(),
    Document.countDocuments(filter),
  ]);
  return { items: await presentDocuments(rows), pagination: pagination(page, limit, total) };
}

const RELATED_LABELS = {
  shipment: { Model: Shipment, field: 'trackingNumber', path: 'shipments' },
  load: { Model: Load, field: 'loadNumber', path: 'loads' },
  quote: { Model: QuoteRequest, field: 'quoteNumber', path: 'quotes' },
  customer: { Model: Customer, field: 'companyName', path: 'customers' },
  carrier: { Model: Carrier, field: 'companyName', path: 'carriers' },
};

async function relatedFor(rows) {
  const out = new Map();
  await Promise.all(
    Object.entries(RELATED_LABELS).map(async ([type, { Model, field }]) => {
      const ids = rows.filter((row) => row.relatedEntityType === type).map((row) => row.relatedEntityId);
      const found = await mapBy(Model, ids, field);
      for (const [key, value] of found) out.set(`${type}:${key}`, value[field]);
    })
  );
  return (row) => {
    const config = RELATED_LABELS[row.relatedEntityType];
    const label = out.get(`${row.relatedEntityType}:${row.relatedEntityId}`);
    return config && label ? { type: row.relatedEntityType, id: String(row.relatedEntityId), label, path: `/admin/${config.path}/${row.relatedEntityId}` } : null;
  };
}

export async function presentDocuments(rows) {
  const [customers, carriers, users, relatedOf] = await Promise.all([
    mapBy(Customer, rows.map((row) => row.customerId), 'companyName'),
    mapBy(Carrier, rows.map((row) => row.carrierId), 'companyName'),
    mapBy(User, rows.map((row) => row.uploadedBy), 'firstName lastName email role'),
    relatedFor(rows),
  ]);
  return rows.map((row) =>
    presentDocument(row, {
      customer: customers.get(String(row.customerId)),
      carrier: carriers.get(String(row.carrierId)),
      uploader: userName(users.get(String(row.uploadedBy))),
      related: relatedOf(row),
    })
  );
}

/** Archived documents stay readable here (restore needs them); customers and carriers never see them. */
export async function getDocument(documentId) {
  // storageKey is intentionally not selected: the admin API never reveals where a file lives.
  const document = await findOrThrow(Document.findOne({ _id: documentId }).lean(), 'Document');
  const [presented] = await presentDocuments([document]);
  return { document: presented };
}

/* ---------- payments ---------- */

export async function listPayments({ page, limit, status, paymentType, customerId, carrierId, loadId, createdFrom, createdTo, order }) {
  const filter = { archivedAt: null };
  if (status) filter.status = status;
  if (paymentType) filter.paymentType = paymentType;
  if (customerId) filter.customerId = customerId;
  if (carrierId) filter.carrierId = carrierId;
  if (loadId) filter.loadId = loadId;
  const created = range(createdFrom, createdTo);
  if (created) filter.createdAt = created;
  const [rows, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: direction(order), _id: direction(order) }).skip(skipFor(page, limit)).limit(limit).lean(),
    Payment.countDocuments(filter),
  ]);
  return { items: await presentPayments(rows), pagination: pagination(page, limit, total) };
}

async function presentPayments(rows, detail = false) {
  const [loads, customers, carriers] = await Promise.all([
    mapBy(Load, rows.map((row) => row.loadId), 'loadNumber'),
    mapBy(Customer, rows.map((row) => row.customerId), 'companyName'),
    mapBy(Carrier, rows.map((row) => row.carrierId), 'companyName'),
  ]);
  return rows.map((row) =>
    presentPayment(row, { load: loads.get(String(row.loadId)), customer: customers.get(String(row.customerId)), carrier: carriers.get(String(row.carrierId)), detail })
  );
}

export async function getPayment(paymentId) {
  const payment = await findOrThrow(Payment.findOne({ _id: paymentId, archivedAt: null }).select(selectionFor('Payment', ADMIN)).lean(), 'Payment');
  const [presented] = await presentPayments([payment], true);
  return { payment: presented };
}

/* ---------- notifications (the signed-in admin's own) ---------- */

export async function listNotifications(adminUserId, { page, limit, unread }) {
  const filter = { recipientId: adminUserId };
  if (unread === 'true') filter.isRead = false;
  const [rows, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skipFor(page, limit)).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipientId: adminUserId, isRead: false }),
  ]);
  return { items: rows.map(presentNotification), unreadCount, pagination: pagination(page, limit, total) };
}

export async function markNotificationRead(adminUserId, notificationId) {
  const updated = await Notification.findOneAndUpdate({ _id: notificationId, recipientId: adminUserId }, { $set: { isRead: true } }, { returnDocument: 'after' }).lean();
  if (!updated) throw ApiError.notFound('Notification not found.', 'NOT_FOUND');
  return { notification: presentNotification(updated) };
}

/* ---------- activity logs & security ---------- */

const ACTOR_LOOKUP_CAP = 2000;

export async function listActivity({ page, limit, action, module, userId, actorType, entityId, result, from, to, order }) {
  const filter = {};
  const and = [];
  if (action) and.push({ action: regex(action) });
  if (result) and.push({ action: result === 'failure' ? FAILURE_PATTERN : { $not: FAILURE_PATTERN } });
  if (and.length) filter.$and = and;
  if (module) filter.module = module;
  if (userId) filter.userId = userId;
  if (actorType === 'system') filter.userId = null;
  else if (actorType) {
    // Entries by every account of one kind. Bounded so a huge user table can never make this query unbounded.
    const accounts = await User.find({ role: actorType }).select('_id').limit(ACTOR_LOOKUP_CAP).lean();
    const ids = accounts.map((account) => account._id);
    filter.userId = userId ? { $in: ids.filter((id) => String(id) === String(userId)) } : { $in: ids };
  }
  if (entityId) filter.entityId = entityId;
  const created = range(from, to);
  if (created) filter.createdAt = created;
  const [rows, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: direction(order), _id: direction(order) }).skip(skipFor(page, limit)).limit(limit).lean(),
    ActivityLog.countDocuments(filter),
  ]);
  const users = await mapBy(User, rows.map((row) => row.userId), 'firstName lastName email role');
  return {
    items: rows.map((row) => presentActivity(row, { actor: userName(users.get(String(row.userId))) })),
    pagination: pagination(page, limit, total),
  };
}

export async function getSecurity(adminUserId, now = new Date()) {
  const since24h = new Date(now.getTime() - 24 * 3600 * 1000);
  const since7d = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const count = (action, since) => ActivityLog.countDocuments({ action, createdAt: { $gte: since } });
  const [admin, superAdmins, failed24, failed7, success24, success7, resets7, changes7, recent] = await Promise.all([
    User.findById(adminUserId).select('firstName lastName email role isEmailVerified lastLogin createdAt').lean(),
    User.countDocuments({ role: ADMIN }),
    count('auth.login.failed', since24h),
    count('auth.login.failed', since7d),
    count('auth.login.success', since24h),
    count('auth.login.success', since7d),
    count('auth.password_reset.completed', since7d),
    ActivityLog.countDocuments({ action: /password\.changed$/, createdAt: { $gte: since7d } }),
    ActivityLog.find({ module: 'auth' }).sort({ createdAt: -1, _id: -1 }).limit(15).lean(),
  ]);
  const users = await mapBy(User, recent.map((row) => row.userId), 'firstName lastName email role');
  return {
    generatedAt: now.toISOString(),
    account: {
      name: `${admin.firstName} ${admin.lastName}`.trim(),
      email: admin.email,
      role: admin.role,
      isEmailVerified: Boolean(admin.isEmailVerified),
      lastLogin: admin.lastLogin ? admin.lastLogin.toISOString() : null,
      superAdminAccounts: superAdmins,
    },
    authEvents: {
      failedSignIns: { last24Hours: failed24, last7Days: failed7 },
      successfulSignIns: { last24Hours: success24, last7Days: success7 },
      passwordResetsCompleted: { last7Days: resets7 },
      passwordsChanged: { last7Days: changes7 },
    },
    session: {
      lifetime: env.JWT_EXPIRES_IN,
      storage: 'HttpOnly cookie (not readable by page scripts)',
      sameSite: env.COOKIE_SAME_SITE,
      secureCookie: env.NODE_ENV === 'production',
      signInRateLimit: { maxAttempts: env.AUTH_RATE_LIMIT_MAX, windowMinutes: env.AUTH_RATE_LIMIT_WINDOW_MINUTES },
    },
    unavailable: ['Two-factor authentication', 'Active session list', 'Remote sign-out of other sessions', 'IP allow-listing', 'Account lockout reports'],
    recentAuthEvents: recent.map((row) => ({
      id: String(row._id),
      createdAt: row.createdAt.toISOString(),
      action: row.action,
      result: resultOf(row.action),
      actor: userName(users.get(String(row.userId))),
      ipAddress: row.IPAddress ?? null,
    })),
  };
}

/* ---------- settings ---------- */

export async function getSettings() {
  // Read-only: a GET never creates the settings document.
  const settings = await SiteSettings.findOne({ key: 'primary' }).lean();
  return { settings: presentSettings(settings), configured: Boolean(settings) };
}
