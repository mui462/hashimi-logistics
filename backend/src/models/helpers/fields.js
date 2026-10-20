import mongoose from 'mongoose';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+()\-.\s\d]{7,30}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HTTP_URL_PATTERN = /^https?:\/\/\S+$/i;

export const wholeNumberField = (options = {}) => ({
  type: Number,
  min: 0,
  validate: Number.isInteger,
  ...options,
});

/** True for an IANA identifier such as "America/Chicago". Never assumes a default zone. */
export function isIanaTimezone(value) {
  if (value === 'UTC') return true;
  if (typeof value !== 'string' || !/^[A-Za-z]+(?:[/_+-][A-Za-z0-9_+-]+)+$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timezoneField = () => ({
  type: String,
  trim: true,
  validate: { validator: (value) => !value || isIanaTimezone(value), message: 'Use an IANA timezone such as America/Chicago.' },
});

export const operatingRegionsField = () => ({
  type: [textField(100)],
  validate: { validator: (list) => list.length <= 60, message: 'Use 60 regions or fewer.' },
});

export const objectIdRef = (ref, options = {}) => ({
  type: mongoose.Schema.Types.ObjectId,
  ref,
  ...options,
});

export const textField = (maxlength, options = {}) => ({
  type: String,
  trim: true,
  maxlength,
  ...options,
});

export const requiredText = (maxlength, label, options = {}) =>
  textField(maxlength, { required: [true, `${label} is required.`], ...options });

export const emailField = (options = {}) => ({
  type: String,
  trim: true,
  lowercase: true,
  maxlength: 254,
  match: [EMAIL_PATTERN, 'Enter a valid email address.'],
  ...options,
});

export const phoneField = (options = {}) => ({
  type: String,
  trim: true,
  maxlength: 30,
  match: [PHONE_PATTERN, 'Enter a valid phone number.'],
  ...options,
});

export const urlField = (options = {}) => ({
  type: String,
  trim: true,
  maxlength: 2048,
  match: [HTTP_URL_PATTERN, 'Enter a valid http(s) URL.'],
  ...options,
});

export const slugField = (options = {}) => ({
  type: String,
  required: [true, 'Slug is required.'],
  unique: true,
  lowercase: true,
  trim: true,
  maxlength: 160,
  match: [SLUG_PATTERN, 'Slugs may only contain lowercase letters, numbers, and single hyphens.'],
  ...options,
});

/**
 * Regulatory identifiers (MC, DOT). Blank input is stored as "absent" so that the
 * sparse unique index on the Carrier collection never sees an empty-string value.
 */
export const identifierField = (options = {}) => ({
  type: String,
  trim: true,
  uppercase: true,
  maxlength: 20,
  set: (value) => (value === '' ? undefined : value),
  ...options,
});

/**
 * Money is stored as a whole number of minor currency units (cents), never as a
 * floating-point decimal. The currency lives in a sibling `currency` field.
 */
export const moneyField = ({ allowNegative = false, ...options } = {}) => ({
  type: Number,
  ...(allowNegative ? {} : { min: [0, '{PATH} cannot be negative.'] }),
  validate: {
    validator: Number.isSafeInteger,
    message: '{PATH} must be a whole number of minor currency units (cents).',
  },
  ...options,
});
