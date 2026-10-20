import net from 'node:net';
import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { ACTIVITY_MODULES } from './enums.js';
import { objectIdRef, requiredText, textField } from './helpers/fields.js';
import { appendOnlyPlugin } from './plugins/appendOnly.plugin.js';

const SENSITIVE_KEY_PATTERN =
  /pass(word)?|secret|token|authorization|cookie|api[-_]?key|credential|hash|private[-_]?key/i;
const MAX_METADATA_DEPTH = 6;

function findSensitiveKey(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > MAX_METADATA_DEPTH) return null;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) return key;
    const nested = findSensitiveKey(child, depth + 1);
    if (nested) return nested;
  }
  return null;
}

/**
 * Append-only audit trail. Entries cannot be edited, and `metadata` is rejected if it contains
 * a key that looks like a password, token, secret, or credential.
 * `userId` is optional so system actions and failed sign-ins can be recorded.
 */
const activityLogSchema = createSchema(
  {
    userId: objectIdRef('User'),
    action: requiredText(100, 'Action'),
    module: { type: String, enum: ACTIVITY_MODULES, required: [true, 'Module is required.'] },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    description: textField(1000),
    IPAddress: textField(45, {
      validate: { validator: (value) => !value || net.isIP(value) !== 0, message: 'Enter a valid IP address.' },
    }),
    userAgent: textField(500),
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      validate: {
        validator: (value) => findSensitiveKey(value) === null,
        message: 'Metadata must not contain passwords, tokens, secrets, or credentials.',
      },
    },
  },
  { collection: 'activity_logs', timestamps: { createdAt: true, updatedAt: false } }
);

activityLogSchema.plugin(appendOnlyPlugin);

activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ module: 1, createdAt: -1 });
activityLogSchema.index({ entityId: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });

export const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
