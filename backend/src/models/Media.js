import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { MEDIA_PROVIDERS, MEDIA_TYPES } from './enums.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';
import {
  objectIdRef,
  requiredText,
  textField,
  urlField,
  wholeNumberField,
} from './helpers/fields.js';

const mediaSchema = createSchema(
  {
    fileName: requiredText(255, 'File name'),
    fileUrl: urlField({ required: [true, 'File URL is required.'] }),
    storageKey: requiredText(500, 'Storage key', { unique: true }),
    type: { type: String, enum: MEDIA_TYPES, required: [true, 'Media type is required.'] },
    mimeType: textField(120),
    size: wholeNumberField(),
    altText: textField(200),
    // Phase 9 (additive). `external` = a link to a file hosted elsewhere (nothing was uploaded to this system).
    caption: textField(500),
    width: wholeNumberField({ max: 20000 }),
    height: wholeNumberField({ max: 20000 }),
    provider: { type: String, enum: MEDIA_PROVIDERS, default: 'external' },
    folder: textField(120, { default: 'general' }),
    uploadedBy: objectIdRef('User', { required: true }),
    // Phase 10 (additive). Absent on records registered before storage existed (those are `external` links).
    originalFileName: textField(255),
    duration: { type: Number, min: 0, max: 86400 },
    /** Files this item used to point to. Replacing a file keeps the old stored object; nothing is deleted. */
    previousVersions: {
      type: [{ _id: false, fileUrl: String, storageKey: String, provider: String, size: Number, replacedAt: Date }],
      select: false,
      default: undefined,
    },
  },
  { collection: 'media' }
);

mediaSchema.plugin(softDeletePlugin);

mediaSchema.index({ folder: 1, createdAt: -1 });
mediaSchema.index({ type: 1, createdAt: -1 });

export const Media = mongoose.model('Media', mediaSchema);
