import mongoose from 'mongoose';
import { Carrier } from '../models/Carrier.js';
import { Customer } from '../models/Customer.js';
import { Document } from '../models/Document.js';
import { Load } from '../models/Load.js';
import { Shipment } from '../models/Shipment.js';
import { selectionFor } from '../models/accessProjections.js';
import { recordActivity } from '../services/activity.service.js';
import { generateTrackingNumber, nextShipmentNumber } from '../services/numbering.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ACCOUNT_TYPES } from '../utils/constants.js';
import { isLocalDateTime, zonedLocalToUtc } from '../utils/timezone.js';
import { assertApplied, compact, escapeRegex, laneLabel, pagination, skipFor } from './common.js';
import { cancelLoad, findLoad } from './loadOperations.service.js';
import { loadMachine } from './loadStatus.service.js';
import { notifyUser } from './notifications.service.js';
import { presentShipment, presentShipmentSummary } from './operations.presenters.js';
import { EXCEPTION_ELIGIBLE_STATUSES, LIVE_SHIPMENT_STATUSES, shipmentMachine } from './shipmentStatus.service.js';

const ADMIN_SHIPMENT = selectionFor('Shipment', ACCOUNT_TYPES.SUPER_ADMIN);
const ADMIN_LOAD = selectionFor('Load', ACCOUNT_TYPES.SUPER_ADMIN);
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const TRACKING_ATTEMPTS = 5;

/* ---------- reads ---------- */

async function findShipment(id) {
  const shipment = await Shipment.findOne({ _id: id }).active().select(ADMIN_SHIPMENT).lean();
  if (!shipment) throw ApiError.notFound('Shipment not found.', 'SHIPMENT_NOT_FOUND');
  return shipment;
}

async function mapBy(Model, ids, fields) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const rows = await Model.find({ _id: { $in: unique } }).select(fields).lean();
  return new Map(rows.map((row) => [String(row._id), row]));
}

const CUSTOMER_FIELDS = 'companyName contactPerson email phone userId';
const CARRIER_FIELDS = 'companyName contactPerson email phone MCNumber DOTNumber status userId';

async function detail(shipment) {
  const [load, customers, carriers, pod] = await Promise.all([
    Load.findOne({ _id: shipment.loadId }).select('loadNumber status origin destination pickup delivery quoteId').lean(),
    mapBy(Customer, [shipment.customerId], CUSTOMER_FIELDS),
    mapBy(Carrier, [shipment.carrierId], CARRIER_FIELDS),
    Document.findOne({ type: 'POD', relatedEntityType: 'shipment', relatedEntityId: shipment._id, isPrimary: true, archivedAt: null }).select('_id createdAt').lean(),
  ]);
  return presentShipment(shipment, { load, customer: customers.get(String(shipment.customerId)), carrier: carriers.get(String(shipment.carrierId)), pod });
}

export async function getShipment(id) {
  return { shipment: await detail(await findShipment(id)) };
}

export async function listShipments({ page, limit, status, customerId, carrierId, crossBorder, exception, live, createdFrom, createdTo, q, sort, order }) {
  const filter = { archivedAt: null };
  if (status) filter.status = status;
  if (customerId) filter.customerId = customerId;
  if (carrierId) filter.carrierId = carrierId;
  if (crossBorder) filter.borderStatus = crossBorder === 'true' ? { $ne: 'not_applicable' } : 'not_applicable';
  if (exception === 'true') filter.status = 'exception';
  if (live === 'true' && !status && exception !== 'true') filter.status = { $in: [...LIVE_SHIPMENT_STATUSES] };
  if (createdFrom || createdTo) {
    filter.createdAt = { ...(createdFrom ? { $gte: new Date(`${createdFrom}T00:00:00.000Z`) } : {}), ...(createdTo ? { $lte: new Date(`${createdTo}T23:59:59.999Z`) } : {}) };
  }
  if (q) {
    const pattern = new RegExp(`^${escapeRegex(q)}`, 'i');
    filter.$or = [{ trackingNumber: pattern }, { shipmentNumber: pattern }];
  }
  const direction = order === 'asc' ? 1 : -1;
  const [shipments, total] = await Promise.all([
    Shipment.find(filter).select(ADMIN_SHIPMENT).sort({ [sort]: direction, _id: direction }).skip(skipFor(page, limit)).limit(limit).lean(),
    Shipment.countDocuments(filter),
  ]);
  const [loads, customers, carriers] = await Promise.all([
    mapBy(Load, shipments.map((shipment) => shipment.loadId), 'loadNumber origin destination'),
    mapBy(Customer, shipments.map((shipment) => shipment.customerId), CUSTOMER_FIELDS),
    mapBy(Carrier, shipments.map((shipment) => shipment.carrierId), CARRIER_FIELDS),
  ]);
  return {
    items: shipments.map((shipment) =>
      presentShipmentSummary(shipment, {
        load: loads.get(String(shipment.loadId)),
        customer: customers.get(String(shipment.customerId)),
        carrier: carriers.get(String(shipment.carrierId)),
      })
    ),
    pagination: pagination(page, limit, total),
  };
}

/* ---------- helpers ---------- */

const audit = (actor, context, action, shipment, description, metadata = {}) =>
  recordActivity({ userId: actor.userId, action: `operations.shipment.${action}`, module: 'shipments', entityId: shipment._id, description, metadata, context });

async function userIdOf(Model, id) {
  if (!id) return undefined;
  return (await Model.findById(id).select('userId').lean())?.userId;
}

async function notifyBoth(shipment, load, { customer, carrier, eventKey }) {
  if (customer) {
    await notifyUser(await userIdOf(Customer, shipment.customerId), { type: 'shipment', ...customer, entityType: 'shipment', entityId: shipment._id, ...(eventKey ? { eventKey } : {}) });
  }
  if (carrier && shipment.carrierId) {
    await notifyUser(await userIdOf(Carrier, shipment.carrierId), { type: 'shipment', ...carrier, entityType: 'shipment', entityId: shipment._id, ...(eventKey ? { eventKey } : {}) });
  }
}

/** The instant an event happened: now unless given. Wall-clock input needs its timezone; the future is refused. */
function resolveOccurredAt({ occurredAt, timezone }) {
  if (occurredAt === undefined) return new Date();
  let instant;
  if (isLocalDateTime(occurredAt)) {
    if (!timezone) throw ApiError.validation([{ field: 'timezone', message: 'A timezone is required with a local time.' }]);
    instant = zonedLocalToUtc(occurredAt, timezone);
    if (!instant) throw ApiError.validation([{ field: 'occurredAt', message: `${occurredAt} is not a real time in ${timezone}.` }]);
  } else {
    instant = new Date(occurredAt);
  }
  if (instant.getTime() > Date.now() + CLOCK_SKEW_MS) {
    throw ApiError.validation([{ field: 'occurredAt', message: 'An event cannot be recorded in the future.' }]);
  }
  return instant;
}

const isCrossBorderShipment = (shipment) => Boolean(shipment.borderStatus) && shipment.borderStatus !== 'not_applicable';

/* ---------- creation ---------- */

/** Creates the shipment for an assigned load, once. The unique loadId index backs the "no duplicates" rule. */
export async function createShipment(loadId, actor, context) {
  const load = await findLoad(loadId);
  if (load.status !== 'assigned' || !load.carrierId) {
    throw ApiError.conflict('A shipment can only be created for a load that has a carrier assigned.', 'LOAD_NOT_ASSIGNED', [{ field: 'status', message: `The load is "${load.status}".` }]);
  }
  const existing = await Shipment.findOne({ loadId: load._id }).select('trackingNumber').lean();
  if (existing) {
    throw ApiError.conflict('This load already has a shipment.', 'SHIPMENT_ALREADY_EXISTS', [{ field: 'loadId', message: existing.trackingNumber }]);
  }

  const now = new Date();
  const shipmentNumber = await nextShipmentNumber();
  let shipment;
  for (let attempt = 1; attempt <= TRACKING_ATTEMPTS && !shipment; attempt += 1) {
    try {
      shipment = await Shipment.create({
        trackingNumber: generateTrackingNumber(),
        shipmentNumber,
        loadId: load._id,
        quoteId: load.quoteId,
        customerId: load.customerId,
        carrierId: load.carrierId,
        status: 'booked',
        estimatedPickup: load.pickup?.earliest,
        estimatedDelivery: load.delivery?.latest ?? load.delivery?.earliest,
        borderStatus: load.crossBorder ? 'pending' : 'not_applicable',
        trackingEvents: [{ status: 'booked', description: 'Shipment scheduled.', timestamp: now, createdBy: actor.userId }],
        createdBy: actor.userId,
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      if (await Shipment.exists({ loadId: load._id })) {
        throw ApiError.conflict('This load already has a shipment.', 'SHIPMENT_ALREADY_EXISTS');
      }
      // Otherwise the random tracking number collided with another shipment's: draw a new one.
      if (attempt === TRACKING_ATTEMPTS) throw error;
    }
  }

  await audit(actor, context, 'created', shipment, `Shipment ${shipment.shipmentNumber} was created for load ${load.loadNumber}.`, {
    loadId: String(load._id),
    trackingNumber: shipment.trackingNumber,
  });
  await notifyBoth(shipment, load, {
    eventKey: `shipment.created:${shipment._id}`,
    customer: { title: 'Your shipment is scheduled', message: `Shipment ${shipment.trackingNumber} (${laneLabel(load)}) has been scheduled. You can track it with this number.` },
    carrier: { title: 'A shipment was scheduled for your load', message: `Shipment ${shipment.shipmentNumber} was created for load ${load.loadNumber} (${laneLabel(load)}).` },
  });
  return getShipment(shipment._id);
}

/* ---------- status actions ---------- */

const ACTIONS = {
  dispatch: {
    to: 'dispatched',
    load: 'dispatched',
    customer: (s, l) => ({ title: 'Your shipment was dispatched', message: `Shipment ${s.trackingNumber} (${laneLabel(l)}) has been dispatched.` }),
    carrier: (s, l) => ({ title: 'Load dispatched', message: `Load ${l.loadNumber} (${laneLabel(l)}) has been dispatched. Pick up as scheduled.` }),
  },
  pickup: {
    to: 'picked_up',
    load: 'picked_up',
    actual: 'actualPickup',
    customer: (s, l) => ({ title: 'Your shipment was picked up', message: `Shipment ${s.trackingNumber} (${laneLabel(l)}) has been picked up.` }),
  },
  'in-transit': {
    to: 'in_transit',
    load: 'in_transit',
    customer: (s, l) => ({ title: 'Your shipment is in transit', message: `Shipment ${s.trackingNumber} (${laneLabel(l)}) is on its way.` }),
  },
  'at-border': {
    to: 'at_border',
    crossBorderOnly: true,
    borderStatus: 'at_border',
    borderEvent: 'at_border',
    customer: (s) => ({ title: 'Your shipment is at the border', message: `Shipment ${s.trackingNumber} has arrived at the border.` }),
  },
  'border-cleared': {
    to: 'border_cleared',
    crossBorderOnly: true,
    borderStatus: 'cleared',
    borderEvent: 'border_cleared',
    customer: (s) => ({ title: 'Your shipment cleared the border', message: `Shipment ${s.trackingNumber} has cleared the border.` }),
  },
  'out-for-delivery': {
    to: 'out_for_delivery',
    customer: (s, l) => ({ title: 'Your shipment is out for delivery', message: `Shipment ${s.trackingNumber} (${laneLabel(l)}) is out for delivery.` }),
  },
  deliver: {
    to: 'delivered',
    load: 'delivered',
    actual: 'actualDelivery',
    customer: (s, l) => ({ title: 'Your shipment was delivered', message: `Shipment ${s.trackingNumber} (${laneLabel(l)}) has been delivered.` }),
    carrier: (s, l) => ({ title: 'Delivery recorded', message: `Delivery of load ${l.loadNumber} (${laneLabel(l)}) was recorded.` }),
  },
  complete: {
    to: 'completed',
    load: 'completed',
    completedAt: true,
    customer: (s) => ({ title: 'Your shipment is complete', message: `Shipment ${s.trackingNumber} is complete.` }),
    carrier: (s, l) => ({ title: 'Load completed', message: `Load ${l.loadNumber} (${laneLabel(l)}) is complete.` }),
  },
};

export const SHIPMENT_ACTIONS = Object.freeze(Object.keys(ACTIONS));

export async function runAction(id, actionName, input, actor, context) {
  const action = ACTIONS[actionName];
  const shipment = await findShipment(id);
  shipmentMachine.assertTransition(shipment.status, action.to);
  if (action.crossBorderOnly && !isCrossBorderShipment(shipment)) {
    throw ApiError.conflict('Border steps apply only to cross-border shipments.', 'NOT_CROSS_BORDER');
  }
  // A cross-border shipment must clear customs before final delivery steps; domestic ones never touch the border.
  const load = await Load.findOne({ _id: shipment.loadId }).select(ADMIN_LOAD).lean();
  if (!load) throw ApiError.notFound('Load not found.', 'LOAD_NOT_FOUND');
  if (action.to === 'dispatched' && (load.status !== 'assigned' || String(load.carrierId) !== String(shipment.carrierId))) {
    throw ApiError.conflict('The load must be assigned to the shipment\'s carrier before dispatch.', 'LOAD_NOT_ASSIGNED');
  }
  if (isCrossBorderShipment(shipment) && ['out_for_delivery', 'delivered'].includes(action.to) && shipment.borderStatus !== 'cleared') {
    throw ApiError.conflict('This cross-border shipment has not cleared the border yet.', 'BORDER_NOT_CLEARED', [{ field: 'borderStatus', message: `Border status is "${shipment.borderStatus}".` }]);
  }

  const occurredAt = resolveOccurredAt(input);
  const loadTo = action.load && load.status !== action.load ? action.load : null;
  if (loadTo) loadMachine.assertTransition(load.status, loadTo);

  // Load first, then shipment; if the shipment write loses a race, the load change is rolled back so they never disagree.
  if (loadTo) {
    assertApplied(
      await Load.updateOne({ _id: load._id, status: load.status, archivedAt: null }, { $set: { status: loadTo, updatedBy: actor.userId } }),
      'The load changed while updating. Reload and try again.'
    );
  }
  const location = input.location;
  const set = compact({
    status: action.to,
    updatedBy: actor.userId,
    currentLocation: location,
    borderStatus: action.borderStatus,
    ...(action.actual ? { [action.actual]: occurredAt } : {}),
    ...(action.completedAt ? { completedAt: occurredAt } : {}),
  });
  const push = {
    trackingEvents: { status: action.to, location, description: input.note, timestamp: occurredAt, createdBy: actor.userId },
    ...(action.borderEvent ? { borderEvents: { event: action.borderEvent, location, description: input.note, timestamp: occurredAt, createdBy: actor.userId } } : {}),
  };
  const result = await Shipment.updateOne({ _id: shipment._id, status: shipment.status, archivedAt: null }, { $set: set, $push: push });
  if (result.matchedCount !== 1) {
    if (loadTo) await Load.updateOne({ _id: load._id, status: loadTo }, { $set: { status: load.status } });
    throw ApiError.conflict('This shipment was changed by someone else. Reload it and try again.', 'STALE_STATE');
  }

  await audit(actor, context, actionName.replace(/-/g, '_'), shipment, `Shipment ${shipment.trackingNumber}: ${shipment.status} to ${action.to}.`, {
    from: shipment.status,
    to: action.to,
    loadStatus: loadTo ?? load.status,
    occurredAt: occurredAt.toISOString(),
  });
  await notifyBoth(shipment, load, {
    eventKey: `shipment.${action.to}:${shipment._id}`,
    customer: action.customer?.(shipment, load),
    carrier: action.carrier?.(shipment, load),
  });
  return getShipment(id);
}

/** Customs and delay notes while the shipment sits at the border. Does not change the shipment status. */
export async function addBorderEvent(id, input, actor, context) {
  const shipment = await findShipment(id);
  if (!isCrossBorderShipment(shipment)) throw ApiError.conflict('Border events apply only to cross-border shipments.', 'NOT_CROSS_BORDER');
  if (shipment.status !== 'at_border') {
    throw ApiError.conflict('Border events can be added only while the shipment is at the border.', 'INVALID_STATUS_TRANSITION', [{ field: 'status', message: `The shipment is "${shipment.status}".` }]);
  }
  const occurredAt = resolveOccurredAt(input);
  const borderStatus = input.event === 'border_delayed' ? 'delayed' : 'at_border';
  assertApplied(
    await Shipment.updateOne(
      { _id: shipment._id, status: 'at_border' },
      {
        $set: { borderStatus, updatedBy: actor.userId },
        $push: { borderEvents: { event: input.event, location: input.location, description: input.note, timestamp: occurredAt, createdBy: actor.userId } },
      }
    )
  );
  await audit(actor, context, 'border_event', shipment, `Border event "${input.event}" on shipment ${shipment.trackingNumber}.`, { event: input.event });
  return getShipment(id);
}

/** A position update that does not change the status (for example a mid-route check call). */
export async function addTrackingUpdate(id, input, actor, context) {
  const shipment = await findShipment(id);
  if (!['picked_up', 'in_transit', 'at_border', 'border_cleared', 'out_for_delivery'].includes(shipment.status)) {
    throw ApiError.conflict('Location updates apply only while the freight is moving.', 'INVALID_STATUS_TRANSITION', [{ field: 'status', message: `The shipment is "${shipment.status}".` }]);
  }
  const occurredAt = resolveOccurredAt(input);
  assertApplied(
    await Shipment.updateOne(
      { _id: shipment._id, status: shipment.status },
      {
        $set: { currentLocation: input.location, updatedBy: actor.userId },
        $push: { trackingEvents: { status: shipment.status, location: input.location, description: input.note, timestamp: occurredAt, createdBy: actor.userId } },
      }
    )
  );
  await audit(actor, context, 'location_updated', shipment, `Location updated on shipment ${shipment.trackingNumber}.`, { status: shipment.status });
  return getShipment(id);
}

/* ---------- exceptions ---------- */

export async function raiseException(id, { reason, note }, actor, context) {
  const shipment = await findShipment(id);
  shipmentMachine.assertTransition(shipment.status, 'exception');
  if (!EXCEPTION_ELIGIBLE_STATUSES.includes(shipment.status)) {
    throw ApiError.conflict('An exception cannot be raised in this status.', 'INVALID_STATUS_TRANSITION');
  }
  const now = new Date();
  const exception = { _id: new mongoose.Types.ObjectId(), reason, description: note, reportedAt: now, reportedBy: actor.userId, resumeStatus: shipment.status };
  assertApplied(
    await Shipment.updateOne(
      { _id: shipment._id, status: shipment.status },
      {
        $set: { status: 'exception', exception, updatedBy: actor.userId },
        $push: { exceptions: exception, trackingEvents: { status: 'exception', description: note, timestamp: now, createdBy: actor.userId } },
      }
    )
  );
  await audit(actor, context, 'exception_raised', shipment, `Exception "${reason}" raised on shipment ${shipment.trackingNumber}.`, { reason, resumeStatus: shipment.status, exceptionId: String(exception._id) });
  const load = await Load.findOne({ _id: shipment.loadId }).select('loadNumber origin destination').lean();
  await notifyBoth(shipment, load, {
    eventKey: `shipment.exception:${shipment._id}:${exception._id}`,
    customer: { title: 'An update on your shipment', message: `Shipment ${shipment.trackingNumber} has an issue that may affect its timing. We are working on it.` },
    carrier: { title: 'An exception was recorded', message: `An exception was recorded on load ${load?.loadNumber ?? ''}. Operations may contact you.` },
  });
  return getShipment(id);
}

export async function resolveException(id, exceptionId, { note }, actor, context) {
  const shipment = await findShipment(id);
  if (shipment.status !== 'exception' || !shipment.exception || String(shipment.exception._id) !== String(exceptionId)) {
    throw ApiError.conflict('That exception is not open on this shipment.', 'EXCEPTION_NOT_OPEN');
  }
  const resumeStatus = shipment.exception.resumeStatus;
  shipmentMachine.assertTransition('exception', resumeStatus);
  const now = new Date();
  const resolved = { resolvedAt: now, resolvedBy: actor.userId, resolutionNote: note };
  const exceptions = (shipment.exceptions ?? []).map((entry) => (String(entry._id) === String(exceptionId) ? { ...entry, ...resolved } : entry));
  assertApplied(
    await Shipment.updateOne(
      { _id: shipment._id, status: 'exception', 'exception._id': shipment.exception._id },
      {
        $set: {
          status: resumeStatus,
          'exception.resolvedAt': now,
          'exception.resolvedBy': actor.userId,
          ...(note ? { 'exception.resolutionNote': note } : {}),
          exceptions,
          updatedBy: actor.userId,
        },
        $push: { trackingEvents: { status: resumeStatus, description: 'Exception resolved.', timestamp: now, createdBy: actor.userId } },
      }
    )
  );
  await audit(actor, context, 'exception_resolved', shipment, `Exception resolved on shipment ${shipment.trackingNumber}.`, { exceptionId: String(exceptionId), resumedAs: resumeStatus });
  const load = await Load.findOne({ _id: shipment.loadId }).select('loadNumber origin destination').lean();
  await notifyBoth(shipment, load, {
    eventKey: `shipment.exception_resolved:${shipment._id}:${exceptionId}`,
    customer: { title: 'Your shipment is back on track', message: `The issue on shipment ${shipment.trackingNumber} has been resolved.` },
    carrier: { title: 'An exception was resolved', message: `The exception on load ${load?.loadNumber ?? ''} was resolved.` },
  });
  return getShipment(id);
}

/* ---------- cancellation ---------- */

/** A shipment is cancelled by cancelling its load (see cancelLoad), so both always end in the same state. */
export async function cancelShipment(id, { reason }, actor, context) {
  const shipment = await findShipment(id);
  shipmentMachine.assertTransition(shipment.status, 'cancelled');
  await cancelLoad(shipment.loadId, { reason }, actor, context);
  return getShipment(id);
}
