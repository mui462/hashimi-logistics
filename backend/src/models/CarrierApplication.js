import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { CARRIER_APPLICATION_STATUSES, EQUIPMENT_TYPES } from './enums.js';
import {
  emailField,
  identifierField,
  objectIdRef,
  operatingRegionsField,
  phoneField,
  requiredText,
  textField,
} from './helpers/fields.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';
import { addressSchema } from './schemas/location.schema.js';

/**
 * A public "Become a Carrier" submission. Applicants have no account yet, so there is no
 * userId; `carrierId` is filled in when the Super Admin approves and a Carrier is created.
 * Several applications may exist for the same MC/DOT number (for example after a rejection),
 * so those indexes are intentionally not unique.
 */
const carrierApplicationSchema = createSchema(
  {
    companyName: requiredText(150, 'Company name'),
    contactPerson: requiredText(120, 'Contact person'),
    email: emailField({ required: [true, 'Email is required.'] }),
    phone: phoneField({ required: [true, 'Phone number is required.'] }),
    address: addressSchema,
    MCNumber: identifierField(),
    DOTNumber: identifierField(),
    equipmentTypes: [{ type: String, enum: EQUIPMENT_TYPES }],
    operatingRegions: operatingRegionsField(),
    crossBorderCapability: { type: Boolean, default: false },
    submittedDocuments: [objectIdRef('Document')],
    status: { type: String, enum: CARRIER_APPLICATION_STATUSES, default: 'pending' },
    reviewedBy: objectIdRef('User'),
    reviewedAt: Date,
    rejectionReason: textField(1000),
    applicantNotes: textField(2000),
    carrierId: objectIdRef('Carrier'),
    notes: textField(5000, { select: false }),
  },
  { collection: 'carrier_applications' }
);

carrierApplicationSchema.pre('validate', function requireReviewDetails() {
  const isDecided = this.status === 'approved' || this.status === 'rejected';
  if (isDecided && !this.reviewedBy) this.invalidate('reviewedBy', 'A reviewer is required for a decision.');
  if (isDecided && !this.reviewedAt) this.invalidate('reviewedAt', 'A review date is required for a decision.');
  if (this.status === 'rejected' && !this.rejectionReason) {
    this.invalidate('rejectionReason', 'A rejection reason is required.');
  }
});

carrierApplicationSchema.plugin(softDeletePlugin);

carrierApplicationSchema.index({ status: 1, createdAt: -1 });
carrierApplicationSchema.index({ email: 1 });
carrierApplicationSchema.index({ MCNumber: 1 });
carrierApplicationSchema.index({ DOTNumber: 1 });

export const CarrierApplication = mongoose.model('CarrierApplication', carrierApplicationSchema);
