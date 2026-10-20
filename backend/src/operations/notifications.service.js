import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { ACCOUNT_TYPES } from '../utils/constants.js';
import { logger } from '../utils/logger.js';
import { enqueueForNotification } from '../notifications/delivery.service.js';

/**
 * Creates the in-app notification, then queues EMAIL / SMS deliveries for it (Phase 11, notifications/delivery.service.js).
 * Nothing here calls a provider: the worker sends queued rows later. `eventKey` makes a repeated trigger of the same event
 * (for example a double-clicked accept) queue only one email or SMS per recipient and channel.
 * Like the audit log, a notification failure never breaks the business action.
 *
 * Writers must keep customer messages free of carrier identity and rates, and carrier messages free of customer
 * identity and rates. Messages are built from load/shipment numbers and city-level lanes only.
 */
export async function notifyUser(recipientId, { type, title, message, entityType, entityId, eventKey }) {
  if (!recipientId) return null;
  try {
    const notification = await Notification.create({
      recipientId,
      type,
      title,
      message,
      ...(entityType && entityId ? { relatedEntity: { entityType, entityId } } : {}),
    });
    await enqueueForNotification({ notification, eventKey });
    return notification;
  } catch (error) {
    logger.warn(`Could not create notification "${title}": ${error.message}`);
    return null;
  }
}

export async function notifySuperAdmins(payload) {
  try {
    const admins = await User.find({ role: ACCOUNT_TYPES.SUPER_ADMIN, isActive: true }).select('_id').lean();
    await Promise.all(admins.map((admin) => notifyUser(admin._id, payload)));
  } catch (error) {
    logger.warn(`Could not notify super admins: ${error.message}`);
  }
}
