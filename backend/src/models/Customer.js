import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { CUSTOMER_STATUSES } from './enums.js';
import {
  emailField,
  objectIdRef,
  phoneField,
  requiredText,
  textField,
  wholeNumberField,
} from './helpers/fields.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';
import { addressSchema } from './schemas/location.schema.js';

const billingInformationSchema = new mongoose.Schema(
  {
    contactName: textField(120),
    email: emailField(),
    phone: phoneField(),
    address: addressSchema,
    paymentTermsDays: wholeNumberField({ max: 180 }),
  },
  { _id: false }
);

/**
 * Business profile for a customer account. Login credentials stay on User; `email` here is
 * the business contact address and may differ from the login email.
 */
const customerSchema = createSchema(
  {
    userId: objectIdRef('User', { required: true, unique: true, immutable: true }),
    companyName: requiredText(150, 'Company name'),
    contactPerson: textField(120),
    email: emailField(),
    phone: phoneField(),
    address: addressSchema,
    billingInformation: billingInformationSchema,
    status: { type: String, enum: CUSTOMER_STATUSES, default: 'active' },
    notes: textField(5000, { select: false }),
  },
  { collection: 'customers' }
);

customerSchema.plugin(softDeletePlugin);

customerSchema.index({ companyName: 1 });
customerSchema.index({ email: 1 });
customerSchema.index({ status: 1, createdAt: -1 });

export const Customer = mongoose.model('Customer', customerSchema);
