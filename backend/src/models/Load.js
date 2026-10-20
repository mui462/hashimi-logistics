import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import {
  CURRENCIES,
  EQUIPMENT_TYPES,
  LOAD_STATUSES,
  LOAD_STATUSES_REQUIRING_CARRIER,
} from './enums.js';
import { crossesBorder, isSupportedCrossBorderLane } from './helpers/crossBorder.js';
import { moneyField, objectIdRef, requiredText, textField } from './helpers/fields.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';
import { appointmentSchema, locationSchema, timeWindowSchema } from './schemas/location.schema.js';
import { weightSchema } from './schemas/measurements.schema.js';

/**
 * Money fields (all integer cents, in `currency`):
 *   rate        what the customer pays
 *   carrierRate what the carrier is paid
 *   brokerMargin = rate - carrierRate (computed on validation; may be negative)
 * All three are `select: false`: customer endpoints opt in to `rate`, carrier endpoints to
 * `carrierRate`, and only the Super Admin sees `brokerMargin`. See accessProjections.js.
 */
const loadSchema = createSchema(
  {
    loadNumber: requiredText(40, 'Load number', { unique: true, immutable: true }),
    quoteId: objectIdRef('QuoteRequest', { immutable: true }),
    customerId: objectIdRef('Customer', { required: true, immutable: true }),
    carrierId: objectIdRef('Carrier'),
    origin: { type: locationSchema, required: [true, 'Origin is required.'] },
    destination: { type: locationSchema, required: [true, 'Destination is required.'] },
    pickup: timeWindowSchema,
    delivery: timeWindowSchema,
    equipmentType: { type: String, enum: EQUIPMENT_TYPES },
    commodity: requiredText(200, 'Commodity'),
    weight: weightSchema,
    rate: moneyField({ select: false }),
    carrierRate: moneyField({ select: false }),
    brokerMargin: moneyField({ allowNegative: true, select: false }),
    currency: { type: String, enum: CURRENCIES, default: 'USD' },
    pickupAppointment: appointmentSchema,
    deliveryAppointment: appointmentSchema,
    specialInstructions: textField(3000),
    documents: [objectIdRef('Document')],
    status: { type: String, enum: LOAD_STATUSES, default: 'open' },
    assignedBy: objectIdRef('User', { select: false }),
    /** Stored copy of "origin and destination countries differ", so lists can filter domestic vs cross-border. */
    crossBorder: { type: Boolean, default: false },
    internalNotes: textField(5000, { select: false }),
    cancelledReason: textField(500, { select: false }),
    /** Every assignment, oldest first. Never overwritten: reassignment closes the open entry and appends a new one. */
    assignmentHistory: {
      type: [
        new mongoose.Schema(
          {
            carrierId: objectIdRef('Carrier', { required: true }),
            assignedAt: { type: Date, required: true },
            assignedBy: objectIdRef('User'),
            unassignedAt: Date,
            unassignedBy: objectIdRef('User'),
            reason: textField(500),
          },
          { _id: false }
        ),
      ],
      select: false,
    },
    createdBy: objectIdRef('User', { select: false }),
    updatedBy: objectIdRef('User', { select: false }),
    convertedBy: objectIdRef('User', { select: false }),
  },
  { collection: 'loads' }
);

loadSchema.virtual('isCrossBorder').get(function isCrossBorder() {
  return crossesBorder(this.origin?.country, this.destination?.country);
});

loadSchema.pre('validate', function applyBusinessRules() {
  this.crossBorder = this.isCrossBorder;
  if (this.isCrossBorder && !isSupportedCrossBorderLane(this.origin.country, this.destination.country)) {
    this.invalidate(
      'destination.country',
      'Cross-border freight must move between the US and Canada, or the US and Mexico.'
    );
  }

  if (LOAD_STATUSES_REQUIRING_CARRIER.includes(this.status) && !this.carrierId) {
    this.invalidate('carrierId', `A carrier is required once a load is ${this.status}.`);
  }

  if (this.rate != null && this.carrierRate != null) {
    this.brokerMargin = this.rate - this.carrierRate;
  }
});

loadSchema.plugin(softDeletePlugin);

loadSchema.index({ customerId: 1, createdAt: -1 });
loadSchema.index({ carrierId: 1, status: 1 });
loadSchema.index({ status: 1, createdAt: -1 });
loadSchema.index({ quoteId: 1 }, { unique: true, sparse: true });
loadSchema.index({ crossBorder: 1, status: 1 });
loadSchema.index({ 'pickup.earliest': 1 });
loadSchema.index({ 'origin.country': 1, 'destination.country': 1 });

export const Load = mongoose.model('Load', loadSchema);
