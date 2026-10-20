import { isOverdue, outstandingOf } from './common.js';

/**
 * Explicit allow-list response shapes for finance records (same approach as the customer/carrier presenters).
 * Customer shapes never name: internalNotes, createdBy/recordedBy, carrier or payable data, margins, rates.
 * Carrier shapes never name: invoices, customer ids/names/billing details, customer amounts, margins, hold reasons, internal notes.
 */
const id = (value) => (value == null ? undefined : String(value));
const iso = (value) => (value ? new Date(value).toISOString() : null);
const day = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

export const RECORDED_LABEL = 'Recorded by Super Admin (manual entry, not bank-verified)';

const lineItem = (item) => ({ description: item.description, quantity: item.quantity, unitAmount: item.unitAmount, amount: item.amount });

export function presentAdminInvoice(invoice, { customerName, loadNumber } = {}, now = new Date()) {
  return {
    id: id(invoice._id),
    invoiceNumber: invoice.invoiceNumber,
    customerId: id(invoice.customerId),
    customerName,
    loadId: id(invoice.loadId),
    loadNumber,
    shipmentId: id(invoice.shipmentId),
    quoteId: id(invoice.quoteId),
    currency: invoice.currency,
    lineItems: (invoice.lineItems ?? []).map(lineItem),
    subtotal: invoice.subtotal,
    total: invoice.total,
    amountPaid: invoice.amountPaid,
    outstanding: outstandingOf(invoice, 'total'),
    status: invoice.status,
    isOverdue: Boolean(isOverdue(invoice, now)),
    issueDate: day(invoice.issueDate),
    dueDate: day(invoice.dueDate),
    issuedAt: iso(invoice.issuedAt),
    voidedAt: iso(invoice.voidedAt),
    voidReason: invoice.voidReason ?? null,
    customerNote: invoice.customerNote ?? null,
    internalNotes: invoice.internalNotes ?? null,
    createdAt: iso(invoice.createdAt),
    updatedAt: iso(invoice.updatedAt),
  };
}

export function presentAdminTransaction(tx) {
  return {
    id: id(tx._id),
    kind: tx.kind,
    entryType: tx.entryType,
    status: tx.status,
    amount: tx.amount,
    currency: tx.currency,
    method: tx.method,
    source: tx.source,
    confirmation: tx.confirmation,
    confirmationLabel: RECORDED_LABEL,
    reference: tx.reference ?? null,
    paymentDate: day(tx.paymentDate),
    invoiceId: id(tx.invoiceId),
    payableId: id(tx.payableId),
    customerId: id(tx.customerId),
    carrierId: id(tx.carrierId),
    loadId: id(tx.loadId),
    reversalOf: id(tx.reversalOf),
    reversedBy: id(tx.reversedBy),
    reversalReason: tx.reversalReason ?? null,
    failureNote: tx.failureNote ?? null,
    internalNotes: tx.internalNotes ?? null,
    recordedBy: id(tx.recordedBy),
    recordedAt: iso(tx.recordedAt),
  };
}

export function presentAdminPayable(payable, { carrierName, loadNumber } = {}) {
  return {
    id: id(payable._id),
    payableNumber: payable.payableNumber,
    carrierId: id(payable.carrierId),
    carrierName,
    loadId: id(payable.loadId),
    loadNumber,
    shipmentId: id(payable.shipmentId),
    currency: payable.currency,
    amount: payable.amount,
    amountSource: payable.amountSource,
    amountPaid: payable.amountPaid,
    outstanding: outstandingOf(payable, 'amount'),
    status: payable.status,
    dueDate: day(payable.dueDate),
    approvedAt: iso(payable.approvedAt),
    approvedBy: id(payable.approvedBy),
    heldFrom: payable.heldFrom ?? null,
    holdReason: payable.holdReason ?? null,
    voidedAt: iso(payable.voidedAt),
    voidReason: payable.voidReason ?? null,
    adjustments: (payable.adjustmentHistory ?? []).map((a) => ({ from: a.from, to: a.to, reason: a.reason, at: iso(a.at) })),
    internalNotes: payable.internalNotes ?? null,
    createdAt: iso(payable.createdAt),
    updatedAt: iso(payable.updatedAt),
  };
}

/* ---------- customer portal ---------- */

export const CUSTOMER_VISIBLE_STATUSES = ['issued', 'partially_paid', 'paid', 'void'];

/** Customers see confirmed history only: successful payments and their reversals, never failed attempts or notes. */
const customerEntry = (tx) => ({
  id: id(tx._id),
  entryType: tx.entryType,
  status: tx.status === 'reversed' ? 'reversed' : 'recorded',
  amount: tx.amount,
  currency: tx.currency,
  method: tx.method,
  paymentDate: day(tx.paymentDate),
});

export function presentCustomerInvoice(invoice, { loadNumber, transactions } = {}, now = new Date()) {
  const base = {
    id: id(invoice._id),
    invoiceNumber: invoice.invoiceNumber,
    loadNumber,
    currency: invoice.currency,
    subtotal: invoice.subtotal,
    total: invoice.total,
    amountPaid: invoice.amountPaid,
    outstanding: outstandingOf(invoice, 'total'),
    status: invoice.status,
    isOverdue: Boolean(isOverdue(invoice, now)),
    issueDate: day(invoice.issueDate),
    dueDate: day(invoice.dueDate),
  };
  if (!transactions) return base;
  return {
    ...base,
    lineItems: (invoice.lineItems ?? []).map(lineItem),
    customerNote: invoice.customerNote ?? null,
    payments: transactions.filter((tx) => tx.status !== 'failed').map(customerEntry),
    onlinePaymentAvailable: false,
    paymentInstructions: null,
  };
}

/* ---------- carrier portal ---------- */

export const CARRIER_VISIBLE_STATUSES = ['approved', 'on_hold', 'partially_paid', 'paid'];

export function presentCarrierPayable(payable, { loadNumber, transactions } = {}) {
  const base = {
    id: id(payable._id),
    payableNumber: payable.payableNumber,
    loadNumber,
    currency: payable.currency,
    amount: payable.amount,
    amountPaid: payable.amountPaid,
    outstanding: outstandingOf(payable, 'amount'),
    status: payable.status,
    dueDate: day(payable.dueDate),
    approvedAt: iso(payable.approvedAt),
  };
  if (!transactions) return base;
  return {
    ...base,
    payments: transactions
      .filter((tx) => tx.status !== 'failed')
      .map((tx) => ({
        id: id(tx._id),
        entryType: tx.entryType,
        status: tx.status === 'reversed' ? 'reversed' : 'recorded',
        amount: tx.amount,
        currency: tx.currency,
        method: tx.method,
        paymentDate: day(tx.paymentDate),
        reference: tx.reference ?? null,
      })),
  };
}
