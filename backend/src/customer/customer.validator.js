import { z } from 'zod';
import {
  COUNTRIES,
  EQUIPMENT_TYPES,
  NOTIFICATION_TYPES,
  QUOTE_STATUSES,
  SHIPMENT_STATUSES,
  SHIPMENT_TYPES,
} from '../models/enums.js';
import { applyPasswordRules, nameField, passwordField, withoutConfirmation } from '../validators/auth.validator.js';
import { idParamSchema } from '../validators/common.validator.js';

export { idParamSchema };

/* ---------- shared building blocks ---------- */

const text = (max, label = 'This field') =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);

/** Optional text: blank input becomes "absent" so it never overwrites or stores an empty string. */
const optionalText = (max, label) =>
  text(max, label)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

const requiredText = (max, label) => text(max, label).min(1, `${label} is required.`);

const phone = z
  .string()
  .trim()
  .regex(/^[+()\-.\s\d]{7,30}$/, 'Enter a valid phone number.');
const optionalPhone = phone.or(z.literal('')).optional().transform((value) => (value === '' ? undefined : value));
const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address.'));
const optionalEmail = email.or(z.literal('')).optional().transform((value) => (value === '' ? undefined : value));

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date as YYYY-MM-DD.')
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((date) => !Number.isNaN(date.getTime()), 'Enter a valid date.');

const positiveNumber = (label) =>
  z.number({ error: `${label} must be a number.` }).positive(`${label} must be greater than zero.`).max(1e9);
const wholeNumber = (label) =>
  z.number({ error: `${label} must be a number.` }).int(`${label} must be a whole number.`).min(0).max(1e9);

/* ---------- identifiers, pagination ---------- */

const pageQuery = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};

const listQuery = (extra = {}) => z.object({ query: z.object({ ...pageQuery, ...extra }).strict() });

export const listQuotesSchema = listQuery({ status: z.enum(QUOTE_STATUSES).optional() });
export const listShipmentsSchema = listQuery({ status: z.enum(SHIPMENT_STATUSES).optional() });
export const listDocumentsSchema = listQuery();
export const listInvoicesSchema = listQuery();
export const listNotificationsSchema = listQuery({
  type: z.enum(NOTIFICATION_TYPES).optional(),
  unread: z.enum(['true', 'false']).optional(),
});

export const trackingNumberSchema = z.object({
  params: z.object({ trackingNumber: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9-]+$/) }),
});

/* ---------- quote request ---------- */

const stopSchema = z
  .object({
    facilityName: optionalText(150, 'Facility name'),
    street: optionalText(200, 'Street address'),
    city: requiredText(100, 'City'),
    state: optionalText(50, 'State or province'),
    zipCode: optionalText(20, 'Postal code'),
    country: z.enum(COUNTRIES, { error: 'Choose United States, Canada or Mexico.' }),
  })
  .strict();

const dimensionsSchema = z
  .object({
    length: wholeNumberOrDecimal('Length'),
    width: wholeNumberOrDecimal('Width'),
    height: wholeNumberOrDecimal('Height'),
    unit: z.enum(['in', 'cm']).default('in'),
  })
  .strict();

function wholeNumberOrDecimal(label) {
  return z.number({ error: `${label} must be a number.` }).min(0).max(1e6).optional();
}

const temperatureSchema = z
  .object({
    minimum: z.number().min(-100).max(200).optional(),
    maximum: z.number().min(-100).max(200).optional(),
    unit: z.enum(['C', 'F']).default('F'),
    notes: optionalText(300, 'Temperature notes'),
  })
  .strict()
  .refine((value) => value.minimum == null || value.maximum == null || value.maximum >= value.minimum, {
    message: 'The maximum temperature cannot be below the minimum.',
    path: ['maximum'],
  });

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Exactly these fields, nothing else. `.strict()` turns any extra key (customerId, status, quotedRate,
 * internalNotes, estimatedRate, isCrossBorder, role...) into a 422, so a forged owner or status never reaches the model.
 * The customer, quote number, status and cross-border flag are all decided by the server.
 * `contactFields` lets the public (guest) quote form reuse every rule here and add only an optional company name.
 */
const quoteBody = (contactFields = {}) => z
  .object({
    origin: stopSchema,
    destination: stopSchema,
    pickupDate: isoDate,
    deliveryDate: isoDate.optional(),
    shipmentType: z.enum(SHIPMENT_TYPES).optional(),
    equipmentType: z.enum(EQUIPMENT_TYPES, { error: 'Choose an equipment type.' }),
    commodity: requiredText(200, 'Commodity'),
    weight: z
      .object({ value: positiveNumber('Weight'), unit: z.enum(['lb', 'kg']).default('lb') })
      .strict(),
    quantity: wholeNumber('Quantity').optional(),
    pallets: wholeNumber('Pallets').optional(),
    dimensions: dimensionsSchema.optional(),
    temperatureRequirements: temperatureSchema.optional(),
    specialInstructions: optionalText(3000, 'Special requirements'),
    contactInformation: z
      .object({
        name: requiredText(120, 'Contact name'),
        email: email,
        phone: phone,
        ...contactFields,
      })
      .strict(),
  })
  .strict()
  .superRefine((body, context) => {
    if (body.pickupDate < todayUtc()) {
      context.addIssue({ code: 'custom', path: ['pickupDate'], message: 'Pickup date cannot be in the past.' });
    }
    if (body.deliveryDate && body.deliveryDate < body.pickupDate) {
      context.addIssue({
        code: 'custom',
        path: ['deliveryDate'],
        message: 'Delivery date cannot be before the pickup date.',
      });
    }
    const { origin, destination } = body;
    if (origin.country !== destination.country && origin.country !== 'US' && destination.country !== 'US') {
      context.addIssue({
        code: 'custom',
        path: ['destination', 'country'],
        message: 'Cross-border freight must move between the US and Canada, or the US and Mexico.',
      });
    }
  });

export const createQuoteSchema = z.object({ body: quoteBody() });

/** The public website's guest quote request: the same body, plus the requester's optional company name. */
export const publicQuoteSchema = z.object({ body: quoteBody({ company: optionalText(150, 'Company') }) });

/* ---------- profile ---------- */

const addressPatch = z
  .object({
    street: optionalText(200, 'Street address'),
    city: optionalText(100, 'City'),
    state: optionalText(50, 'State or province'),
    zipCode: optionalText(20, 'Postal code'),
    country: z.enum(COUNTRIES).optional(),
  })
  .strict();

/**
 * The only profile fields a customer may change. Everything else (role, accountType, isActive, isEmailVerified,
 * customerId, userId, status, tokenVersion, passwordHash, login email, paymentTermsDays, notes...) is rejected by
 * `.strict()`, not silently dropped, so tests and clients see the refusal.
 * The login email is deliberately absent: changing it needs a re-verification flow that does not exist yet.
 */
export const updateProfileSchema = z.object({
  body: z
    .object({
      firstName: nameField.optional(),
      lastName: nameField.optional(),
      phone: optionalPhone,
      companyName: requiredText(150, 'Company name').optional(),
      contactPerson: optionalText(120, 'Contact person'),
      businessEmail: optionalEmail,
      address: addressPatch.optional(),
      billing: z
        .object({
          contactName: optionalText(120, 'Billing contact'),
          email: optionalEmail,
          phone: optionalPhone,
          address: addressPatch.optional(),
        })
        .strict()
        .optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, { message: 'Provide at least one field to update.' }),
});

export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z.string().min(1, 'Enter your current password.').max(128),
      password: passwordField,
      passwordConfirmation: z.string(),
    })
    .strict()
    .superRefine((data, context) => {
      applyPasswordRules(data, context);
      if (data.password === data.currentPassword) {
        context.addIssue({
          code: 'custom',
          path: ['password'],
          message: 'Choose a password that is different from your current one.',
        });
      }
    })
    .transform(withoutConfirmation),
});

/* ---------- quote responses (Phase 7) ---------- */

export const acceptQuoteSchema = z.object({ params: idParamSchema.shape.params, body: z.object({}).strict() });
export const declineQuoteSchema = z.object({
  params: idParamSchema.shape.params,
  body: z.object({ reason: optionalText(500, 'Reason') }).strict(),
});
