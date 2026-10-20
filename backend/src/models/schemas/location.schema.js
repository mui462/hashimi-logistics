import mongoose from 'mongoose';
import { COUNTRIES } from '../enums.js';
import { emailField, phoneField, textField, timezoneField } from '../helpers/fields.js';

const countryField = (options = {}) => ({
  type: String,
  enum: { values: COUNTRIES, message: '{PATH} must be one of: US, CA, MX.' },
  uppercase: true,
  trim: true,
  ...options,
});

const addressFields = (required) => ({
  street: textField(200),
  city: textField(100, required ? { required: [true, 'City is required.'] } : {}),
  state: textField(50),
  zipCode: textField(20),
  country: countryField(required ? { required: [true, 'Country is required.'] } : {}),
});

/** A company or contact address. Every part is optional. */
export const addressSchema = new mongoose.Schema(addressFields(false), { _id: false });

/** A shipment stop (origin, destination). City and country are always needed to route freight. */
export const locationSchema = new mongoose.Schema(
  {
    facilityName: textField(150),
    ...addressFields(true),
    contactName: textField(120),
    contactPhone: phoneField(),
    contactEmail: emailField(),
  },
  { _id: false }
);

/** A requested pickup or delivery window. */
export const timeWindowSchema = new mongoose.Schema(
  {
    earliest: Date,
    timezone: timezoneField(),
    latest: {
      type: Date,
      validate: {
        validator(value) {
          return !value || !this.earliest || value >= this.earliest;
        },
        message: 'The latest time cannot be before the earliest time.',
      },
    },
  },
  { _id: false }
);

/** A booked dock appointment. */
export const appointmentSchema = new mongoose.Schema(
  {
    scheduledAt: Date,
    timezone: timezoneField(),
    confirmationNumber: textField(60),
    notes: textField(500),
  },
  { _id: false }
);

/** A point-in-time position reported for a shipment. */
export const positionSchema = new mongoose.Schema(
  {
    city: textField(100),
    state: textField(50),
    country: countryField(),
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
  },
  { _id: false }
);

export { countryField };
