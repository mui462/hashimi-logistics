import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import {
  DOCUMENT_STORAGE_PROVIDERS,
  DOCUMENT_TYPES,
  DOCUMENT_VISIBILITIES,
  ENTITY_MODEL_NAMES,
  RELATED_ENTITY_TYPES,
} from './enums.js';
import {
  objectIdRef,
  requiredText,
  textField,
  urlField,
  wholeNumberField,
} from './helpers/fields.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MIME_PATTERN = /^[\w.+-]+\/[\w.+-]+$/;

/**
 * Metadata for a stored file. No file bytes live in MongoDB; files live in the configured storage provider
 * (Phase 10: see storage/). `fileUrl` is the provider's own reference. For private documents it is not a usable link:
 * it never reaches an API, and access always goes through a short-lived, server-issued link after an authorization check.
 *
 * Visibility:
 *   private  uploader and Super Admin
 *   customer the owning customer (`customerId`), the uploader, and Super Admin
 *   carrier  the owning carrier (`carrierId`), the uploader, and Super Admin
 *   admin    Super Admin only
 *   shared   the owning customer AND the owning carrier, and Super Admin (for example a proof of delivery)
 *
 * `customerId` / `carrierId` are denormalized owners, set by the server from the related
 * entity, so ownership checks are a direct query instead of a multi-collection lookup.
 */
const documentSchema = createSchema(
  {
    name: requiredText(200, 'Document name'),
    type: { type: String, enum: DOCUMENT_TYPES, required: [true, 'Document type is required.'] },
    fileUrl: urlField({ required: [true, 'File URL is required.'] }),
    storageKey: requiredText(500, 'Storage key', { select: false }),
    fileSize: wholeNumberField({ max: [MAX_FILE_SIZE_BYTES, 'Files may be at most 50 MB.'] }),
    mimeType: textField(120, { match: [MIME_PATTERN, 'Enter a valid MIME type such as application/pdf.'] }),
    uploadedBy: objectIdRef('User', { required: true, immutable: true }),
    relatedEntityType: {
      type: String,
      enum: RELATED_ENTITY_TYPES,
      required: [true, 'Related entity type is required.'],
    },
    relatedEntityId: objectIdRef(
      function resolveRelatedModel() {
        return ENTITY_MODEL_NAMES[this.relatedEntityType];
      },
      { required: [true, 'Related entity is required.'] }
    ),
    customerId: objectIdRef('Customer'),
    carrierId: objectIdRef('Carrier'),
    visibility: { type: String, enum: DOCUMENT_VISIBILITIES, default: 'private' },
    // Phase 10 (additive). Absent on records created before storage existed.
    storageProvider: { type: String, enum: DOCUMENT_STORAGE_PROVIDERS },
    originalFileName: textField(255),
    uploadedByRole: { type: String, enum: ['super_admin', 'customer', 'carrier'] },
    /** The one proof of delivery (or other main document) shown first; further files are supporting documents. */
    isPrimary: { type: Boolean, default: false },
    /** Set when this file replaced an earlier one: the earlier document is archived, never deleted. */
    replacesDocumentId: objectIdRef('Document'),
  },
  { collection: 'documents' }
);

documentSchema.plugin(softDeletePlugin);

documentSchema.index({ relatedEntityType: 1, relatedEntityId: 1 });
documentSchema.index({ customerId: 1, visibility: 1 });
documentSchema.index({ carrierId: 1, visibility: 1 });
documentSchema.index({ uploadedBy: 1, createdAt: -1 });
documentSchema.index({ type: 1, relatedEntityType: 1, relatedEntityId: 1, archivedAt: 1 });

export const Document = mongoose.model('Document', documentSchema);
