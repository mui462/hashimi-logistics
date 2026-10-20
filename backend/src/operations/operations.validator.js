import { z } from 'zod';
import {
  CURRENCIES,
  COUNTRIES,
  EQUIPMENT_TYPES,
  EXCEPTION_REASONS,
  LOAD_STATUSES,
  QUOTE_SOURCES,
  QUOTE_STATUSES,
  SHIPMENT_STATUSES,
} from '../models/enums.js';
import { idParamSchema, objectIdSchema } from '../validators/common.validator.js';
import { isValidTimeZone } from '../utils/timezone.js';

export { idParamSchema };

/* ---------- building blocks ---------- */

const text = (max, label = 'This field') => z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);
const nonEmpty = (max, label) => text(max, label).min(1, `${label} is required.`);
const optionalText = (max, label) => text(max, label).optional();
const boolString = z.enum(['true', 'false']);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

/** Integer cents. Floats, strings, negatives and unsafe integers are all refused. */
const cents = (label) => z.number({ error: `${label} must be a number of cents.` }).int(`${label} must be a whole number of cents.`).safe().positive(`${label} must be greater than zero.`);
const currency = z.enum(CURRENCIES);

const timezone = z.string().trim().refine(isValidTimeZone, 'Use an IANA timezone such as America/Chicago.');
/** Absolute instant with an explicit offset or Z, or a wall-clock time that is resolved in the accompanying timezone. */
const instant = z.union([
  z.iso.datetime({ offset: true, error: 'Use an ISO date-time such as 2026-11-03T09:00 or 2026-11-03T15:00:00Z.' }),
  z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/, 'Use an ISO date-time such as 2026-11-03T09:00.'),
]);

const position = z
  .object({
    city: optionalText(100, 'City'),
    state: optionalText(50, 'State'),
    country: z.enum(COUNTRIES).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .strict();

const pageQuery = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
const search = text(60, 'Search').min(2, 'Search needs at least 2 characters.');
const listQuery = (extra) => z.object({ query: z.object({ ...pageQuery, ...extra }).strict() });
const sortOrder = z.enum(['asc', 'desc']).default('desc');
const body = (shape) => z.object({ body: z.object(shape).strict() });
const withId = (shape) => z.object({ params: idParamSchema.shape.params, body: z.object(shape).strict() });

/* ---------- lists ---------- */

export const listQuotesSchema = listQuery({
  status: z.enum(QUOTE_STATUSES).optional(),
  source: z.enum(QUOTE_SOURCES).optional(),
  customerId: objectIdSchema.optional(),
  crossBorder: boolString.optional(),
  equipmentType: z.enum(EQUIPMENT_TYPES).optional(),
  originCountry: z.enum(COUNTRIES).optional(),
  destinationCountry: z.enum(COUNTRIES).optional(),
  q: search.optional(),
  createdFrom: day.optional(),
  createdTo: day.optional(),
  sort: z.enum(['createdAt', 'updatedAt', 'pickupDate']).default('createdAt'),
  order: sortOrder,
});

export const listLoadsSchema = listQuery({
  status: z.enum(LOAD_STATUSES).optional(),
  customerId: objectIdSchema.optional(),
  carrierId: objectIdSchema.optional(),
  equipmentType: z.enum(EQUIPMENT_TYPES).optional(),
  crossBorder: boolString.optional(),
  originCountry: z.enum(COUNTRIES).optional(),
  destinationCountry: z.enum(COUNTRIES).optional(),
  unassigned: boolString.optional(),
  archived: boolString.optional(),
  pickupFrom: day.optional(),
  pickupTo: day.optional(),
  q: search.optional(),
  sort: z.enum(['createdAt', 'updatedAt', 'pickup']).default('createdAt'),
  order: sortOrder,
});

export const listShipmentsSchema = listQuery({
  status: z.enum(SHIPMENT_STATUSES).optional(),
  customerId: objectIdSchema.optional(),
  carrierId: objectIdSchema.optional(),
  crossBorder: boolString.optional(),
  exception: boolString.optional(),
  live: boolString.optional(),
  createdFrom: day.optional(),
  createdTo: day.optional(),
  q: search.optional(),
  sort: z.enum(['createdAt', 'updatedAt']).default('createdAt'),
  order: sortOrder,
});

export const dashboardSchema = z.object({ query: z.object({}).strict() });

/* ---------- quotes ---------- */

export const reviewQuoteSchema = withId({ internalNote: optionalText(2000, 'Note') });
export const startPricingSchema = withId({});
export const quotePricingSchema = withId({
  customerRate: cents('Customer rate'),
  carrierRate: cents('Carrier rate').optional(),
  currency: currency.optional(),
  internalNotes: optionalText(5000, 'Internal notes'),
  allowNegativeMargin: z.boolean().optional(),
});
export const sendQuoteSchema = withId({ validForDays: z.number().int().min(1).max(60).default(7) });
export const cancelSchema = withId({ reason: nonEmpty(500, 'A reason') });
export const quoteNotesSchema = withId({ internalNotes: text(5000, 'Internal notes') });
export const convertQuoteSchema = withId({});
export const expireOverdueSchema = body({});

/* ---------- loads ---------- */

export const updateLoadSchema = z.object({
  params: idParamSchema.shape.params,
  body: z
    .object({
      commodity: nonEmpty(200, 'Commodity').optional(),
      equipmentType: z.enum(EQUIPMENT_TYPES).optional(),
      specialInstructions: optionalText(3000, 'Special instructions'),
      internalNotes: optionalText(5000, 'Internal notes'),
      weight: z.object({ value: z.number().positive().max(1e9), unit: z.enum(['lb', 'kg']) }).strict().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, 'Send at least one field to change.'),
});

export const carrierRateSchema = withId({ carrierRate: cents('Carrier rate'), allowNegativeMargin: z.boolean().optional() });

const windowInput = z.object({ earliest: instant.optional(), latest: instant.optional(), timezone }).strict();
const appointmentInput = z
  .object({ scheduledAt: instant, timezone, confirmationNumber: optionalText(60, 'Confirmation number'), notes: optionalText(500, 'Notes') })
  .strict();

export const scheduleLoadSchema = z.object({
  params: idParamSchema.shape.params,
  body: z
    .object({
      pickup: windowInput.optional(),
      delivery: windowInput.optional(),
      pickupAppointment: appointmentInput.optional(),
      deliveryAppointment: appointmentInput.optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, 'Send at least one schedule field.'),
});

export const openLoadSchema = withId({});
export const carrierSearchSchema = withId({});
export const assignSchema = withId({
  carrierId: objectIdSchema,
  carrierRate: cents('Carrier rate').optional(),
  reason: optionalText(500, 'Reason'),
  allowNegativeMargin: z.boolean().optional(),
});
export const reassignSchema = withId({
  carrierId: objectIdSchema,
  carrierRate: cents('Carrier rate').optional(),
  reason: nonEmpty(500, 'A reason'),
  allowNegativeMargin: z.boolean().optional(),
});
export const unassignSchema = withId({
  reason: nonEmpty(500, 'A reason'),
  returnTo: z.enum(['open', 'carrier_search']).default('carrier_search'),
});
export const archiveSchema = withId({});

/* ---------- shipments ---------- */

export const createShipmentSchema = withId({});

const eventFields = {
  occurredAt: instant.optional(),
  timezone: timezone.optional(),
  location: position.optional(),
  note: optionalText(1000, 'Note'),
};
export const shipmentEventSchema = withId(eventFields);
export const trackingUpdateSchema = withId({ location: position, note: optionalText(1000, 'Note'), occurredAt: instant.optional(), timezone: timezone.optional() });
export const borderEventSchema = withId({
  event: z.enum(['customs_processing', 'border_delayed']),
  ...eventFields,
});
export const raiseExceptionSchema = withId({
  reason: z.enum(EXCEPTION_REASONS),
  note: optionalText(1500, 'Note'),
});
export const resolveExceptionSchema = z.object({
  params: z.object({ id: objectIdSchema, exceptionId: objectIdSchema }),
  body: z.object({ note: optionalText(1500, 'Resolution note') }).strict(),
});
export const cancelShipmentSchema = cancelSchema;
