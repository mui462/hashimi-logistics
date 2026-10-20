import { z } from 'zod';
import {
  ACTIVITY_MODULES,
  CARRIER_APPLICATION_STATUSES,
  CARRIER_STATUSES,
  COMPLIANCE_STATUSES,
  CONTACT_INTERESTS,
  CONTACT_MESSAGE_STATUSES,
  CUSTOMER_STATUSES,
  DOCUMENT_TYPES,
  DOCUMENT_VISIBILITIES,
  EQUIPMENT_TYPES,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  RELATED_ENTITY_TYPES,
} from '../models/enums.js';
import { idParamSchema, objectIdSchema } from '../validators/common.validator.js';

export { idParamSchema };

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const search = z.string().trim().min(2, 'Search needs at least 2 characters.').max(60, 'Search must be 60 characters or fewer.');
const boolString = z.enum(['true', 'false']);
const sortOrder = z.enum(['asc', 'desc']).default('desc');
const pageQuery = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
const listQuery = (extra) => z.object({ query: z.object({ ...pageQuery, ...extra }).strict() });

export const customersSchema = listQuery({
  status: z.enum(CUSTOMER_STATUSES).optional(),
  q: search.optional(),
  sort: z.enum(['createdAt', 'companyName']).default('createdAt'),
  order: sortOrder,
});

export const carriersSchema = listQuery({
  status: z.enum(CARRIER_STATUSES).optional(),
  complianceStatus: z.enum(COMPLIANCE_STATUSES).optional(),
  equipmentType: z.enum(EQUIPMENT_TYPES).optional(),
  crossBorder: boolString.optional(),
  q: search.optional(),
  sort: z.enum(['createdAt', 'companyName']).default('createdAt'),
  order: sortOrder,
});

export const applicationsSchema = listQuery({
  status: z.enum(CARRIER_APPLICATION_STATUSES).optional(),
  q: search.optional(),
  sort: z.enum(['createdAt']).default('createdAt'),
  order: sortOrder,
});

export const contactMessagesSchema = listQuery({
  status: z.enum(CONTACT_MESSAGE_STATUSES).optional(),
  interest: z.enum(CONTACT_INTERESTS).optional(),
  q: search.optional(),
  sort: z.enum(['createdAt']).default('createdAt'),
  order: sortOrder,
});

export const documentsSchema = listQuery({
  type: z.enum(DOCUMENT_TYPES).optional(),
  visibility: z.enum(DOCUMENT_VISIBILITIES).optional(),
  relatedEntityType: z.enum(RELATED_ENTITY_TYPES).optional(),
  customerId: objectIdSchema.optional(),
  carrierId: objectIdSchema.optional(),
  // Phase 10 filters.
  status: z.enum(['uploaded', 'archived']).optional(),
  shipmentId: objectIdSchema.optional(),
  loadId: objectIdSchema.optional(),
  uploadedBy: objectIdSchema.optional(),
  createdFrom: day.optional(),
  createdTo: day.optional(),
  q: search.optional(),
  order: sortOrder,
});

export const paymentsSchema = listQuery({
  status: z.enum(PAYMENT_STATUSES).optional(),
  paymentType: z.enum(PAYMENT_TYPES).optional(),
  customerId: objectIdSchema.optional(),
  carrierId: objectIdSchema.optional(),
  loadId: objectIdSchema.optional(),
  createdFrom: day.optional(),
  createdTo: day.optional(),
  order: sortOrder,
});

export const notificationsSchema = listQuery({
  unread: boolString.optional(),
});

export const activityLogsSchema = listQuery({
  action: z.string().trim().min(2).max(100).regex(/^[\w.\- ]+$/, 'Use letters, numbers, dots, dashes and spaces.').optional(),
  module: z.enum(ACTIVITY_MODULES).optional(),
  userId: objectIdSchema.optional(),
  actorType: z.enum(['super_admin', 'customer', 'carrier', 'system']).optional(),
  entityId: objectIdSchema.optional(),
  result: z.enum(['success', 'failure']).optional(),
  from: day.optional(),
  to: day.optional(),
  order: sortOrder,
});

export const emptyQuerySchema = z.object({ query: z.object({}).strict() });
export const searchSchema = z.object({ query: z.object({ q: search }).strict() });

/* ---------- carrier approval (Super Admin writes) ---------- */
const decisionNote = z.string().trim().min(3, 'Give a short reason (at least 3 characters).').max(1000);
export const carrierActionSchema = z.object({ params: z.object({ id: objectIdSchema }), body: z.object({ reason: decisionNote.optional() }).strict() });
export const carrierRejectSchema = z.object({ params: z.object({ id: objectIdSchema }), body: z.object({ reason: decisionNote }).strict() });
export const applicationDecisionSchema = z.object({
  params: z.object({ id: objectIdSchema }),
  body: z
    .object({ decision: z.enum(['under_review', 'approved', 'rejected']), rejectionReason: decisionNote.optional() })
    .strict()
    .superRefine((body, context) => {
      if (body.decision === 'rejected' && !body.rejectionReason) context.addIssue({ code: 'custom', path: ['rejectionReason'], message: 'A rejection reason is required.' });
    }),
});
