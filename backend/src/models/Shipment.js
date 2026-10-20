import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import {
  BORDER_EVENT_TYPES,
  BORDER_STATUSES,
  EXCEPTION_REASONS,
  SHIPMENT_STATUSES,
} from './enums.js';
import { objectIdRef, requiredText, textField } from './helpers/fields.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';
import { positionSchema } from './schemas/location.schema.js';

const trackingEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: SHIPMENT_STATUSES, required: [true, 'Event status is required.'] },
    location: positionSchema,
    description: textField(1000),
    timestamp: { type: Date, default: Date.now, required: true },
    createdBy: objectIdRef('User'),
  },
  { _id: true }
);

const borderEventSchema = new mongoose.Schema(
  {
    event: { type: String, enum: BORDER_EVENT_TYPES, required: [true, 'Border event is required.'] },
    location: positionSchema,
    description: textField(1000),
    timestamp: { type: Date, default: Date.now, required: true },
    createdBy: objectIdRef('User'),
  },
  { _id: true }
);

const exceptionSchema = new mongoose.Schema(
  {
    reason: { type: String, enum: EXCEPTION_REASONS, required: [true, 'An exception reason is required.'] },
    /** Operational note. Internal: never presented to customers or carriers. */
    description: textField(1500),
    reportedAt: { type: Date, default: Date.now },
    reportedBy: objectIdRef('User'),
    /** The status the shipment returns to when the exception is resolved. */
    resumeStatus: { type: String, enum: SHIPMENT_STATUSES },
    resolvedAt: Date,
    resolvedBy: objectIdRef('User'),
    resolutionNote: textField(1500),
  },
  { _id: true }
);

const BORDER_ONLY_STATUSES = ['at_border', 'border_cleared'];

/**
 * Domestic shipments keep borderStatus = "not_applicable" and carry no border events.
 * Cross-border shipments use the same record with borderStatus and borderEvents.
 * Tracking arrays grow over a shipment's life but stay small (tens of events), so they are embedded.
 */
const shipmentSchema = createSchema(
  {
    trackingNumber: requiredText(40, 'Tracking number', { unique: true, immutable: true }),
    shipmentNumber: requiredText(40, 'Shipment number', { unique: true, sparse: true, immutable: true, required: false }),
    quoteId: objectIdRef('QuoteRequest', { immutable: true }),
    createdBy: objectIdRef('User', { select: false }),
    updatedBy: objectIdRef('User', { select: false }),
    loadId: objectIdRef('Load', { required: true, unique: true, immutable: true }),
    customerId: objectIdRef('Customer', { required: true, immutable: true }),
    carrierId: objectIdRef('Carrier'),
    currentLocation: positionSchema,
    status: { type: String, enum: SHIPMENT_STATUSES, default: 'booked' },
    estimatedPickup: Date,
    actualPickup: Date,
    estimatedDelivery: Date,
    actualDelivery: Date,
    trackingEvents: [trackingEventSchema],
    borderStatus: { type: String, enum: BORDER_STATUSES, default: 'not_applicable' },
    borderEvents: [borderEventSchema],
    exception: exceptionSchema,
    /** Full exception history, oldest first. `exception` is the most recent one. */
    exceptions: [exceptionSchema],
    completedAt: Date,
    cancelledAt: Date,
  },
  { collection: 'shipments' }
);

shipmentSchema.pre('validate', function applyTrackingRules() {
  if (this.borderStatus === 'not_applicable') {
    if (this.borderEvents.length > 0) {
      this.invalidate('borderEvents', 'A domestic shipment cannot have border events.');
    }
    const usesBorderStatus =
      BORDER_ONLY_STATUSES.includes(this.status) ||
      this.trackingEvents.some((event) => BORDER_ONLY_STATUSES.includes(event.status));
    if (usesBorderStatus) {
      this.invalidate('borderStatus', 'Border statuses require a cross-border shipment.');
    }
  }

  if (this.status === 'exception' && !this.exception) {
    this.invalidate('exception', 'Exception details are required when the status is "exception".');
  }

  if (this.estimatedPickup && this.estimatedDelivery && this.estimatedDelivery < this.estimatedPickup) {
    this.invalidate('estimatedDelivery', 'Estimated delivery cannot be before estimated pickup.');
  }
});

shipmentSchema.plugin(softDeletePlugin);

shipmentSchema.index({ customerId: 1, createdAt: -1 });
shipmentSchema.index({ carrierId: 1, status: 1 });
shipmentSchema.index({ status: 1, createdAt: -1 });
shipmentSchema.index({ customerId: 1, status: 1 });

export const Shipment = mongoose.model('Shipment', shipmentSchema);
