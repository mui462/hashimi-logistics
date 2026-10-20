import { z } from 'zod';
import { COUNTRIES, EQUIPMENT_TYPES, LOAD_STATUSES, NOTIFICATION_TYPES, PAYMENT_STATUSES, SHIPMENT_STATUSES } from '../models/enums.js';
import { applyPasswordRules, nameField, passwordField, withoutConfirmation } from '../validators/auth.validator.js';
import { idParamSchema } from '../validators/common.validator.js';

export { idParamSchema };

const text = (max, label = 'This field') => z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);
const optionalText = (max, label) =>
  text(max, label)
    .optional()
    .transform((value) => (value === '' ? undefined : value));
const requiredText = (max, label) => text(max, label).min(1, `${label} is required.`);

const phone = z.string().trim().regex(/^[+()\-.\s\d]{7,30}$/, 'Enter a valid phone number.');
const optionalPhone = phone.or(z.literal('')).optional().transform((value) => (value === '' ? undefined : value));
const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address.'));
const optionalEmail = email.or(z.literal('')).optional().transform((value) => (value === '' ? undefined : value));

const pageQuery = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};
// `.strict()` makes a forged carrierId / userId / ownerId in the query string a 400, not a silent no-op.
const listQuery = (extra = {}) => z.object({ query: z.object({ ...pageQuery, ...extra }).strict() });

export const listLoadsSchema = listQuery({ equipmentType: z.enum(EQUIPMENT_TYPES).optional() });
export const listMyLoadsSchema = listQuery({ status: z.enum(LOAD_STATUSES).optional() });
export const listShipmentsSchema = listQuery({ status: z.enum(SHIPMENT_STATUSES).optional() });
export const listDocumentsSchema = listQuery();
export const listPaymentsSchema = listQuery({ status: z.enum(PAYMENT_STATUSES).optional() });
export const listNotificationsSchema = listQuery({
  type: z.enum(NOTIFICATION_TYPES).optional(),
  unread: z.enum(['true', 'false']).optional(),
});

export const trackingNumberSchema = z.object({
  params: z.object({ trackingNumber: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9-]+$/) }),
});

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
 * The only profile fields a carrier may change. Everything else is rejected with 422 by `.strict()`:
 * MCNumber, DOTNumber, authorityStatus, complianceStatus, status, rating, notes, insurance, documents, userId,
 * role, login email, tokenVersion, passwordHash. Authority and compliance are decided by staff, and the login
 * email needs a re-verification flow that does not exist yet.
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
      equipmentTypes: z.array(z.enum(EQUIPMENT_TYPES)).max(EQUIPMENT_TYPES.length).optional(),
      operatingRegions: z.array(requiredText(100, 'Region')).max(60).optional(),
      crossBorderCapability: z.boolean().optional(),
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
