import { Carrier } from '../models/Carrier.js';
import { CarrierPayable } from '../models/CarrierPayable.js';
import { Load } from '../models/Load.js';
import { PaymentTransaction } from '../models/PaymentTransaction.js';
import { Shipment } from '../models/Shipment.js';
import { assertApplied, compact, escapeRegex, pagination, skipFor } from '../operations/common.js';
import { nextPayableNumber } from '../services/numbering.service.js';
import { recordActivity } from '../services/activity.service.js';
import { ApiError } from '../utils/ApiError.js';
import { assertAmount, parseDay, withNumberRetry } from './common.js';
import { withFinancialLock } from './lock.js';
import { notifyCarrierOfPayable } from './notify.js';
import { presentAdminPayable, presentAdminTransaction } from './presenters.js';

const LOCK = (id) => `payable:${String(id).toLowerCase()}`;
const audit = (actor, action, payable, description, metadata, context) =>
  recordActivity({ userId: actor.userId, action, module: 'payments', entityId: payable._id, description, metadata: { payableNumber: payable.payableNumber, ...metadata }, context });

async function loadPayable(id) {
  const payable = await CarrierPayable.findById(id).select('+holdReason +adjustmentHistory +internalNotes').lean();
  if (!payable) throw ApiError.notFound('Carrier payable not found.', 'PAYABLE_NOT_FOUND');
  return payable;
}

async function decorate(payables) {
  const carriers = await Carrier.find({ _id: { $in: payables.map((p) => p.carrierId) } }).select('companyName').lean();
  const loads = await Load.find({ _id: { $in: payables.map((p) => p.loadId) } }).select('loadNumber').lean();
  const carrierName = new Map(carriers.map((c) => [String(c._id), c.companyName]));
  const loadNumber = new Map(loads.map((l) => [String(l._id), l.loadNumber]));
  return payables.map((p) => presentAdminPayable(p, { carrierName: carrierName.get(String(p.carrierId)), loadNumber: loadNumber.get(String(p.loadId)) }));
}

const SORTS = { createdAt: 'createdAt', dueDate: 'dueDate', amount: 'amount', payableNumber: 'payableNumber' };

export async function listPayables(query) {
  const { page, limit, status, carrierId, loadId, q, sort = 'createdAt', order = 'desc' } = query;
  const filter = compact({ status, carrierId, loadId });
  if (q) filter.payableNumber = { $regex: `^${escapeRegex(q.toUpperCase())}` };
  const [total, rows] = await Promise.all([
    CarrierPayable.countDocuments(filter),
    CarrierPayable.find(filter).sort({ [SORTS[sort]]: order === 'asc' ? 1 : -1, _id: 1 }).skip(skipFor(page, limit)).limit(limit).lean(),
  ]);
  return { items: await decorate(rows), pagination: pagination(page, limit, total) };
}

export async function getPayable(id) {
  const payable = await loadPayable(id);
  const [[decorated], transactions] = await Promise.all([
    decorate([payable]),
    PaymentTransaction.find({ payableId: payable._id }).select('+internalNotes').sort({ recordedAt: 1, _id: 1 }).lean(),
  ]);
  return { ...decorated, transactions: transactions.map(presentAdminTransaction) };
}

export async function createPayable(body, actor, context) {
  // carrierRate is select:false on Load; reading it here is a server-side, Super Admin-only action.
  const load = await Load.findById(body.loadId).active().select('+carrierRate loadNumber carrierId currency status').lean();
  if (!load) throw ApiError.notFound('Load not found.', 'LOAD_NOT_FOUND');
  if (!load.carrierId) throw ApiError.conflict('Assign a carrier to this load before creating a payable.', 'LOAD_NOT_ASSIGNED');
  if (['draft', 'cancelled'].includes(load.status)) throw ApiError.conflict(`A ${load.status} load cannot have a carrier payable.`, 'LOAD_NOT_PAYABLE');

  const amount = body.amount ?? load.carrierRate;
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw ApiError.validation([{ field: 'amount', message: 'This load has no carrier rate. Enter the payable amount explicitly.' }]);
  }
  assertAmount(amount);
  const shipment = await Shipment.findOne({ loadId: load._id }).select('_id').lean();

  const liveKey = String(load._id);
  if (await CarrierPayable.exists({ activeLoadKey: liveKey })) throw ApiError.conflict('This load already has an active carrier payable.', 'PAYABLE_EXISTS');
  const payable = await withNumberRetry(nextPayableNumber, async (payableNumber) => {
    try {
      return await CarrierPayable.create({
        payableNumber,
        carrierId: load.carrierId, // the load's assigned carrier, never a client-supplied value
        loadId: load._id,
        shipmentId: shipment?._id,
        currency: load.currency,
        amount,
        amountSource: body.amount === undefined ? 'load_carrier_rate' : 'admin_entered',
        status: 'draft',
        dueDate: body.dueDate ? parseDay(body.dueDate) : undefined,
        internalNotes: body.internalNotes,
        activeLoadKey: liveKey,
        createdBy: actor.userId,
      });
    } catch (error) {
      if (error?.code === 11000 && (await CarrierPayable.exists({ activeLoadKey: liveKey }))) {
        throw ApiError.conflict('This load already has an active carrier payable.', 'PAYABLE_EXISTS');
      }
      throw error;
    }
  });
  await audit(actor, 'payable.created', payable, `Carrier payable ${payable.payableNumber} created.`, { loadNumber: load.loadNumber, amount, currency: load.currency, amountSource: payable.amountSource }, context);
  return getPayable(payable._id);
}

export async function updateDraftPayable(id, body, actor, context) {
  return withFinancialLock(LOCK(id), async () => {
    const payable = await loadPayable(id);
    if (payable.status !== 'draft') throw ApiError.conflict('Only a draft payable can be edited. Use an adjustment for an approved payable.', 'PAYABLE_NOT_DRAFT');
    const $set = compact({
      dueDate: body.dueDate ? parseDay(body.dueDate) : undefined,
      internalNotes: body.internalNotes,
      ...(body.amount !== undefined ? { amount: assertAmount(body.amount), amountSource: 'admin_entered' } : {}),
    });
    const written = await CarrierPayable.updateOne({ _id: id, status: 'draft' }, { $set });
    assertApplied(written);
    await audit(actor, 'payable.updated', payable, `Draft payable ${payable.payableNumber} edited.`, { fields: Object.keys(body) }, context);
    return getPayable(id);
  });
}

export async function approvePayable(id, actor, context, now = new Date()) {
  const approved = await withFinancialLock(LOCK(id), async () => {
    const payable = await loadPayable(id);
    if (payable.status === 'approved') return { payable, changed: false };
    if (payable.status !== 'draft') throw ApiError.conflict(`A ${payable.status.replace('_', ' ')} payable cannot be approved.`, 'PAYABLE_NOT_DRAFT');
    const load = await Load.findById(payable.loadId).select('carrierId').lean();
    if (!load?.carrierId || String(load.carrierId) !== String(payable.carrierId)) {
      throw ApiError.conflict('The load is no longer assigned to this carrier. Void this payable and create a new one.', 'CARRIER_MISMATCH');
    }
    const written = await CarrierPayable.updateOne({ _id: id, status: 'draft' }, { $set: { status: 'approved', approvedAt: now, approvedBy: actor.userId } });
    assertApplied(written);
    await audit(actor, 'payable.approved', payable, `Carrier payable ${payable.payableNumber} approved.`, {}, context);
    return { payable, changed: true };
  });
  if (approved.changed) {
    await notifyCarrierOfPayable(approved.payable.carrierId, {
      title: 'A payable was approved for your load',
      message: `Payable ${approved.payable.payableNumber} was approved. Open your payments area for details. Approval is not a payment.`,
      payableId: approved.payable._id,
      eventKey: `payable-approved:${approved.payable._id}`,
    });
  }
  return getPayable(id);
}

export async function holdPayable(id, body, actor, context) {
  return withFinancialLock(LOCK(id), async () => {
    const payable = await loadPayable(id);
    if (payable.status === 'on_hold') return getPayable(id);
    if (!['approved', 'partially_paid'].includes(payable.status)) throw ApiError.conflict('Only an approved or partially paid payable can be put on hold.', 'PAYABLE_NOT_HOLDABLE');
    const written = await CarrierPayable.updateOne({ _id: id, status: payable.status }, { $set: { status: 'on_hold', heldFrom: payable.status, holdReason: body.reason } });
    assertApplied(written);
    await audit(actor, 'payable.held', payable, `Carrier payable ${payable.payableNumber} put on hold.`, { previousStatus: payable.status }, context);
    return getPayable(id);
  });
}

export async function releasePayable(id, actor, context) {
  return withFinancialLock(LOCK(id), async () => {
    const payable = await loadPayable(id);
    if (payable.status !== 'on_hold') throw ApiError.conflict('This payable is not on hold.', 'PAYABLE_NOT_ON_HOLD');
    // Recompute from the amounts instead of trusting the status held from: an adjustment or reversal may have changed them.
    const restored = payable.amountPaid >= payable.amount ? 'paid' : payable.amountPaid > 0 ? 'partially_paid' : 'approved';
    const written = await CarrierPayable.updateOne({ _id: id, status: 'on_hold' }, { $set: { status: restored }, $unset: { heldFrom: 1, holdReason: 1 } });
    assertApplied(written);
    await audit(actor, 'payable.released', payable, `Carrier payable ${payable.payableNumber} released from hold.`, { restoredStatus: restored }, context);
    return getPayable(id);
  });
}

export async function adjustPayable(id, body, actor, context, now = new Date()) {
  return withFinancialLock(LOCK(id), async () => {
    const payable = await loadPayable(id);
    if (['paid', 'void'].includes(payable.status)) throw ApiError.conflict(`A ${payable.status} payable cannot be adjusted.`, 'PAYABLE_NOT_ADJUSTABLE');
    assertAmount(body.amount);
    if (body.amount < payable.amountPaid) {
      throw ApiError.conflict('The adjusted amount cannot be lower than what has already been paid. Reverse a payment first.', 'ADJUSTMENT_BELOW_PAID');
    }
    const status = ['approved', 'partially_paid'].includes(payable.status)
      ? body.amount === payable.amountPaid ? 'paid' : payable.amountPaid > 0 ? 'partially_paid' : 'approved'
      : payable.status;
    const written = await CarrierPayable.updateOne(
      { _id: id, status: payable.status, amountPaid: payable.amountPaid },
      { $set: { amount: body.amount, amountSource: 'admin_entered', status }, $push: { adjustmentHistory: { from: payable.amount, to: body.amount, reason: body.reason, by: actor.userId, at: now } } }
    );
    assertApplied(written);
    await audit(actor, 'payable.adjusted', payable, `Carrier payable ${payable.payableNumber} amount adjusted.`, { from: payable.amount, to: body.amount, currency: payable.currency }, context);
    return getPayable(id);
  });
}

export async function voidPayable(id, body, actor, context, now = new Date()) {
  return withFinancialLock(LOCK(id), async () => {
    const payable = await loadPayable(id);
    if (payable.status === 'void') return getPayable(id);
    if (payable.amountPaid > 0 || payable.status === 'paid') throw ApiError.conflict('This payable has recorded payments. Reverse them first.', 'PAYABLE_HAS_PAYMENTS');
    const written = await CarrierPayable.updateOne(
      { _id: id, status: { $in: ['draft', 'approved', 'on_hold', 'partially_paid'] }, amountPaid: 0 },
      { $set: { status: 'void', voidedAt: now, voidedBy: actor.userId, voidReason: body.reason, activeLoadKey: `void:${id}` } }
    );
    assertApplied(written);
    await audit(actor, 'payable.voided', payable, `Carrier payable ${payable.payableNumber} voided.`, { previousStatus: payable.status }, context);
    return getPayable(id);
  });
}

