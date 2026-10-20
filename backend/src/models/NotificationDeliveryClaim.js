import mongoose from 'mongoose';

/**
 * One row per (delivery, attempt number). The worker inserts it before sending; the primary-key uniqueness guarantees that
 * exactly one worker wins each attempt, even on a database whose conditional updates are not strictly isolated.
 * Rows only exist to lose races against; the worker deletes old ones (purgeOldClaims). No TTL index is used so the model
 * also works on databases that do not implement expireAfterSeconds.
 */
const claimSchema = new mongoose.Schema(
  { _id: { type: String, required: true }, createdAt: { type: Date, default: Date.now, index: true } },
  { collection: 'notification_delivery_claims', versionKey: false }
);

export const NotificationDeliveryClaim = mongoose.model('NotificationDeliveryClaim', claimSchema);
