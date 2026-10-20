import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import {
  AUTHORITY_STATUSES,
  CARRIER_STATUSES,
  COMPLIANCE_STATUSES,
  CURRENCIES,
  EQUIPMENT_TYPES,
} from './enums.js';
import {
  emailField,
  identifierField,
  moneyField,
  objectIdRef,
  operatingRegionsField,
  phoneField,
  requiredText,
  textField,
} from './helpers/fields.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';
import { addressSchema } from './schemas/location.schema.js';

const insuranceSchema = new mongoose.Schema(
  {
    provider: textField(150),
    policyNumber: textField(80),
    liabilityCoverage: moneyField(),
    cargoCoverage: moneyField(),
    currency: { type: String, enum: CURRENCIES, default: 'USD' },
    effectiveDate: Date,
    expirationDate: {
      type: Date,
      validate: {
        validator(value) {
          return !value || !this.effectiveDate || value >= this.effectiveDate;
        },
        message: 'The expiration date cannot be before the effective date.',
      },
    },
  },
  { _id: false }
);

const carrierSchema = createSchema(
  {
    userId: objectIdRef('User', { required: true, unique: true, immutable: true }),
    companyName: requiredText(150, 'Company name'),
    contactPerson: textField(120),
    email: emailField(),
    phone: phoneField(),
    MCNumber: identifierField({ unique: true, sparse: true }),
    DOTNumber: identifierField({ unique: true, sparse: true }),
    address: addressSchema,
    equipmentTypes: [{ type: String, enum: EQUIPMENT_TYPES }],
    operatingRegions: operatingRegionsField(),
    crossBorderCapability: { type: Boolean, default: false },
    insurance: insuranceSchema,
    authorityStatus: { type: String, enum: AUTHORITY_STATUSES, default: 'pending' },
    complianceStatus: { type: String, enum: COMPLIANCE_STATUSES, default: 'pending' },
    documents: [objectIdRef('Document')],
    rating: { type: Number, min: 0, max: 5, select: false },
    status: { type: String, enum: CARRIER_STATUSES, default: 'pending' },
    notes: textField(5000, { select: false }),
  },
  { collection: 'carriers' }
);

carrierSchema.plugin(softDeletePlugin);

carrierSchema.index({ companyName: 1 });
carrierSchema.index({ status: 1, complianceStatus: 1 });
carrierSchema.index({ equipmentTypes: 1 });

export const Carrier = mongoose.model('Carrier', carrierSchema);
