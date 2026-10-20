import { Carrier } from '../models/Carrier.js';
import { Customer } from '../models/Customer.js';
import { Load } from '../models/Load.js';
import { QuoteRequest } from '../models/QuoteRequest.js';
import { Shipment } from '../models/Shipment.js';
import { selectionFor } from '../models/accessProjections.js';
import { recordActivity } from '../services/activity.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ACCOUNT_TYPES } from '../utils/constants.js';
import { isLocalDateTime, zonedLocalToUtc } from '../utils/timezone.js';
import { checkCarrierForLoad, findCarrierMatches } from './carrierMatching.service.js';
import { assertApplied, compact, escapeRegex, laneLabel, pagination, skipFor } from './common.js';
import {
  ARCHIVABLE_LOAD_STATUSES,
  ASSIGNABLE_LOAD_STATUSES,
  CANCELLABLE_LOAD_STATUSES,
  EDITABLE_LOAD_STATUSES,
  REASSIGNABLE_LOAD_STATUSES,
  loadMachine,
} from './loadStatus.service.js';
import { notifyUser } from './notifications.service.js';
import { presentLoad, presentLoadSummary } from './operations.presenters.js';
import { buildPricing } from './pricing.service.js';
import { shipmentMachine } from './shipmentStatus.service.js';

const ADMIN_LOAD = selectionFor('Load', ACCOUNT_TYPES.SUPER_ADMIN);
const ADMIN_SHIPMENT = selectionFor('Shipment', ACCOUNT_TYPES.SUPER_ADMIN);
const dayStart = (value) => new Date(`${value}T00:00:00.000Z`);
const dayEnd = (value) => new Date(`${value}T23:59:59.999Z`);

/* ---------- reads ---------- */

export async function findLoad(id, { includeArchived = false } = {}) {
  const query = Load.findOne({ _id: id }).select(ADMIN_LOAD);
  const load = await (includeArchived ? query : query.active()).lean();
  if (!load) throw ApiError.notFound('Load not found.', 'LOAD_NOT_FOUND');
  return load;
}

async function mapBy(Model, ids, fields) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const rows = await Model.find({ _id: { $in: unique } }).select(fields).lean();
  return new Map(rows.map((row) => [String(row._id), row]));
}

const CUSTOMER_FIELDS = 'companyName contactPerson email phone userId';
const CARRIER_FIELDS = 'companyName contactPerson email phone MCNumber DOTNumber status userId';

async function detail(load) {
  const [customers, carriers, quote, shipment] = await Promise.all([
    mapBy(Customer, [load.customerId], CUSTOMER_FIELDS),
    mapBy(Carrier, [load.carrierId, ...(load.assignmentHistory ?? []).map((entry) => entry.carrierId)], CARRIER_FIELDS),
    load.quoteId ? QuoteRequest.findOne({ _id: load.quoteId }).select('quoteNumber').lean() : null,
    Shipment.findOne({ loadId: load._id }).select('trackingNumber shipmentNumber status').lean(),
  ]);
  return presentLoad(load, {
    customer: customers.get(String(load.customerId)),
    carrier: carriers.get(String(load.carrierId)),
    quote,
    shipment,
    carriers,
  });
}

export async function getLoad(id) {
  return { load: await detail(await findLoad(id, { includeArchived: true })) };
}

export async function listLoads(query) {
  const { page, limit, status, customerId, carrierId, equipmentType, crossBorder, originCountry, destinationCountry, unassigned, archived, pickupFrom, pickupTo, q, sort, order } = query;
  const filter = { archivedAt: archived === 'true' ? { $ne: null } : null };
  if (status) filter.status = status;
  if (customerId) filter.customerId = customerId;
  if (carrierId) filter.carrierId = carrierId;
  if (unassigned === 'true') filter.carrierId = null;
  if (equipmentType) filter.equipmentType = equipmentType;
  if (crossBorder) filter.crossBorder = crossBorder === 'true';
  if (originCountry) filter['origin.country'] = originCountry;
  if (destinationCountry) filter['destination.country'] = destinationCountry;
  if (pickupFrom || pickupTo) {
    filter['pickup.earliest'] = { ...(pickupFrom ? { $gte: dayStart(pickupFrom) } : {}), ...(pickupTo ? { $lte: dayEnd(pickupTo) } : {}) };
  }
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ loadNumber: pattern }, { commodity: pattern }, { 'origin.city': pattern }, { 'destination.city': pattern }];
  }
  const sortKey = sort === 'pickup' ? 'pickup.earliest' : sort;
  const direction = order === 'asc' ? 1 : -1;
  const [loads, total] = await Promise.all([
    Load.find(filter).select(ADMIN_LOAD).sort({ [sortKey]: direction, _id: direction }).skip(skipFor(page, limit)).limit(limit).lean(),
    Load.countDocuments(filter),
  ]);
  const [customers, carriers] = await Promise.all([
    mapBy(Customer, loads.map((load) => load.customerId), CUSTOMER_FIELDS),
    mapBy(Carrier, loads.map((load) => load.carrierId), CARRIER_FIELDS),
  ]);
  return {
    items: loads.map((load) => presentLoadSummary(load, { customer: customers.get(String(load.customerId)), carrier: carriers.get(String(load.carrierId)) })),
    pagination: pagination(page, limit, total),
  };
}

export async function getCarrierMatches(id) {
  const load = await findLoad(id);
  return findCarrierMatches(load._id);
}

/* ---------- helpers ---------- */

const audit = (actor, context, action, load, description, metadata = {}) =>
  recordActivity({ userId: actor.userId, action: `operations.load.${action}`, module: 'loads', entityId: load._id, description, metadata, context });

async function userIdOf(Model, id) {
  if (!id) return undefined;
  const row = await Model.findById(id).select('userId').lean();
  return row?.userId;
}

async function notifyCustomer(load, payload) {
  return notifyUser(await userIdOf(Customer, load.customerId), {
    ...payload,
    ...(load.quoteId ? { entityType: 'quote', entityId: load.quoteId } : {}),
  });
}

async function notifyCarrier(carrierId, load, payload) {
  return notifyUser(await userIdOf(Carrier, carrierId), { ...payload, entityType: 'load', entityId: load._id });
}

async function moveLoad(load, to, actor, set = {}, extra = {}) {
  loadMachine.assertTransition(load.status, to);
  const result = await Load.updateOne(
    { _id: load._id, status: load.status, archivedAt: null, ...extra },
    { $set: { status: to, updatedBy: actor.userId, ...set } }
  );
  assertApplied(result);
}

function assertIn(load, statuses, code, message) {
  if (!statuses.includes(load.status)) {
    throw ApiError.conflict(message, code, [{ field: 'status', message: `The load is "${load.status}".` }]);
  }
}

/* ---------- editing ---------- */

export async function updateLoad(id, input, actor, context) {
  const load = await findLoad(id);
  assertIn(load, EDITABLE_LOAD_STATUSES, 'LOAD_NOT_EDITABLE', 'This load can no longer be edited.');
  if (input.equipmentType && load.carrierId && input.equipmentType !== load.equipmentType) {
    throw ApiError.conflict('Equipment cannot change once a carrier is assigned. Unassign the carrier first.', 'LOAD_NOT_EDITABLE');
  }
  const changes = compact({
    commodity: input.commodity,
    equipmentType: input.equipmentType,
    specialInstructions: input.specialInstructions,
    internalNotes: input.internalNotes,
    weight: input.weight,
  });
  assertApplied(await Load.updateOne({ _id: load._id, status: load.status, archivedAt: null }, { $set: { ...changes, updatedBy: actor.userId } }));
  await audit(actor, context, 'updated', load, `Load ${load.loadNumber} was edited.`, { fields: Object.keys(changes) });
  return getLoad(id);
}

/**
 * The customer's rate is whatever the customer accepted in the quote, so it is locked for loads that came from a quote.
 * The carrier rate (what we pay) stays adjustable until pickup; the margin is recomputed here.
 */
export async function setCarrierRate(id, { carrierRate, allowNegativeMargin }, actor, context) {
  const load = await findLoad(id);
  assertIn(load, [...EDITABLE_LOAD_STATUSES, 'dispatched'], 'LOAD_NOT_EDITABLE', 'The carrier rate can no longer be changed.');
  const pricing = buildPricing({ customerRate: load.rate, carrierRate, currency: load.currency, allowNegativeMargin });
  assertApplied(
    await Load.updateOne(
      { _id: load._id, status: load.status, archivedAt: null },
      { $set: { carrierRate: pricing.carrierRate, ...(pricing.brokerMargin != null ? { brokerMargin: pricing.brokerMargin } : {}), updatedBy: actor.userId } }
    )
  );
  await audit(actor, context, 'carrier_rate_set', load, `Carrier rate set on load ${load.loadNumber}.`, {
    previousCarrierRate: load.carrierRate ?? null,
    carrierRate: pricing.carrierRate,
    brokerMargin: pricing.brokerMargin,
    currency: pricing.currency,
  });
  if (load.carrierId) {
    await notifyCarrier(load.carrierId, load, { type: 'load', title: 'Your pay for a load was updated', message: `The pay for load ${load.loadNumber} (${laneLabel(load)}) was updated. Open the load to see it.` });
  }
  return getLoad(id);
}

/* ---------- schedule (timezone aware) ---------- */

function resolveInstant(value, timezone, field) {
  if (value === undefined) return undefined;
  if (isLocalDateTime(value)) {
    const instant = zonedLocalToUtc(value, timezone);
    if (!instant) throw ApiError.validation([{ field, message: `${value} is not a real time in ${timezone}.` }]);
    return instant;
  }
  return new Date(value);
}

function resolveWindow(input, field) {
  if (!input) return undefined;
  const earliest = resolveInstant(input.earliest, input.timezone, `${field}.earliest`);
  const latest = resolveInstant(input.latest, input.timezone, `${field}.latest`);
  if (earliest && latest && latest < earliest) {
    throw ApiError.validation([{ field: `${field}.latest`, message: 'The latest time cannot be before the earliest time.' }]);
  }
  return { earliest, latest, timezone: input.timezone };
}

function resolveAppointment(input, field) {
  if (!input) return undefined;
  return {
    scheduledAt: resolveInstant(input.scheduledAt, input.timezone, `${field}.scheduledAt`),
    timezone: input.timezone,
    confirmationNumber: input.confirmationNumber,
    notes: input.notes,
  };
}

/**
 * Sets pickup/delivery windows and dock appointments. Every time is stored as a UTC instant together with the IANA
 * timezone of the facility; a wall-clock time without an offset is converted using the timezone supplied with it, and
 * no timezone is ever assumed.
 */
export async function scheduleLoad(id, input, actor, context) {
  const load = await findLoad(id);
  assertIn(load, CANCELLABLE_LOAD_STATUSES, 'LOAD_NOT_EDITABLE', 'The schedule can no longer be changed.');

  const pickup = resolveWindow(input.pickup, 'pickup');
  const delivery = resolveWindow(input.delivery, 'delivery');
  const pickupAppointment = resolveAppointment(input.pickupAppointment, 'pickupAppointment');
  const deliveryAppointment = resolveAppointment(input.deliveryAppointment, 'deliveryAppointment');

  const pickupStart = pickup?.earliest ?? load.pickup?.earliest;
  const deliveryEnd = delivery?.latest ?? delivery?.earliest ?? load.delivery?.latest ?? load.delivery?.earliest;
  if (pickupStart && deliveryEnd && deliveryEnd < pickupStart) {
    throw ApiError.validation([{ field: 'delivery', message: 'Delivery cannot be before the pickup.' }]);
  }
  const pickupAt = pickupAppointment?.scheduledAt ?? load.pickupAppointment?.scheduledAt;
  const deliveryAt = deliveryAppointment?.scheduledAt ?? load.deliveryAppointment?.scheduledAt;
  if (pickupAt && deliveryAt && deliveryAt < pickupAt) {
    throw ApiError.validation([{ field: 'deliveryAppointment.scheduledAt', message: 'The delivery appointment cannot be before the pickup appointment.' }]);
  }

  const set = compact({ pickup, delivery, pickupAppointment, deliveryAppointment });
  assertApplied(await Load.updateOne({ _id: load._id, status: load.status, archivedAt: null }, { $set: { ...set, updatedBy: actor.userId } }));

  // Keep a booked shipment's estimates in step with the load's schedule.
  const nextPickup = pickup?.earliest ?? load.pickup?.earliest;
  const nextDelivery = delivery?.latest ?? delivery?.earliest ?? load.delivery?.latest ?? load.delivery?.earliest;
  if (pickup || delivery) {
    await Shipment.updateOne(
      { loadId: load._id, status: { $nin: ['delivered', 'completed', 'cancelled'] } },
      { $set: compact({ estimatedPickup: nextPickup, estimatedDelivery: nextDelivery }) }
    );
  }

  await audit(actor, context, 'scheduled', load, `Schedule updated on load ${load.loadNumber}.`, {
    fields: Object.keys(set),
    timezones: [...new Set([input.pickup?.timezone, input.delivery?.timezone, input.pickupAppointment?.timezone, input.deliveryAppointment?.timezone].filter(Boolean))],
  });
  if (load.carrierId) {
    await notifyCarrier(load.carrierId, load, { type: 'load', title: 'The schedule for a load changed', message: `The schedule for load ${load.loadNumber} (${laneLabel(load)}) was updated. Open the load to see the new times.` });
  }
  return getLoad(id);
}

/* ---------- publishing ---------- */

function readinessProblems(load) {
  const problems = [];
  if (!load.pickup?.earliest || !load.pickup?.timezone) problems.push({ field: 'pickup', message: 'Set the pickup window with its timezone.' });
  if (!load.equipmentType) problems.push({ field: 'equipmentType', message: 'Choose the equipment this load needs.' });
  if (!Number.isSafeInteger(load.carrierRate) || load.carrierRate <= 0) problems.push({ field: 'carrierRate', message: 'Set the carrier rate (the pay offered to carriers).' });
  return problems;
}

/** draft -> open (publish to eligible carriers) and carrier_search -> open (stop the active search). */
export async function openLoad(id, actor, context) {
  const load = await findLoad(id);
  loadMachine.assertTransition(load.status, 'open');
  if (load.status === 'draft') {
    const problems = readinessProblems(load);
    if (problems.length > 0) throw ApiError.conflict('This load is not ready to be opened.', 'LOAD_NOT_READY', problems);
  }
  await moveLoad(load, 'open', actor);
  await audit(actor, context, 'opened', load, `Load ${load.loadNumber} was opened.`, { from: load.status });
  return getLoad(id);
}

export async function startCarrierSearch(id, actor, context) {
  const load = await findLoad(id);
  await moveLoad(load, 'carrier_search', actor);
  await audit(actor, context, 'carrier_search_started', load, `Carrier search started for load ${load.loadNumber}.`, { from: load.status });
  return getLoad(id);
}

/* ---------- assignment ---------- */

async function assertEligible(load, carrierId) {
  const { carrier, verdict } = await checkCarrierForLoad(load, carrierId);
  if (!verdict.eligible) {
    throw ApiError.conflict(
      'This carrier is not eligible for the load.',
      'CARRIER_NOT_ELIGIBLE',
      verdict.reasons.map((reason) => ({ field: 'carrierId', message: reason.message, code: reason.code }))
    );
  }
  return carrier;
}

function closeOpenEntry(history, carrierId, actor, now, reason) {
  return history.map((entry) =>
    !entry.unassignedAt && String(entry.carrierId) === String(carrierId)
      ? { ...entry, unassignedAt: now, unassignedBy: actor.userId, ...(reason ? { reason: `${entry.reason ? `${entry.reason} / ` : ''}${reason}`.slice(0, 500) } : {}) }
      : entry
  );
}

function pricingFor(load, input) {
  const carrierRate = input.carrierRate ?? load.carrierRate;
  if (!Number.isSafeInteger(carrierRate) || carrierRate <= 0) {
    throw ApiError.validation([{ field: 'carrierRate', message: 'Set a carrier rate before assigning a carrier.' }]);
  }
  return buildPricing({ customerRate: load.rate, carrierRate, currency: load.currency, allowNegativeMargin: input.allowNegativeMargin });
}

export async function assignCarrier(id, input, actor, context) {
  const load = await findLoad(id);
  assertIn(load, ASSIGNABLE_LOAD_STATUSES, 'INVALID_STATUS_TRANSITION', `A carrier can only be assigned while the load is open or in carrier search.`);
  loadMachine.assertTransition(load.status, 'assigned');
  const carrier = await assertEligible(load, input.carrierId);
  const pricing = pricingFor(load, input);
  const now = new Date();

  const history = [
    ...(load.assignmentHistory ?? []),
    { carrierId: carrier._id, assignedAt: now, assignedBy: actor.userId, reason: input.reason },
  ];
  const result = await Load.updateOne(
    { _id: load._id, status: load.status, carrierId: null, archivedAt: null },
    {
      $set: {
        carrierId: carrier._id,
        status: 'assigned',
        assignedBy: actor.userId,
        carrierRate: pricing.carrierRate,
        ...(pricing.brokerMargin != null ? { brokerMargin: pricing.brokerMargin } : {}),
        assignmentHistory: history,
        updatedBy: actor.userId,
      },
    }
  );
  assertApplied(result, 'This load was assigned or changed by someone else. Reload it and try again.');

  await audit(actor, context, 'assigned', load, `Load ${load.loadNumber} was assigned to ${carrier.companyName}.`, {
    carrierId: String(carrier._id),
    carrierRate: pricing.carrierRate,
    brokerMargin: pricing.brokerMargin,
    reason: input.reason ?? null,
  });
  await notifyCarrier(carrier._id, load, {
    eventKey: `load.assigned:${load._id}:${carrier._id}:${load.updatedAt?.getTime?.() ?? 0}`,
    type: 'load',
    title: 'A load was assigned to you',
    message: `Load ${load.loadNumber} (${laneLabel(load)}) has been assigned to your company. Open My Loads for details.`,
  });
  await notifyCustomer(load, {
    eventKey: `load.assigned.customer:${load._id}:${carrier._id}:${load.updatedAt?.getTime?.() ?? 0}`,
    type: 'load',
    title: 'A carrier was assigned to your freight',
    message: `Your freight (${laneLabel(load)}) now has a carrier assigned. We will update you as it moves.`,
  });
  return getLoad(id);
}

export async function reassignCarrier(id, input, actor, context) {
  const load = await findLoad(id);
  assertIn(load, REASSIGNABLE_LOAD_STATUSES, 'LOAD_NOT_REASSIGNABLE', 'A carrier can only be replaced before the freight is picked up.');
  if (String(load.carrierId) === String(input.carrierId)) {
    throw ApiError.conflict('That carrier is already assigned to this load.', 'CARRIER_NOT_ELIGIBLE', [{ field: 'carrierId', message: 'ALREADY_ASSIGNED', code: 'ALREADY_ASSIGNED' }]);
  }
  const carrier = await assertEligible(load, input.carrierId);
  const pricing = pricingFor(load, input);
  const now = new Date();
  const previousCarrierId = load.carrierId;

  const history = [
    ...closeOpenEntry(load.assignmentHistory ?? [], previousCarrierId, actor, now, input.reason),
    { carrierId: carrier._id, assignedAt: now, assignedBy: actor.userId, reason: input.reason },
  ];
  const result = await Load.updateOne(
    { _id: load._id, status: load.status, carrierId: previousCarrierId, archivedAt: null },
    {
      $set: {
        carrierId: carrier._id,
        assignedBy: actor.userId,
        carrierRate: pricing.carrierRate,
        ...(pricing.brokerMargin != null ? { brokerMargin: pricing.brokerMargin } : {}),
        assignmentHistory: history,
        updatedBy: actor.userId,
      },
    }
  );
  assertApplied(result, 'This load was reassigned or changed by someone else. Reload it and try again.');
  await Shipment.updateOne({ loadId: load._id, status: { $in: ['booked', 'dispatched'] } }, { $set: { carrierId: carrier._id, updatedBy: actor.userId } });

  await audit(actor, context, 'reassigned', load, `Load ${load.loadNumber} was reassigned.`, {
    fromCarrierId: String(previousCarrierId),
    toCarrierId: String(carrier._id),
    carrierRate: pricing.carrierRate,
    reason: input.reason,
  });
  await notifyCarrier(previousCarrierId, load, {
    type: 'load',
    title: 'You were removed from a load',
    message: `Load ${load.loadNumber} (${laneLabel(load)}) is no longer assigned to your company.`,
  });
  await notifyCarrier(carrier._id, load, {
    eventKey: `load.assigned:${load._id}:${carrier._id}:${load.updatedAt?.getTime?.() ?? 0}`,
    type: 'load',
    title: 'A load was assigned to you',
    message: `Load ${load.loadNumber} (${laneLabel(load)}) has been assigned to your company. Open My Loads for details.`,
  });
  return getLoad(id);
}

/** Takes the carrier off an assigned load (no shipment yet) and puts the load back in search. */
export async function unassignCarrier(id, { reason, returnTo }, actor, context) {
  const load = await findLoad(id);
  assertIn(load, ['assigned'], 'LOAD_NOT_REASSIGNABLE', 'A carrier can only be removed while the load is assigned and not yet dispatched.');
  loadMachine.assertTransition(load.status, returnTo);
  if (await Shipment.exists({ loadId: load._id })) {
    throw ApiError.conflict('A shipment exists for this load. Replace the carrier instead of removing it.', 'SHIPMENT_ALREADY_EXISTS');
  }
  const previousCarrierId = load.carrierId;
  const history = closeOpenEntry(load.assignmentHistory ?? [], previousCarrierId, actor, new Date(), reason);
  const result = await Load.updateOne(
    { _id: load._id, status: 'assigned', carrierId: previousCarrierId, archivedAt: null },
    { $set: { status: returnTo, assignmentHistory: history, updatedBy: actor.userId }, $unset: { carrierId: '', assignedBy: '' } }
  );
  assertApplied(result);
  await audit(actor, context, 'unassigned', load, `Carrier removed from load ${load.loadNumber}.`, { carrierId: String(previousCarrierId), reason, returnTo });
  await notifyCarrier(previousCarrierId, load, { type: 'load', title: 'You were removed from a load', message: `Load ${load.loadNumber} (${laneLabel(load)}) is no longer assigned to your company.` });
  return getLoad(id);
}

/* ---------- cancel / archive ---------- */

/**
 * Cancels a load and, if it has one, its live shipment (a shipment cannot outlive its load). Allowed only before pickup.
 * Nothing is deleted: the records stay for the audit trail, with the reason kept internally.
 */
export async function cancelLoad(id, { reason }, actor, context) {
  const load = await findLoad(id);
  assertIn(load, CANCELLABLE_LOAD_STATUSES, 'LOAD_NOT_CANCELLABLE', 'A load cannot be cancelled once the freight has been picked up.');
  loadMachine.assertTransition(load.status, 'cancelled');

  const shipment = await Shipment.findOne({ loadId: load._id }).select(ADMIN_SHIPMENT).lean();
  const shipmentLive = shipment && !shipmentMachine.isTerminal(shipment.status);
  if (shipmentLive) shipmentMachine.assertTransition(shipment.status, 'cancelled');

  await moveLoad(load, 'cancelled', actor, { cancelledReason: reason });
  if (shipmentLive) {
    const now = new Date();
    const shipmentResult = await Shipment.updateOne(
      { _id: shipment._id, status: shipment.status },
      {
        $set: { status: 'cancelled', cancelledAt: now, updatedBy: actor.userId },
        $push: { trackingEvents: { status: 'cancelled', description: 'Shipment cancelled.', timestamp: now, createdBy: actor.userId } },
      }
    );
    if (shipmentResult.matchedCount !== 1) {
      // The shipment moved while we were cancelling: put the load back so the two records still agree.
      await Load.updateOne({ _id: load._id, status: 'cancelled' }, { $set: { status: load.status }, $unset: { cancelledReason: '' } });
      throw ApiError.conflict('The shipment changed while cancelling. Reload and try again.', 'STALE_STATE');
    }
  }

  await audit(actor, context, 'cancelled', load, `Load ${load.loadNumber} was cancelled.`, { from: load.status, shipmentCancelled: Boolean(shipmentLive) });
  if (load.carrierId) {
    await notifyCarrier(load.carrierId, load, { type: 'load', title: 'A load was cancelled', message: `Load ${load.loadNumber} (${laneLabel(load)}) was cancelled.` });
  }
  await notifyCustomer(load, { type: 'load', title: 'Your freight was cancelled', message: `The shipment for ${laneLabel(load)} was cancelled. Contact us if you have questions.` });
  return getLoad(id);
}

export async function archiveLoad(id, actor, context) {
  const load = await findLoad(id);
  assertIn(load, ARCHIVABLE_LOAD_STATUSES, 'LOAD_NOT_ARCHIVABLE', 'Only draft, cancelled or completed loads can be archived.');
  assertApplied(await Load.updateOne({ _id: load._id, status: load.status, archivedAt: null }, { $set: { archivedAt: new Date(), archivedBy: actor.userId } }));
  await audit(actor, context, 'archived', load, `Load ${load.loadNumber} was archived.`, { status: load.status });
  return getLoad(id);
}
