import { CarrierPayable } from '../models/CarrierPayable.js';
import { Invoice } from '../models/Invoice.js';
import { PaymentTransaction } from '../models/PaymentTransaction.js';
import { groupMeasures } from './aggregate.js';
import { startOfUtcDay } from './common.js';
import { presentAdminTransaction } from './presenters.js';

const byCurrency = (rows, build) => {
  const out = {};
  for (const row of rows) (out[row.currency] ??= {})[row.status ?? 'all'] = build(row);
  return out;
};

/**
 * Super Admin financial summary, computed from persisted records on every request (nothing is cached or estimated).
 * Sections are kept apart on purpose: money billed to customers, receipts recorded against invoices, and amounts owed to
 * carriers are never netted into a "profit" or mixed. "Recorded" means an administrative entry, not bank-verified cash.
 */
export async function getFinanceSummary(now = new Date()) {
  const today = startOfUtcDay(now);
  const keys = { currency: '$currency', status: '$status' };
  const [invoiceGroups, overdueGroups, payableGroups, receiptGroups, payoutGroups, recent, counts] = await Promise.all([
    groupMeasures(Invoice, { keys, sums: { total: 'total', paid: 'amountPaid' } }),
    groupMeasures(Invoice, { match: { status: { $in: ['issued', 'partially_paid'] }, dueDate: { $lt: today } }, keys: { currency: '$currency' }, sums: { total: 'total', paid: 'amountPaid' } }),
    groupMeasures(CarrierPayable, { keys, sums: { amount: 'amount', paid: 'amountPaid' } }),
    groupMeasures(PaymentTransaction, { match: { kind: 'customer_receipt', entryType: 'payment' }, keys, sums: { amount: 'amount' } }),
    groupMeasures(PaymentTransaction, { match: { kind: 'carrier_payout', entryType: 'payment' }, keys, sums: { amount: 'amount' } }),
    PaymentTransaction.find({}).sort({ recordedAt: -1, _id: -1 }).limit(10).lean(),
    Promise.all([Invoice.countDocuments({}), CarrierPayable.countDocuments({}), PaymentTransaction.countDocuments({})]),
  ]);

  const currencies = new Set([...invoiceGroups, ...payableGroups, ...receiptGroups, ...payoutGroups].map((row) => row.currency));
  const invoices = byCurrency(invoiceGroups, (row) => ({ count: row.count, total: row.total, paid: row.paid }));
  const overdue = Object.fromEntries(overdueGroups.map((row) => [row.currency, { count: row.count, outstanding: row.total - row.paid }]));
  const payables = byCurrency(payableGroups, (row) => ({ count: row.count, amount: row.amount, paid: row.paid }));
  const receipts = byCurrency(receiptGroups, (row) => ({ count: row.count, amount: row.amount }));
  const payouts = byCurrency(payoutGroups, (row) => ({ count: row.count, amount: row.amount }));

  const perCurrency = {};
  for (const currency of currencies) {
    const inv = invoices[currency] ?? {};
    const open = ['issued', 'partially_paid'].map((s) => inv[s]).filter(Boolean);
    const pay = payables[currency] ?? {};
    const owed = ['approved', 'on_hold', 'partially_paid'].map((s) => pay[s]).filter(Boolean);
    perCurrency[currency] = {
      customerInvoices: {
        issuedCount: ['issued', 'partially_paid', 'paid'].reduce((n, s) => n + (inv[s]?.count ?? 0), 0),
        draftCount: inv.draft?.count ?? 0,
        voidCount: inv.void?.count ?? 0,
        paidCount: inv.paid?.count ?? 0,
        paidInvoiceTotal: inv.paid?.total ?? 0,
        outstandingBalance: open.reduce((sum, row) => sum + row.total - row.paid, 0),
        overdueCount: overdue[currency]?.count ?? 0,
        overdueOutstanding: overdue[currency]?.outstanding ?? 0,
      },
      customerReceiptsRecorded: {
        recordedCount: receipts[currency]?.succeeded?.count ?? 0,
        recordedAmount: receipts[currency]?.succeeded?.amount ?? 0,
        reversedCount: receipts[currency]?.reversed?.count ?? 0,
        failedAttempts: receipts[currency]?.failed?.count ?? 0,
      },
      carrierPayables: {
        draftCount: pay.draft?.count ?? 0,
        approvedCount: pay.approved?.count ?? 0,
        onHoldCount: pay.on_hold?.count ?? 0,
        partiallyPaidCount: pay.partially_paid?.count ?? 0,
        paidCount: pay.paid?.count ?? 0,
        approvedOwedOutstanding: owed.reduce((sum, row) => sum + row.amount - row.paid, 0),
        paidPayableTotal: pay.paid?.amount ?? 0,
      },
      carrierPayoutsRecorded: {
        recordedCount: payouts[currency]?.succeeded?.count ?? 0,
        recordedAmount: payouts[currency]?.succeeded?.amount ?? 0,
        reversedCount: payouts[currency]?.reversed?.count ?? 0,
      },
    };
  }

  return {
    generatedAt: now.toISOString(),
    basis: 'Calculated from persisted records. Receipts and payouts are administrative records, not bank-verified.',
    totals: { invoices: counts[0], payables: counts[1], transactions: counts[2] },
    perCurrency,
    recentActivity: recent.map(presentAdminTransaction),
  };
}
