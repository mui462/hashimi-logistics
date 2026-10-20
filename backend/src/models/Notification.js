import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { ENTITY_MODEL_NAMES, NOTIFICATION_ENTITY_TYPES, NOTIFICATION_TYPES } from './enums.js';
import { objectIdRef, requiredText } from './helpers/fields.js';

const relatedEntitySchema = new mongoose.Schema(
  {
    entityType: { type: String, enum: NOTIFICATION_ENTITY_TYPES, required: true },
    entityId: objectIdRef(
      function resolveRelatedModel() {
        return ENTITY_MODEL_NAMES[this.entityType];
      },
      { required: true }
    ),
  },
  { _id: false }
);

/** Always scoped by `recipientId`; a user only ever queries their own notifications. */
const notificationSchema = createSchema(
  {
    recipientId: objectIdRef('User', { required: true, immutable: true }),
    type: { type: String, enum: NOTIFICATION_TYPES, required: [true, 'Notification type is required.'] },
    title: requiredText(150, 'Title'),
    message: requiredText(1000, 'Message'),
    relatedEntity: relatedEntitySchema,
    isRead: { type: Boolean, default: false },
  },
  { collection: 'notifications', timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
