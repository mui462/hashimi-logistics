import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import {
  CURRENCIES,
  TRANSACTION_CONFIRMATIONS,
  TRANSACTION_ENTRY_TYPES,
  TRANSACTION_KINDS,
  TRANSACTION_METHODS,
  TRANSACTION_SOURCES,
  TRANSACTION_STATUSES,
} from './enums.js';
import { moneyField, objectIdRef, textField } from './helpers/fields.js';

/**
 * Append-only financial ledger entry for Phase 12: a customer receipt against an invoice, or a carrier payout against a
 * payable. Every entry is an administrative record made by the Super Admin (`source: manual`,
 * `confirmation: admin_recorded`): it is NOT bank-verified and no gateway is involved.
 * Only `status: succeeded` payment entries count toward the invoice/payable balance. Amount, currency, targets and the
 * recorder are immutable; a mistake is corrected by a linked `reversal` entry, never by editing or deleting.
 * `idempotencyKey` is unique so a duplicate submission can never create a second entry.
 */
const paymentTransactionSchema = createSchema(
  {
    kind: { type: String, enum: TRANSACTION_KINDS, required: true, immutable: true },
    entryType: { type: String, enum: TRANSACTION_ENTRY_TYPES, default: 'payment', immutable: true },
    status: { type: String, enum: TRANSACTION_STATUSES, required: true },
    amount: moneyField({ required: true, immutable: true, min: [1, 'Amount must be greater than zero.'] }),
    currency: { type: String, enum: CURRENCIES, required: true, immutable: true },
    method: { type: String, enum: TRANSACTION_METHODS, required: true, immutable: true },
    source: { type: String, enum: TRANSACTION_SOURCES, default: 'manual', immutable: true },
    confirmation: { type: String, enum: TRANSACTION_CONFIRMATIONS, default: 'admin_recorded', immutable: true },
    reference: textField(120),
    paymentDate: { type: Date, required: true, immutable: true },
    invoiceId: objectIdRef('Invoice', { immutable: true }),
    payableId: objectIdRef('CarrierPayable', { immutable: true }),
    customerId: objectIdRef('Customer', { immutable: true }),
    carrierId: objectIdRef('Carrier', { immutable: true }),
    loadId: objectIdRef('Load', { required: true, immutable: true }),
    reversalOf: objectIdRef('PaymentTransaction', { immutable: true }),
    reversedBy: objectIdRef('PaymentTransaction'),
    reversalReason: textField(500),
    failureNote: textField(300),
    idempotencyKey: { type: String, required: true, immutable: true, trim: true, maxlength: 120 },
    internalNotes: textField(1000, { select: false }),
    recordedBy: objectIdRef('User', { required: true, immutable: true }),
    recordedAt: { type: Date, required: true, immutable: true },
  },
  { collection: 'payment_transactions' }
);

paymentTransactionSchema.pre('validate', function applyTransactionRules() {
  if (this.kind === 'customer_receipt') {
    if (!this.invoiceId || !this.customerId) this.invalidate('invoiceId', 'A customer receipt needs an invoice and customer.');
    if (this.payableId || this.carrierId) this.invalidate('payableId', 'A customer receipt cannot reference a payable or carrier.');
  } else if (this.kind === 'carrier_payout') {
    if (!this.payableId || !this.carrierId) this.invalidate('payableId', 'A carrier payout needs a payable and carrier.');
    if (this.invoiceId || this.customerId) this.invalidate('invoiceId', 'A carrier payout cannot reference an invoice or customer.');
  }
  if (['bank_transfer', 'check'].includes(this.method) && !this.reference) {
    this.invalidate('reference', 'A reference is required for bank transfers and checks.');
  }
  if (this.entryType === 'reversal' && !this.reversalOf) this.invalidate('reversalOf', 'A reversal must reference the entry it reverses.');
});

paymentTransactionSchema.index({ idempotencyKey: 1 }, { unique: true, name: 'transaction_idempotency_unique' });
paymentTransactionSchema.index({ invoiceId: 1, status: 1 });
paymentTransactionSchema.index({ payableId: 1, status: 1 });
paymentTransactionSchema.index({ customerId: 1, createdAt: -1 });
paymentTransactionSchema.index({ carrierId: 1, createdAt: -1 });
paymentTransactionSchema.index({ kind: 1, status: 1, paymentDate: -1 });
paymentTransactionSchema.index({ reversalOf: 1 });

export const PaymentTransaction = mongoose.model('PaymentTransaction', paymentTransactionSchema);
