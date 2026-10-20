import { z } from 'zod';
import { DOCUMENT_TYPES, DOCUMENT_VISIBILITIES } from '../models/enums.js';
import { idParamSchema, objectIdSchema } from '../validators/common.validator.js';
import { CARRIER_UPLOAD_TYPES } from './document.service.js';

export { idParamSchema };

const plain = (max) =>
  z.string().trim().min(1).max(max).refine((value) => !/[<>\u0000-\u001f]/.test(value), 'Use plain text without markup.');
const fileName = plain(255);
const UPLOADABLE_ENTITY_TYPES = ['shipment', 'load', 'quote', 'payment', 'customer', 'carrier'];
const boolString = z.enum(['true', 'false']);

/** Uploads send the file as the raw body; everything else is a strict query string. Unknown keys (customerId, role, storageKey...) are a 400. */
export const adminUploadSchema = z.object({
  query: z
    .object({
      fileName,
      type: z.enum(DOCUMENT_TYPES),
      relatedEntityType: z.enum(UPLOADABLE_ENTITY_TYPES),
      relatedEntityId: objectIdSchema,
      visibility: z.enum(DOCUMENT_VISIBILITIES).default('private'),
      name: plain(200).optional(),
    })
    .strict(),
});

export const carrierPodSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  query: z.object({ fileName, replace: boolString.default('false') }).strict(),
});

export const carrierDocumentUploadSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  query: z.object({ fileName, type: z.enum(CARRIER_UPLOAD_TYPES), name: plain(200).optional() }).strict(),
});

export const adminUpdateSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z
    .object({
      name: plain(200).optional(),
      type: z.enum(DOCUMENT_TYPES).optional(),
      visibility: z.enum(DOCUMENT_VISIBILITIES).optional(),
      relatedEntityType: z.enum(UPLOADABLE_ENTITY_TYPES).optional(),
      relatedEntityId: objectIdSchema.optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, 'Nothing to change.')
    .refine((body) => Boolean(body.relatedEntityType) === Boolean(body.relatedEntityId), 'Send the related record type and id together.'),
});

export const accessSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  query: z.object({ disposition: z.enum(['inline', 'attachment']).default('attachment') }).strict(),
});
