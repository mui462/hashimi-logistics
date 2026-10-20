import { CarrierPayable } from '../models/CarrierPayable.js';
import { Customer } from '../models/Customer.js';
import { Invoice } from '../models/Invoice.js';
import { Load } from '../models/Load.js';
import { PaymentTransaction } from '../models/PaymentTransaction.js';
import { SiteSettings } from '../models/SiteSettings.js';
import { pagination, skipFor } from '../operations/common.js';
import { assertOwnsRecord, ownershipFilter } from '../services/ownership.service.js';
import { startOfUtcDay } from './common.js';
import { renderInvoicePdf } from './invoicePdf.js';
import { CARRIER_VISIBLE_STATUSES, CUSTOMER_VISIBLE_STATUSES, presentCarrierPayable, presentCustomerInvoice } from './presenters.js';
import { isOverdue } from './common.js';

/**
 * Customer and carrier views of finance records. Every query starts from ownershipFilter(req.owner) (the id comes from the
 * authenticated profile, never from the request), so another party's id is indistinguishable from a missing record (404).
 * Drafts are never visible to either party; a customer sees a void invoice only if it had been issued.
 */
const customerScope = (owner) => ({ ...ownershipFilter(owner), status: { $in: CUSTOMER_VISIBLE_STATUSES }, issuedAt: { $ne: null } });

async function loadNumbers(ids) {
  const loads = await Load.find({ _id: { $in: ids } }).select('loadNumber').lean();
  return new Map(loads.map((load) => [String(load._id), load.loadNumber]));
}

export async function listCustomerInvoices(owner, { page, limit, status, sort = 'createdAt', order = 'desc' }, now = new Date()) {
  const filter = customerScope(owner);
  if (status === 'overdue') {
    filter.status = { $in: ['issued', 'partially_paid'] };
    filter.dueDate = { $lt: startOfUtcDay(now) };
  } else if (status) {
    filter.status = status;
  }
  const [total, rows] = await Promise.all([
    Invoice.countDocuments(filter),
    Invoice.find(filter).sort({ [sort]: order === 'asc' ? 1 : -1, _id: 1 }).skip(skipFor(page, limit)).limit(limit).lean(),
  ]);
  const numbers = await loadNumbers(rows.map((r) => r.loadId));
  return { items: rows.map((r) => presentCustomerInvoice(r, { loadNumber: numbers.get(String(r.loadId)) }, now)), pagination: pagination(page, limit, total) };
}

async function ownedInvoice(owner, id) {
  return assertOwnsRecord(owner, await Invoice.findOne({ _id: id, ...customerScope(owner) }).lean());
}

export async function getCustomerInvoice(owner, id, now = new Date()) {
  const invoice = await ownedInvoice(owner, id);
  const [numbers, transactions] = await Promise.all([
    loadNumbers([invoice.loadId]),
    PaymentTransaction.find({ invoiceId: invoice._id, customerId: owner.customerId }).sort({ recordedAt: 1, _id: 1 }).lean(),
  ]);
  return presentCustomerInvoice(invoice, { loadNumber: numbers.get(String(invoice.loadId)), transactions }, now);
}

export async function renderCustomerInvoicePdf(owner, id, now = new Date()) {
  const invoice = await ownedInvoice(owner, id);
  const [numbers, transactions, customer, settings] = await Promise.all([
    loadNumbers([invoice.loadId]),
    PaymentTransaction.find({ invoiceId: invoice._id, customerId: owner.customerId }).sort({ recordedAt: 1, _id: 1 }).lean(),
    Customer.findById(invoice.customerId).select('companyName billingInformation').lean(),
    SiteSettings.findOne({ key: 'primary' }).select('companyName phone email address').lean(),
  ]);
  return {
    fileName: `${invoice.invoiceNumber}.pdf`,
    buffer: renderInvoicePdf({ invoice, company: settings, customer, loadNumber: numbers.get(String(invoice.loadId)), payments: transactions, overdue: Boolean(isOverdue(invoice, now)) }),
  };
}

/** Admin PDF for any invoice (drafts included, clearly marked DRAFT). */
export async function renderAdminInvoicePdf(id, now = new Date()) {
  const invoice = await Invoice.findById(id).lean();
  if (!invoice) return null;
  const [numbers, transactions, customer, settings] = await Promise.all([
    loadNumbers([invoice.loadId]),
    PaymentTransaction.find({ invoiceId: invoice._id }).sort({ recordedAt: 1, _id: 1 }).lean(),
    Customer.findById(invoice.customerId).select('companyName billingInformation').lean(),
    SiteSettings.findOne({ key: 'primary' }).select('companyName phone email address').lean(),
  ]);
  return {
    fileName: `${invoice.invoiceNumber}.pdf`,
    buffer: renderInvoicePdf({ invoice, company: settings, customer, loadNumber: numbers.get(String(invoice.loadId)), payments: transactions, overdue: Boolean(isOverdue(invoice, now)) }),
  };
}

/* ---------- carrier ---------- */

const carrierScope = (owner) => ({ ...ownershipFilter(owner), status: { $in: CARRIER_VISIBLE_STATUSES } });

export async function listCarrierPayables(owner, { page, limit, status, sort = 'createdAt', order = 'desc' }) {
  const filter = carrierScope(owner);
  if (status) filter.status = status;
  const [total, rows] = await Promise.all([
    CarrierPayable.countDocuments(filter),
    CarrierPayable.find(filter).sort({ [sort]: order === 'asc' ? 1 : -1, _id: 1 }).skip(skipFor(page, limit)).limit(limit).lean(),
  ]);
  const numbers = await loadNumbers(rows.map((r) => r.loadId));
  return { items: rows.map((r) => presentCarrierPayable(r, { loadNumber: numbers.get(String(r.loadId)) })), pagination: pagination(page, limit, total) };
}

export async function getCarrierPayable(owner, id) {
  const payable = assertOwnsRecord(owner, await CarrierPayable.findOne({ _id: id, ...carrierScope(owner) }).lean());
  const [numbers, transactions] = await Promise.all([
    loadNumbers([payable.loadId]),
    PaymentTransaction.find({ payableId: payable._id, carrierId: owner.carrierId }).sort({ recordedAt: 1, _id: 1 }).lean(),
  ]);
  return presentCarrierPayable(payable, { loadNumber: numbers.get(String(payable.loadId)), transactions });
}
