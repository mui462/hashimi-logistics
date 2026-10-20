import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { CURRENCIES, PAYMENT_STATUSES, PAYMENT_TYPES } from './enums.js';
import { moneyField, objectIdRef, textField } from './helpers/fields.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';

/**
 * Ledger record only. No payment gateway is connected in Phase 2.
 * `amount` is integer cents in `currency`. A customer_payment belongs to a customer and a
 * carrier_payment to a carrier, so each party's endpoints filter by their own id and type.
 */
const paymentSchema = createSchema(
  {
    loadId: objectIdRef('Load', { required: true, immutable: true }),
    carrierId: objectIdRef('Carrier'),
    customerId: objectIdRef('Customer'),
    amount: moneyField({ required: [true, 'Amount is required.'] }),
    currency: { type: String, enum: CURRENCIES, default: 'USD' },
    paymentType: { type: String, enum: PAYMENT_TYPES, required: [true, 'Payment type is required.'] },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
    paymentDate: Date,
    referenceNumber: textField(100),
    notes: textField(2000, { select: false }),
  },
  { collection: 'payments' }
);

paymentSchema.pre('validate', function applyPaymentRules() {
  if (this.paymentType === 'customer_payment' && !this.customerId) {
    this.invalidate('customerId', 'A customer payment must reference a customer.');
  }
  if (this.paymentType === 'carrier_payment' && !this.carrierId) {
    this.invalidate('carrierId', 'A carrier payment must reference a carrier.');
  }
  if (this.status === 'paid' && !this.paymentDate) {
    this.invalidate('paymentDate', 'A payment date is required once a payment is paid.');
  }
});

paymentSchema.plugin(softDeletePlugin);

paymentSchema.index({ loadId: 1 });
paymentSchema.index({ carrierId: 1, status: 1 });
paymentSchema.index({ customerId: 1, status: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });

export const Payment = mongoose.model('Payment', paymentSchema);
