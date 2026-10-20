import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { CURRENCIES, PAYABLE_STATUSES } from './enums.js';
import { moneyField, objectIdRef, textField } from './helpers/fields.js';

/**
 * Amount the company owes an assigned carrier for a load (an obligation, NOT proof that the carrier was paid).
 * `amountPaid` is changed only by the finance payment service from recorded carrier payouts.
 * `amount` comes from the load's server-side carrier rate or an explicit Super Admin entry; it is never derived from the
 * customer charge and no margin is stored or exposed here.
 * `activeLoadKey` is the loadId while the payable is live and `void:<payableId>` once voided; it is unique (no sparse index, so it
 * behaves the same on FerretDB), which guarantees a load has at most one live payable.
 */
const carrierPayableSchema = createSchema(
  {
    payableNumber: { type: String, required: true, immutable: true, trim: true },
    carrierId: objectIdRef('Carrier', { required: true, immutable: true }),
    loadId: objectIdRef('Load', { required: true, immutable: true }),
    shipmentId: objectIdRef('Shipment'),
    currency: { type: String, enum: CURRENCIES, required: true },
    amount: moneyField({ required: true }),
    amountSource: { type: String, enum: ['load_carrier_rate', 'admin_entered'], required: true },
    amountPaid: moneyField({ default: 0 }),
    status: { type: String, enum: PAYABLE_STATUSES, default: 'draft' },
    dueDate: Date,
    approvedAt: Date,
    approvedBy: objectIdRef('User'),
    heldFrom: { type: String, enum: PAYABLE_STATUSES },
    holdReason: textField(500, { select: false }),
    voidedAt: Date,
    voidedBy: objectIdRef('User'),
    voidReason: textField(500),
    adjustmentHistory: {
      type: [
        new mongoose.Schema(
          { from: moneyField(), to: moneyField(), reason: textField(500), by: objectIdRef('User'), at: Date },
          { _id: false }
        ),
      ],
      select: false,
    },
    internalNotes: textField(2000, { select: false }),
    activeLoadKey: { type: String, required: true },
    createdBy: objectIdRef('User', { required: true, immutable: true }),
  },
  { collection: 'carrier_payables', hiddenFromJson: ['activeLoadKey'] }
);

carrierPayableSchema.virtual('outstanding').get(function outstanding() {
  return this.status === 'void' ? 0 : Math.max(0, (this.amount ?? 0) - (this.amountPaid ?? 0));
});

carrierPayableSchema.pre('validate', function applyPayableRules() {
  if (this.amountPaid > this.amount) this.invalidate('amountPaid', 'Amount paid cannot exceed the payable amount.');
});

carrierPayableSchema.index({ payableNumber: 1 }, { unique: true, name: 'payable_number_unique' });
carrierPayableSchema.index({ activeLoadKey: 1 }, { unique: true, name: 'one_live_payable_per_load' });
carrierPayableSchema.index({ carrierId: 1, status: 1, createdAt: -1 });
carrierPayableSchema.index({ status: 1, dueDate: 1 });
carrierPayableSchema.index({ createdAt: -1 });

export const CarrierPayable = mongoose.model('CarrierPayable', carrierPayableSchema);
