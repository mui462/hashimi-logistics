import mongoose from 'mongoose';
import { CarrierPayable } from '../models/CarrierPayable.js';
import { Invoice } from '../models/Invoice.js';
import { Load } from '../models/Load.js';
import { PaymentTransaction } from '../models/PaymentTransaction.js';
import { compact, pagination, skipFor } from '../operations/common.js';
import { recordActivity } from '../services/activity.service.js';
import { ApiError } from '../utils/ApiError.js';
import { startOfUtcDay } from './common.js';
import { withFinancialLock } from './lock.js';
import { notifyCarrierOfPayable, notifyCustomerOfInvoice } from './notify.js';
import { presentAdminTransaction } from './presenters.js';

/**
 * The single place where money records change balances. A customer receipt is applied to an invoice, a carrier payout to a
 * payable. Every entry is an administrative record made by the Super Admin ("admin_recorded", never bank-verified).
 *
 * Safety rules (each is covered by tests):
 *  - the target's id and its owner (customer/carrier), currency and load come from the stored record, not from the request;
 *  - the work runs inside a per-record lock, the balance is recomputed from the ledger (the source of truth) before and
 *    after each change, so simultaneous payments cannot overpay, a crash between steps heals on the next operation, and a
 *    repeated submission with the same idempotency key returns the first result;
 *  - only `succeeded` payment entries change a balance, `failed` attempts are kept as non-counting records;
 *  - entries are never edited or deleted; a mistake is corrected by one linked reversal (its key is derived from the
 *    original, so it can only happen once).
 */
const TARGETS = {
  customer_receipt: {
    Model: Invoice,
    idField: 'invoiceId',
    ownerField: 'customerId',
    totalField: 'total',
    payableStatuses: ['issued', 'partially_paid'],
    unpaidStatus: 'issued',
    lockKey: (id) => `invoice:${String(id).toLowerCase()}`,
    numberField: 'invoiceNumber',
    notFound: ['Invoice not found.', 'INVOICE_NOT_FOUND'],
    notPayable: ['Payments can only be recorded on an issued, unpaid or partially paid invoice.', 'INVOICE_NOT_PAYABLE'],
  },
  carrier_payout: {
    Model: CarrierPayable,
    idField: 'payableId',
    ownerField: 'carrierId',
    totalField: 'amount',
    payableStatuses: ['approved', 'partially_paid'],
    unpaidStatus: 'approved',
    lockKey: (id) => `payable:${String(id).toLowerCase()}`,
    numberField: 'payableNumber',
    notFound: ['Carrier payable not found.', 'PAYABLE_NOT_FOUND'],
    notPayable: ['Payouts can only be recorded on an approved payable that is not on hold, void or fully paid.', 'PAYABLE_NOT_PAYABLE'],
  },
};

const labelFor = (kind) => (kind === 'customer_receipt' ? 'invoice' : 'payable');
const statusAfter = (target, total, paid) => (paid >= total ? 'paid' : paid > 0 ? 'partially_paid' : target.unpaidStatus);
const canonicalId = (id) => String(id).toLowerCase();
const dayOf = (date) => (date ? new Date(date).toISOString().slice(0, 10) : null);

/** The same key must mean the same request: every field the caller controls is compared. */
function sameRequest(tx, input) {
  return (
    tx.amount === input.amount &&
    tx.method === input.method &&
    tx.currency === input.currency &&
    (tx.status === 'failed') === (input.outcome === 'failed') &&
    dayOf(tx.paymentDate) === input.paymentDate &&
    (tx.reference ?? null) === (input.reference ?? null) &&
    String(tx[input.idField]) === String(input.id)
  );
}

/**
 * The ledger is the source of truth for balances: the stored `amountPaid` and status are recomputed from the sum of
 * succeeded payment entries. Running this under the record lock before and after every change makes each operation
 * idempotent and self-healing: if a process died between writing an entry and updating the balance, the next operation
 * (including a retry of the same request) finishes the job. One accumulator per aggregation keeps it correct on FerretDB.
 */
async function syncBalance(target, kind, id) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rows = await PaymentTransaction.aggregate([
      { $match: { kind, entryType: 'payment', status: 'succeeded', [target.idField]: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const ledger = rows[0]?.total ?? 0;
    const record = await target.Model.findById(id).lean();
    if (!record) throw ApiError.notFound(...target.notFound);
    if (ledger > record[target.totalField]) {
      throw ApiError.conflict('Recorded payments exceed the total. Run the reconciliation check before continuing.', 'BALANCE_INCONSISTENT');
    }
    const status = ['void', 'on_hold', 'draft'].includes(record.status) ? record.status : statusAfter(target, record[target.totalField], ledger);
    if (record.amountPaid === ledger && record.status === status) return { ...record, amountPaid: ledger, status };
    const written = await target.Model.updateOne({ _id: id, amountPaid: record.amountPaid, status: record.status }, { $set: { amountPaid: ledger, status } });
    if (written.matchedCount === 1) return { ...record, amountPaid: ledger, status };
  }
  throw ApiError.conflict('This record was changed by someone else. Reload it and try again.', 'STALE_STATE');
}

async function record(kind, rawId, body, actor, context, now = new Date()) {
  const target = TARGETS[kind];
  const id = canonicalId(rawId);
  const storedKey = `${kind}:${id}:${body.idempotencyKey}`;
  const input = { ...body, idField: target.idField, id };

  const outcome = await withFinancialLock(target.lockKey(id), async ({ assertHeld }) => {
    // Heal any half-finished earlier operation first, so the balance we validate against is the ledger's.
    await syncBalance(target, kind, id);

    const prior = await PaymentTransaction.findOne({ idempotencyKey: storedKey }).select('+internalNotes').lean();
    if (prior) return replay(prior, input);

    const current = await target.Model.findById(id).lean();
    if (!current) throw ApiError.notFound(...target.notFound);
    if (!target.payableStatuses.includes(current.status)) throw ApiError.conflict(...target.notPayable);
    if (body.currency !== current.currency) {
      throw ApiError.conflict('The payment currency must match the record currency. No conversion is performed.', 'CURRENCY_MISMATCH');
    }
    if (kind === 'carrier_payout') {
      const load = await Load.findById(current.loadId).select('carrierId').lean();
      if (!load?.carrierId || String(load.carrierId) !== String(current.carrierId)) {
        throw ApiError.conflict('The load is no longer assigned to this carrier. Void this payable instead of paying it.', 'CARRIER_MISMATCH');
      }
    }
    const paymentDate = new Date(`${body.paymentDate}T00:00:00.000Z`);
    if (paymentDate > startOfUtcDay(now)) throw ApiError.validation([{ field: 'paymentDate', message: 'The payment date cannot be in the future.' }]);

    const succeeded = body.outcome === 'succeeded';
    if (succeeded && body.amount > current[target.totalField] - current.amountPaid) {
      throw ApiError.conflict('This payment is larger than the outstanding balance.', 'OVERPAYMENT');
    }

    await assertHeld();
    const transaction = await PaymentTransaction.create({
      kind,
      entryType: 'payment',
      status: succeeded ? 'succeeded' : 'failed',
      amount: body.amount,
      currency: current.currency,
      method: body.method,
      reference: body.reference,
      paymentDate,
      [target.idField]: current._id,
      [target.ownerField]: current[target.ownerField],
      loadId: current.loadId,
      failureNote: succeeded ? undefined : body.failureNote,
      internalNotes: body.internalNotes,
      idempotencyKey: storedKey,
      recordedBy: actor.userId,
      recordedAt: now,
    });
    const updated = succeeded ? await syncBalance(target, kind, id) : current;
    await recordActivity({
      userId: actor.userId,
      action: succeeded ? `${labelFor(kind)}.payment_recorded` : `${labelFor(kind)}.payment_attempt_failed`,
      module: 'payments',
      entityId: current._id,
      description: `${succeeded ? 'Payment recorded' : 'Failed payment attempt recorded'} on ${current[target.numberField]} (administrative record, not bank-verified).`,
      metadata: { [target.numberField]: current[target.numberField], amount: body.amount, currency: current.currency, method: body.method, transactionId: String(transaction._id) },
      context,
    });
    return { transaction: transaction.toObject(), record: updated, replayed: false, succeeded };
  });

  if (!outcome.replayed && outcome.succeeded) await notifyRecorded(kind, outcome.record, outcome.transaction._id);
  const stored = await PaymentTransaction.findById(outcome.transaction._id).select('+internalNotes').lean();
  return { transaction: presentAdminTransaction(stored), replayed: outcome.replayed };
}

function replay(existing, input) {
  if (!sameRequest(existing, input)) {
    throw ApiError.conflict('This idempotency key was already used for a different payment.', 'IDEMPOTENCY_KEY_REUSED');
  }
  return { transaction: existing, replayed: true };
}

async function notifyRecorded(kind, record, transactionId) {
  if (kind === 'customer_receipt') {
    await notifyCustomerOfInvoice(record.customerId, {
      title: 'Payment recorded on your invoice',
      message: `A payment was recorded on invoice ${record.invoiceNumber}. Open your billing area to review the balance.`,
      invoiceId: record._id,
      eventKey: `invoice-payment:${transactionId}`,
    });
  } else {
    await notifyCarrierOfPayable(record.carrierId, {
      title: 'Payment recorded for your load',
      message: `A payment record was added to ${record.payableNumber}. Open your payments area for details.`,
      payableId: record._id,
      eventKey: `payable-payment:${transactionId}`,
    });
  }
}

export const recordCustomerReceipt = (invoiceId, body, actor, context, now) => record('customer_receipt', invoiceId, body, actor, context, now);
export const recordCarrierPayout = (payableId, body, actor, context, now) => record('carrier_payout', payableId, body, actor, context, now);

/**
 * Reverses one succeeded payment entry by appending a linked reversal entry. Happens at most once (the reversal's key is
 * derived from the original). Safe to retry after a crash: each step is idempotent and the balance is recomputed from the ledger.
 */
export async function reverseTransaction(transactionId, body, actor, context, now = new Date()) {
  const original = await PaymentTransaction.findById(transactionId).lean();
  if (!original || original.entryType !== 'payment') throw ApiError.notFound('Payment record not found.', 'TRANSACTION_NOT_FOUND');
  const target = TARGETS[original.kind];
  const targetId = canonicalId(original[target.idField]);

  const outcome = await withFinancialLock(target.lockKey(targetId), async ({ assertHeld }) => {
    const fresh = await PaymentTransaction.findById(transactionId).lean();
    const existingReversal = await PaymentTransaction.findOne({ reversalOf: fresh._id }).lean();
    if (!existingReversal && fresh.status !== 'succeeded') {
      throw ApiError.conflict('Only a recorded, successful payment can be reversed.', 'TRANSACTION_NOT_REVERSIBLE');
    }

    let reversal = existingReversal;
    let created = false;
    if (!reversal) {
      await assertHeld();
      try {
        reversal = (await PaymentTransaction.create({
          kind: fresh.kind,
          entryType: 'reversal',
          status: 'succeeded',
          amount: fresh.amount,
          currency: fresh.currency,
          method: fresh.method,
          reference: fresh.reference,
          paymentDate: startOfUtcDay(now),
          [target.idField]: fresh[target.idField],
          [target.ownerField]: fresh[target.ownerField],
          loadId: fresh.loadId,
          reversalOf: fresh._id,
          reversalReason: body.reason,
          idempotencyKey: `reversal:${fresh._id}`,
          recordedBy: actor.userId,
          recordedAt: now,
        })).toObject();
        created = true;
      } catch (error) {
        if (error?.code !== 11000) throw error;
        reversal = await PaymentTransaction.findOne({ reversalOf: fresh._id }).lean();
      }
    }

    // Finish (or repair) the remaining steps: mark the original, then recompute the balance from the ledger.
    if (fresh.status !== 'reversed' || String(fresh.reversedBy ?? '') !== String(reversal._id)) {
      await assertHeld();
      await PaymentTransaction.updateOne({ _id: fresh._id }, { $set: { status: 'reversed', reversedBy: reversal._id } });
    }
    const record = await syncBalance(target, original.kind, targetId);
    if (created) {
      await recordActivity({
        userId: actor.userId,
        action: `${labelFor(fresh.kind)}.payment_reversed`,
        module: 'payments',
        entityId: record._id,
        description: `Payment on ${record[target.numberField]} reversed (administrative record).`,
        metadata: { [target.numberField]: record[target.numberField], amount: fresh.amount, currency: fresh.currency, originalTransactionId: String(fresh._id), reversalTransactionId: String(reversal._id) },
        context,
      });
    }
    return { replayed: !created, record };
  });

  if (!outcome.replayed) {
    if (original.kind === 'customer_receipt') {
      await notifyCustomerOfInvoice(outcome.record.customerId, {
        title: 'A payment record was reversed',
        message: `A payment record on invoice ${outcome.record.invoiceNumber} was reversed. Open your billing area to review the balance.`,
        invoiceId: outcome.record._id,
        eventKey: `invoice-reversal:${transactionId}`,
      });
    } else {
      await notifyCarrierOfPayable(outcome.record.carrierId, {
        title: 'A payment record was reversed',
        message: `A payment record on ${outcome.record.payableNumber} was reversed. Open your payments area for details.`,
        payableId: outcome.record._id,
        eventKey: `payable-reversal:${transactionId}`,
      });
    }
  }
  const updated = await PaymentTransaction.findById(transactionId).select('+internalNotes').lean();
  return { transaction: presentAdminTransaction(updated), replayed: outcome.replayed };
}

/* ---------- reads ---------- */

const SORTS = { recordedAt: 'recordedAt', paymentDate: 'paymentDate', amount: 'amount' };

export async function listTransactions(query) {
  const { page, limit, kind, status, entryType, invoiceId, payableId, customerId, carrierId, from, to, sort = 'recordedAt', order = 'desc' } = query;
  const filter = compact({ kind, status, entryType, invoiceId, payableId, customerId, carrierId });
  if (from || to) {
    filter.paymentDate = { ...(from ? { $gte: new Date(`${from}T00:00:00.000Z`) } : {}), ...(to ? { $lte: new Date(`${to}T00:00:00.000Z`) } : {}) };
  }
  const [total, rows] = await Promise.all([
    PaymentTransaction.countDocuments(filter),
    PaymentTransaction.find(filter).select('+internalNotes').sort({ [SORTS[sort]]: order === 'asc' ? 1 : -1, _id: 1 }).skip(skipFor(page, limit)).limit(limit).lean(),
  ]);
  return { items: rows.map(presentAdminTransaction), pagination: pagination(page, limit, total) };
}

/** Compares each stored balance with the sum of its succeeded payment entries. Read-only: it reports, never repairs. */
export async function reconcile() {
  const sums = await PaymentTransaction.aggregate([
    { $match: { entryType: 'payment', status: 'succeeded' } },
    { $group: { _id: { kind: '$kind', invoiceId: '$invoiceId', payableId: '$payableId' }, total: { $sum: '$amount' } } },
  ]);
  const check = async (kind, Model, idField, numberField, totalField) => {
    const ledger = new Map(sums.filter((row) => row._id.kind === kind).map((row) => [String(row._id[idField]), row.total]));
    const records = await Model.find({ $or: [{ _id: { $in: [...ledger.keys()] } }, { amountPaid: { $gt: 0 } }] }).select(`${numberField} ${totalField} amountPaid status currency`).lean();
    const mismatches = records
      .map((record) => ({ record, ledgerPaid: ledger.get(String(record._id)) ?? 0 }))
      .filter(({ record, ledgerPaid }) => record.amountPaid !== ledgerPaid || record.amountPaid > record[totalField])
      .map(({ record, ledgerPaid }) => ({ id: String(record._id), number: record[numberField], currency: record.currency, storedPaid: record.amountPaid, ledgerPaid, total: record[totalField] }));
    return { checked: records.length, mismatches };
  };
  const [invoices, payables] = await Promise.all([
    check('customer_receipt', Invoice, 'invoiceId', 'invoiceNumber', 'total'),
    check('carrier_payout', CarrierPayable, 'payableId', 'payableNumber', 'amount'),
  ]);
  return { invoices, payables, consistent: invoices.mismatches.length === 0 && payables.mismatches.length === 0 };
}
