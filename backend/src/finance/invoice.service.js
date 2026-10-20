import { Customer } from '../models/Customer.js';
import { Invoice } from '../models/Invoice.js';
import { Load } from '../models/Load.js';
import { PaymentTransaction } from '../models/PaymentTransaction.js';
import { Shipment } from '../models/Shipment.js';
import { assertApplied, compact, escapeRegex, pagination, skipFor } from '../operations/common.js';
import { nextInvoiceNumber } from '../services/numbering.service.js';
import { recordActivity } from '../services/activity.service.js';
import { ApiError } from '../utils/ApiError.js';
import { addDays, buildLineItems, parseDay, startOfUtcDay, withNumberRetry } from './common.js';
import { withFinancialLock } from './lock.js';
import { notifyCustomerOfInvoice } from './notify.js';
import { presentAdminInvoice, presentAdminTransaction } from './presenters.js';

const INVOICE_LOCK = (id) => `invoice:${String(id).toLowerCase()}`;
const audit = (actor, action, invoice, description, metadata, context) =>
  recordActivity({ userId: actor.userId, action, module: 'payments', entityId: invoice._id, description, metadata: { invoiceNumber: invoice.invoiceNumber, ...metadata }, context });

async function loadInvoice(id, { notes = false } = {}) {
  const invoice = await Invoice.findById(id).select(notes ? '+internalNotes' : '').lean();
  if (!invoice) throw ApiError.notFound('Invoice not found.', 'INVOICE_NOT_FOUND');
  return invoice;
}

async function decorate(invoices) {
  const customers = await Customer.find({ _id: { $in: invoices.map((i) => i.customerId) } }).select('companyName').lean();
  const loads = await Load.find({ _id: { $in: invoices.map((i) => i.loadId) } }).select('loadNumber').lean();
  const customerName = new Map(customers.map((c) => [String(c._id), c.companyName]));
  const loadNumber = new Map(loads.map((l) => [String(l._id), l.loadNumber]));
  return invoices.map((invoice) =>
    presentAdminInvoice(invoice, { customerName: customerName.get(String(invoice.customerId)), loadNumber: loadNumber.get(String(invoice.loadId)) })
  );
}

/* ---------- reads ---------- */

const SORTS = { createdAt: 'createdAt', dueDate: 'dueDate', total: 'total', invoiceNumber: 'invoiceNumber', issueDate: 'issueDate' };

export async function listInvoices(query, now = new Date()) {
  const { page, limit, status, customerId, loadId, q, dueFrom, dueTo, sort = 'createdAt', order = 'desc' } = query;
  const filter = compact({ customerId, loadId });
  if (status === 'overdue') {
    filter.status = { $in: ['issued', 'partially_paid'] };
    filter.dueDate = { $lt: startOfUtcDay(now) };
  } else if (status) {
    filter.status = status;
  }
  if (dueFrom || dueTo) {
    filter.dueDate = { ...(filter.dueDate ?? {}), ...(dueFrom ? { $gte: parseDay(dueFrom) } : {}), ...(dueTo ? { $lte: parseDay(dueTo) } : {}) };
  }
  if (q) filter.invoiceNumber = { $regex: `^${escapeRegex(q.toUpperCase())}` };

  const [total, rows] = await Promise.all([
    Invoice.countDocuments(filter),
    Invoice.find(filter).sort({ [SORTS[sort]]: order === 'asc' ? 1 : -1, _id: 1 }).skip(skipFor(page, limit)).limit(limit).lean(),
  ]);
  return { items: await decorate(rows), pagination: pagination(page, limit, total) };
}

export async function getInvoice(id) {
  const invoice = await loadInvoice(id, { notes: true });
  const [[decorated], transactions] = await Promise.all([
    decorate([invoice]),
    PaymentTransaction.find({ invoiceId: invoice._id }).select('+internalNotes').sort({ recordedAt: 1, _id: 1 }).lean(),
  ]);
  return { ...decorated, transactions: transactions.map(presentAdminTransaction) };
}

/* ---------- draft lifecycle ---------- */

async function resolveLoadContext(loadId) {
  const load = await Load.findById(loadId).active().select('loadNumber customerId currency quoteId status').lean();
  if (!load) throw ApiError.notFound('Load not found.', 'LOAD_NOT_FOUND');
  if (load.status === 'cancelled') throw ApiError.conflict('A cancelled load cannot be invoiced.', 'LOAD_CANCELLED');
  const shipment = await Shipment.findOne({ loadId: load._id }).select('_id').lean();
  return { load, shipmentId: shipment?._id };
}

const parseOptionalDay = (text) => (text ? parseDay(text) : undefined);

export async function createInvoice(body, actor, context) {
  const { load, shipmentId } = await resolveLoadContext(body.loadId);
  const totals = buildLineItems(body.lineItems);
  const invoice = await withNumberRetry(nextInvoiceNumber, (invoiceNumber) =>
    Invoice.create({
      invoiceNumber,
      customerId: load.customerId, // always taken from the load, never from the request
      loadId: load._id,
      shipmentId,
      quoteId: load.quoteId,
      currency: load.currency, // one currency per invoice, inherited from the load; no conversion exists
      ...totals,
      amountPaid: 0,
      status: 'draft',
      customerNote: body.customerNote,
      internalNotes: body.internalNotes,
      createdBy: actor.userId,
    })
  );
  await audit(actor, 'invoice.created', invoice, `Draft invoice ${invoice.invoiceNumber} created.`, { loadNumber: load.loadNumber }, context);
  return getInvoice(invoice._id);
}

export async function updateDraftInvoice(id, body, actor, context) {
  return withFinancialLock(INVOICE_LOCK(id), async () => {
    const invoice = await loadInvoice(id);
    if (invoice.status !== 'draft') {
      throw ApiError.conflict('Only a draft invoice can be edited. Issued invoices are immutable; void and reissue instead.', 'INVOICE_NOT_DRAFT');
    }
    const $set = compact({ customerNote: body.customerNote, internalNotes: body.internalNotes, updatedBy: actor.userId });
    if (body.lineItems) Object.assign($set, buildLineItems(body.lineItems));
    const result = await Invoice.updateOne({ _id: id, status: 'draft' }, { $set });
    assertApplied(result);
    await audit(actor, 'invoice.updated', invoice, `Draft invoice ${invoice.invoiceNumber} edited.`, { fields: Object.keys(body) }, context);
    return getInvoice(id);
  });
}

/* ---------- issue / void ---------- */

export async function issueInvoice(id, body, actor, context, now = new Date()) {
  const result = await withFinancialLock(INVOICE_LOCK(id), async () => {
    const invoice = await loadInvoice(id);
    if (invoice.status !== 'draft') {
      throw ApiError.conflict(invoice.status === 'void' ? 'A void invoice cannot be issued.' : 'This invoice has already been issued.', 'INVOICE_NOT_DRAFT');
    }
    if (invoice.total <= 0) throw ApiError.conflict('An invoice with no amount cannot be issued.', 'INVOICE_EMPTY');

    const issueDate = startOfUtcDay(now);
    let dueDate = parseOptionalDay(body.dueDate);
    if (!dueDate) {
      const customer = await Customer.findById(invoice.customerId).select('billingInformation.paymentTermsDays').lean();
      const terms = customer?.billingInformation?.paymentTermsDays;
      if (!Number.isInteger(terms)) {
        throw ApiError.validation([{ field: 'dueDate', message: 'Enter a due date: this customer has no payment terms on file and no default is assumed.' }]);
      }
      dueDate = addDays(issueDate, terms);
    }
    if (dueDate < issueDate) throw ApiError.validation([{ field: 'dueDate', message: 'The due date cannot be before the issue date.' }]);

    const written = await Invoice.updateOne(
      { _id: id, status: 'draft' },
      { $set: { status: 'issued', issueDate, dueDate, issuedAt: now, issuedBy: actor.userId, updatedBy: actor.userId } }
    );
    assertApplied(written);
    await audit(actor, 'invoice.issued', invoice, `Invoice ${invoice.invoiceNumber} issued.`, { dueDate: dueDate.toISOString().slice(0, 10) }, context);
    return invoice;
  });
  await notifyCustomerOfInvoice(result.customerId, {
    title: 'New invoice available',
    message: `Invoice ${result.invoiceNumber} is now available in your billing area.`,
    invoiceId: result._id,
    eventKey: `invoice-issued:${result._id}`,
  });
  return getInvoice(id);
}

export async function voidInvoice(id, body, actor, context, now = new Date()) {
  return withFinancialLock(INVOICE_LOCK(id), async () => {
    const invoice = await loadInvoice(id);
    if (invoice.status === 'void') return getInvoice(id); // idempotent repeat
    if (invoice.amountPaid > 0 || invoice.status === 'paid') {
      throw ApiError.conflict('This invoice has recorded payments. Reverse them first, then void and reissue.', 'INVOICE_HAS_PAYMENTS');
    }
    const written = await Invoice.updateOne(
      { _id: id, status: { $in: ['draft', 'issued', 'partially_paid'] }, amountPaid: 0 },
      { $set: { status: 'void', voidedAt: now, voidedBy: actor.userId, voidReason: body.reason, updatedBy: actor.userId } }
    );
    assertApplied(written);
    await audit(actor, 'invoice.voided', invoice, `Invoice ${invoice.invoiceNumber} voided.`, { previousStatus: invoice.status }, context);
    return getInvoice(id);
  });
}
