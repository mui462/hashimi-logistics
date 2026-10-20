import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { DELIVERY_CATEGORIES, DELIVERY_CHANNELS, DELIVERY_STATUSES, NOTIFICATION_TYPES } from './enums.js';
import { objectIdRef } from './helpers/fields.js';

/**
 * The delivery outbox: one row per (event, recipient, channel). The request that caused the event only inserts rows; the
 * worker (npm run worker) is the only thing that talks to an email or SMS provider.
 *
 * Never stored here: passwords, provider credentials, raw reset/verification tokens, the recipient's address or phone (the
 * worker reads the current address from the user at send time). The one exception is `securePayload`: for security emails the
 * one-time link has to survive until the worker sends it, so it is stored AES-256-GCM encrypted and is removed as soon as the
 * row reaches SENT, FAILED or CANCELLED. It is `select: false` and never serialized.
 */
const deliverySchema = createSchema(
  {
    notificationId: objectIdRef('Notification'),
    recipientUserId: objectIdRef('User', { required: true, immutable: true }),
    channel: { type: String, enum: DELIVERY_CHANNELS, required: true },
    category: { type: String, enum: DELIVERY_CATEGORIES, default: 'notification' },
    notificationType: { type: String, enum: [...NOTIFICATION_TYPES, 'auth'] },
    templateKey: { type: String, trim: true, maxlength: 60 },
    // Non-secret, already role-safe content shown to the recipient (the same text as the in-app notification).
    content: {
      title: { type: String, maxlength: 150 },
      message: { type: String, maxlength: 1000 },
      actionPath: { type: String, maxlength: 200 },
    },
    securePayload: { type: String, select: false },
    provider: { type: String, trim: true, maxlength: 30 },
    status: { type: String, enum: DELIVERY_STATUSES, default: 'QUEUED', required: true },
    attemptCount: { type: Number, default: 0, min: 0 },
    // Bumped when the Super Admin re-queues a FAILED row, so each round gets its own worker claims.
    retryRound: { type: Number, default: 0, min: 0 },
    providerMessageId: { type: String, trim: true, maxlength: 200 },
    lastError: { type: String, maxlength: 300 },
    nextAttemptAt: { type: Date },
    sentAt: { type: Date },
    lockedUntil: { type: Date },
    idempotencyKey: { type: String, required: true, unique: true, maxlength: 300 },
  },
  { collection: 'notification_deliveries', timestamps: true }
);

deliverySchema.index({ status: 1, nextAttemptAt: 1 });
deliverySchema.index({ status: 1, lockedUntil: 1 });
deliverySchema.index({ createdAt: -1 });
deliverySchema.index({ recipientUserId: 1, createdAt: -1 });

export const NotificationDelivery = mongoose.model('NotificationDelivery', deliverySchema);
