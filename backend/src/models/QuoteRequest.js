import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import {
  CURRENCIES,
  CUSTOMS_STATUSES,
  EQUIPMENT_TYPES,
  QUOTE_SOURCES,
  QUOTE_STATUSES,
  SHIPMENT_TYPES,
} from './enums.js';
import { crossesBorder, isSupportedCrossBorderLane } from './helpers/crossBorder.js';
import {
  emailField,
  moneyField,
  objectIdRef,
  phoneField,
  requiredText,
  textField,
  wholeNumberField,
} from './helpers/fields.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';
import { countryField, locationSchema } from './schemas/location.schema.js';
import { dimensionsSchema, temperatureSchema, weightSchema } from './schemas/measurements.schema.js';

const contactInformationSchema = new mongoose.Schema(
  {
    name: textField(120),
    company: textField(150),
    email: emailField(),
    phone: phoneField(),
  },
  { _id: false }
);

/**
 * Ownership: `customerId` is always set by the server from the authenticated customer.
 * It must never be copied from a request body.
 * `source` says where the request came from: `customer` (portal, always has a customerId) or `public` (a guest on the
 * website, no account, so no customerId; the guest's name, email and phone in `contactInformation` are required instead).
 * Internal fields (`internalNotes`, `estimatedRate`, `assignedTo`) are `select: false`.
 */
const quoteRequestSchema = createSchema(
  {
    quoteNumber: requiredText(40, 'Quote number', { unique: true, immutable: true }),
    customerId: objectIdRef('Customer', { immutable: true }),
    source: { type: String, enum: QUOTE_SOURCES, default: 'customer', immutable: true },
    origin: { type: locationSchema, required: [true, 'Origin is required.'] },
    destination: { type: locationSchema, required: [true, 'Destination is required.'] },
    pickupDate: { type: Date, required: [true, 'Pickup date is required.'] },
    deliveryDate: Date,
    shipmentType: { type: String, enum: SHIPMENT_TYPES },
    equipmentType: { type: String, enum: EQUIPMENT_TYPES },
    commodity: requiredText(200, 'Commodity'),
    weight: weightSchema,
    quantity: wholeNumberField(),
    pallets: wholeNumberField(),
    dimensions: dimensionsSchema,
    temperatureRequirements: temperatureSchema,
    isCrossBorder: { type: Boolean, default: false },
    originCountry: countryField(),
    destinationCountry: countryField(),
    borderCrossing: textField(150),
    customsStatus: { type: String, enum: CUSTOMS_STATUSES },
    specialInstructions: textField(3000),
    contactInformation: contactInformationSchema,
    attachments: [objectIdRef('Document')],
    assignedTo: objectIdRef('User', { select: false }),
    estimatedRate: moneyField({ select: false }),
    quotedRate: moneyField(),
    brokerMargin: moneyField({ allowNegative: true, select: false }),
    quotedAt: Date,
    quoteExpiresAt: Date,
    acceptedAt: Date,
    declinedAt: Date,
    convertedAt: Date,
    loadId: objectIdRef('Load'),
    reviewedBy: objectIdRef('User', { select: false }),
    cancelledReason: textField(500, { select: false }),
    currency: { type: String, enum: CURRENCIES, default: 'USD' },
    status: { type: String, enum: QUOTE_STATUSES, default: 'new' },
    internalNotes: textField(5000, { select: false }),
    createdBy: objectIdRef('User', { select: false }),
    updatedBy: objectIdRef('User', { select: false }),
  },
  { collection: 'quote_requests' }
);

quoteRequestSchema.pre('validate', function requireOwnerOrGuestContact() {
  if (this.source === 'public') {
    for (const key of ['name', 'email', 'phone']) {
      if (!this.contactInformation?.[key]) this.invalidate(`contactInformation.${key}`, 'Guest quote requests need a contact name, email and phone.');
    }
  } else if (!this.customerId) {
    this.invalidate('customerId', 'Path `customerId` is required.');
  }
});

quoteRequestSchema.pre('validate', function applyLaneRules() {
  this.originCountry ??= this.origin?.country;
  this.destinationCountry ??= this.destination?.country;

  if (this.origin?.country && this.originCountry !== this.origin.country) {
    this.invalidate('originCountry', 'Origin country must match the origin address.');
  }
  if (this.destination?.country && this.destinationCountry !== this.destination.country) {
    this.invalidate('destinationCountry', 'Destination country must match the destination address.');
  }

  if (this.isCrossBorder) {
    if (!isSupportedCrossBorderLane(this.originCountry, this.destinationCountry)) {
      this.invalidate(
        'isCrossBorder',
        'Cross-border freight must move between the US and Canada, or the US and Mexico.'
      );
    }
    this.customsStatus ??= 'not_started';
  } else {
    if (crossesBorder(this.originCountry, this.destinationCountry)) {
      this.invalidate('isCrossBorder', 'Origin and destination countries differ, so this is cross-border freight.');
    }
    this.customsStatus = 'not_applicable';
    this.borderCrossing = undefined;
  }

  if (this.deliveryDate && this.pickupDate && this.deliveryDate < this.pickupDate) {
    this.invalidate('deliveryDate', 'Delivery date cannot be before the pickup date.');
  }
});

quoteRequestSchema.plugin(softDeletePlugin);

quoteRequestSchema.index({ customerId: 1, createdAt: -1 });
quoteRequestSchema.index({ status: 1, createdAt: -1 });
quoteRequestSchema.index({ source: 1, createdAt: -1 });
quoteRequestSchema.index({ createdAt: -1 });
quoteRequestSchema.index({ pickupDate: 1 });
// One load per quote, enforced by the database as the last line of defence against double conversion.
quoteRequestSchema.index({ loadId: 1 }, { unique: true, sparse: true });

export const QuoteRequest = mongoose.model('QuoteRequest', quoteRequestSchema);
