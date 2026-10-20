import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { CURRENCIES, INVOICE_STATUSES } from './enums.js';
import { moneyField, objectIdRef, requiredText, textField } from './helpers/fields.js';

/**
 * Customer invoice. All amounts are integer minor units (cents) in `currency`; one currency per invoice, no conversion.
 * An invoice is a request for payment, NOT proof of payment: `amountPaid` is only ever changed by the finance payment
 * service when a confirmed PaymentTransaction is applied. Totals are computed server-side from the line items.
 * Issued invoices are immutable (enforced in the service); they are never hard deleted, only voided.
 * "overdue" is derived from `dueDate` at read time and is not a stored status. No tax or fee fields exist because the
 * client has not confirmed any tax rules.
 */
const lineItemSchema = new mongoose.Schema(
  {
    description: requiredText(200, 'Line description'),
    quantity: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    unitAmount: moneyField({ required: true }),
    amount: moneyField({ required: true }),
  },
  { _id: false }
);

const invoiceSchema = createSchema(
  {
    invoiceNumber: { type: String, required: true, immutable: true, trim: true },
    customerId: objectIdRef('Customer', { required: true, immutable: true }),
    loadId: objectIdRef('Load', { required: true, immutable: true }),
    shipmentId: objectIdRef('Shipment'),
    quoteId: objectIdRef('QuoteRequest'),
    currency: { type: String, enum: CURRENCIES, required: true },
    lineItems: {
      type: [lineItemSchema],
      validate: { validator: (list) => list.length >= 1 && list.length <= 20, message: 'Use between 1 and 20 line items.' },
    },
    subtotal: moneyField({ required: true }),
    total: moneyField({ required: true }),
    amountPaid: moneyField({ default: 0 }),
    status: { type: String, enum: INVOICE_STATUSES, default: 'draft' },
    issueDate: Date,
    dueDate: Date,
    issuedAt: Date,
    issuedBy: objectIdRef('User'),
    voidedAt: Date,
    voidedBy: objectIdRef('User'),
    voidReason: textField(500),
    customerNote: textField(1000),
    internalNotes: textField(2000, { select: false }),
    createdBy: objectIdRef('User', { required: true, immutable: true }),
    updatedBy: objectIdRef('User'),
  },
  { collection: 'invoices' }
);

invoiceSchema.virtual('outstanding').get(function outstanding() {
  return this.status === 'void' ? 0 : Math.max(0, (this.total ?? 0) - (this.amountPaid ?? 0));
});

invoiceSchema.pre('validate', function applyInvoiceRules() {
  if (this.amountPaid > this.total) this.invalidate('amountPaid', 'Amount paid cannot exceed the invoice total.');
  if (this.status !== 'draft' && this.status !== 'void' && (!this.issueDate || !this.dueDate)) {
    this.invalidate('dueDate', 'An issued invoice needs an issue date and a due date.');
  }
});

invoiceSchema.index({ invoiceNumber: 1 }, { unique: true, name: 'invoice_number_unique' });
invoiceSchema.index({ customerId: 1, status: 1, createdAt: -1 });
invoiceSchema.index({ loadId: 1 });
invoiceSchema.index({ status: 1, dueDate: 1 });
invoiceSchema.index({ createdAt: -1 });

export const Invoice = mongoose.model('Invoice', invoiceSchema);
