import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { SOCIAL_PLATFORMS, WEEKDAYS } from './enums.js';
import { emailField, phoneField, requiredText, textField, urlField } from './helpers/fields.js';
import { addressSchema } from './schemas/location.schema.js';
import { buttonSchema, mediaAssetSchema } from './schemas/cms.schema.js';
import { seoSchema } from './schemas/seo.schema.js';
import { HEX_COLOR, NAVBAR_APPEARANCE_SPEC } from '../cms/navbarAppearance.js';
import { THEME_APPEARANCE_SPEC } from '../cms/themeAppearance.js';

const themePath = (field) =>
  field.type === 'color'
    ? { type: String, trim: true, match: [HEX_COLOR, 'Use a #RRGGBB colour.'] }
    : field.type === 'enum'
      ? { type: String, enum: field.options }
      : { type: Number, min: field.min, max: field.max, validate: { validator: Number.isInteger, message: 'Use a whole number.' } };

/** Public website theme (Website CMS -> Website theme). Unset means the default neutral palette. */
const themeAppearanceSchema = new mongoose.Schema(
  Object.fromEntries(
    Object.entries(THEME_APPEARANCE_SPEC).map(([group, fields]) => [
      group,
      new mongoose.Schema(Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, themePath(field)])), { _id: false }),
    ])
  ),
  { _id: false }
);

const appearancePath = (field) =>
  field.type === 'color'
    ? { type: String, trim: true, match: [HEX_COLOR, 'Use a #RRGGBB colour.'] }
    : field.type === 'number'
      ? { type: Number, min: field.min, max: field.max, validate: { validator: Number.isInteger, message: 'Use a whole number.' } }
      : { type: Boolean };

/** Website navbar colours and behaviour (Website CMS -> Navbar appearance). Unset means the approved defaults apply. */
const navbarAppearanceSchema = new mongoose.Schema(
  Object.fromEntries(
    Object.entries(NAVBAR_APPEARANCE_SPEC).map(([group, fields]) => [
      group,
      new mongoose.Schema(Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, appearancePath(field)])), { _id: false }),
    ])
  ),
  { _id: false }
);

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const businessHoursSchema = new mongoose.Schema(
  {
    day: { type: String, enum: WEEKDAYS, required: true },
    isClosed: { type: Boolean, default: false },
    opensAt: textField(5, { match: [TIME_PATTERN, 'Use 24-hour HH:mm.'] }),
    closesAt: textField(5, { match: [TIME_PATTERN, 'Use 24-hour HH:mm.'] }),
  },
  { _id: false }
);

const socialLinkSchema = new mongoose.Schema(
  {
    platform: { type: String, enum: SOCIAL_PLATFORMS, required: true },
    url: urlField({ required: true }),
  },
  { _id: false }
);

function isValidTimezone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * Exactly one document may exist. `key` has a single allowed value and a unique index, so a
 * second document is rejected by the database. Use SiteSettings.getPrimary().
 * Phone, email, address, and hours are left empty until the client supplies real details.
 */
const siteSettingsSchema = createSchema(
  {
    key: { type: String, enum: ['primary'], default: 'primary', unique: true, immutable: true },
    companyName: requiredText(150, 'Company name', { default: 'HASHIMI LOGISTICS INC.' }),
    logo: mediaAssetSchema,
    favicon: mediaAssetSchema,
    websiteTitle: textField(120),
    // Phase 9 (additive).
    shortName: textField(60),
    primaryCta: buttonSchema,
    footerText: textField(500),
    canonicalBaseUrl: urlField(),
    tagline: textField(200, { default: 'Freight Brokerage & Transportation Solutions' }),
    description: textField(500),
    phone: phoneField(),
    email: emailField(),
    address: addressSchema,
    businessHours: {
      type: [businessHoursSchema],
      validate: {
        validator: (rows) => new Set(rows.map((row) => row.day)).size === rows.length,
        message: 'Each weekday may appear only once.',
      },
    },
    socialLinks: [socialLinkSchema],
    defaultSEO: seoSchema,
    copyrightText: textField(200),
    timezone: textField(60, {
      validate: { validator: (value) => !value || isValidTimezone(value), message: 'Enter a valid IANA timezone.' },
    }),
    navbarAppearance: navbarAppearanceSchema,
    themeAppearance: themeAppearanceSchema,
  },
  { collection: 'site_settings' }
);

siteSettingsSchema.static('getPrimary', function getPrimary() {
  return this.findOneAndUpdate(
    { key: 'primary' },
    { $setOnInsert: { key: 'primary' } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
});

export const SiteSettings = mongoose.model('SiteSettings', siteSettingsSchema);
