import { z } from 'zod';
import { CONTACT_INTERESTS, EQUIPMENT_TYPES } from '../models/enums.js';

// The guest quote reuses the customer portal's quote rules exactly; tracking reuses the portal's number format.
export { publicQuoteSchema, trackingNumberSchema } from '../customer/customer.validator.js';

/* ---------- shared building blocks (same rules as the portals) ---------- */

const text = (max, label = 'This field') => z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);
const optionalText = (max, label) => text(max, label).optional().transform((value) => (value === '' ? undefined : value));
const requiredText = (max, label) => text(max, label).min(1, `${label} is required.`);
const phone = z.string().trim().regex(/^[+()\-.\s\d]{7,30}$/, 'Enter a valid phone number.');
const optionalPhone = phone.or(z.literal('')).optional().transform((value) => (value === '' ? undefined : value));
const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address.'));
const digits = (label) => z.string().trim().regex(/^\d{1,8}$/, `${label} must be 1 to 8 digits.`);

/** The public form's region choices and the readable label stored on the application for the review team. */
export const OPERATING_REGION_LABELS = Object.freeze({ us_domestic: 'U.S. Domestic', us_canada: 'U.S. ↔ Canada', us_mexico: 'U.S. ↔ Mexico' });

const uniqueList = (item, { min, max, label }) =>
  z
    .array(item)
    .min(min, `Select at least one ${label}.`)
    .max(max)
    .refine((list) => new Set(list).size === list.length, `Each ${label} can be selected once.`);

/**
 * "Become a Carrier". Exactly these fields: `.strict()` turns any extra key (status, carrierId, reviewedBy, notes...) into a
 * 422, so a visitor can never submit an application as already approved. Status, review fields and the carrier link are
 * always decided by the server and the Super Admin.
 */
export const carrierApplicationSchema = z.object({
  body: z
    .object({
      companyName: requiredText(150, 'Company name'),
      contactPerson: requiredText(120, 'Contact person'),
      email,
      phone,
      mcNumber: digits('MC number'),
      dotNumber: digits('DOT number'),
      address: requiredText(200, 'Address'),
      equipmentTypes: uniqueList(z.enum(EQUIPMENT_TYPES, { error: 'Choose an equipment type from the list.' }), { min: 1, max: EQUIPMENT_TYPES.length, label: 'equipment type' }),
      operatingRegions: uniqueList(z.enum(Object.keys(OPERATING_REGION_LABELS), { error: 'Choose an operating region from the list.' }), { min: 1, max: 3, label: 'operating region' }),
      crossBorder: z.enum(['yes', 'no'], { error: 'Cross-border capability is required.' }),
      notes: optionalText(2000, 'Additional notes'),
    })
    .strict(),
});

/** Public contact form. Exactly these fields; status and handling are set by the server. */
export const contactMessageSchema = z.object({
  body: z
    .object({
      name: requiredText(120, 'Name'),
      company: optionalText(150, 'Company'),
      email,
      phone: optionalPhone,
      interest: z.enum(CONTACT_INTERESTS, { error: 'Interest is required.' }),
      subject: requiredText(150, 'Subject'),
      message: requiredText(3000, 'Message'),
    })
    .strict(),
});
