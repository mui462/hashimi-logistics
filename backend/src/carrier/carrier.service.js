import { Carrier } from '../models/Carrier.js';
import { Document } from '../models/Document.js';
import { Load } from '../models/Load.js';
import { Notification } from '../models/Notification.js';
import { Payment } from '../models/Payment.js';
import { Shipment } from '../models/Shipment.js';
import { User } from '../models/User.js';
import { selectionFor } from '../models/accessProjections.js';
import { recordActivity } from '../services/activity.service.js';
import * as documentService from '../documents/document.service.js';
import { storage } from '../storage/index.js';
import { assertOwnsRecord, ownershipFilter } from '../services/ownership.service.js';
import { changeOwnPassword } from '../services/passwordChange.service.js';
import { evaluateCarrierForLoad } from '../operations/carrierEligibility.service.js';
import { BOARD_LOAD_STATUSES } from '../operations/loadStatus.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ACCOUNT_TYPES } from '../utils/constants.js';
import {
  presentAvailableLoad,
  presentDocument,
  presentMyLoadDetail,
  presentMyLoadSummary,
  presentNotification,
  presentPayment,
  presentProfile,
  presentShipmentDetail,
  presentShipmentSummary,
  presentTracking,
} from './carrier.presenters.js';

/**
 * Every function receives `owner` (req.owner, resolved server-side from the session). Queries are built from
 * ownershipFilter(owner) or owner.userId; nothing here accepts a carrier id from a caller's input.
 * Projections come from accessProjections for the carrier role (customer identity and customer/margin money stay out).
 */

const ROLE = ACCOUNT_TYPES.CARRIER;
const select = (modelName) => selectionFor(modelName, ROLE) ?? '';

export const ACTIVE_LOAD_STATUSES = ['assigned', 'dispatched', 'picked_up', 'in_transit'];
export const FINISHED_SHIPMENT_STATUSES = ['delivered', 'completed', 'cancelled'];
export const IN_TRANSIT_SHIPMENT_STATUSES = ['picked_up', 'in_transit', 'at_border', 'border_cleared', 'out_for_delivery'];
const SETTLED_PAYMENT_STATUSES = ['paid', 'cancelled'];

/**
 * Phase 10: downloads and uploads are available exactly when file storage is configured (see storage/index.js). A file is
 * opened only through documents/document.service.js, which issues a short-lived link after the owner filter below matched.
 */
const storageReady = () => storage.isConfigured();
export const MESSAGING_AVAILABLE = false;

const pagination = (page, limit, total) => ({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
const skipFor = (page, limit) => (page - 1) * limit;
const NOTIFICATION_SCOPE = (owner) => ({ recipientId: owner.userId, type: { $ne: 'carrier_application' } });

/* ---------- eligibility for the open-load board ---------- */

/**
 * Open loads are visible only to carriers staff have fully cleared: active account, active authority, approved
 * compliance. A pending carrier can sign in and finish onboarding but sees no freight. The decision is read from the
 * carrier's own profile record, never from the request. Beyond that, each individual load is shown only if the carrier
 * is eligible for it (equipment, service area, cross-border, insurance ...), using the same engine staff use to assign.
 */
export async function getLoadBoardEligibility(owner) {
  const carrier = await Carrier.findOne({ _id: owner.carrierId }).active().select('status authorityStatus complianceStatus equipmentTypes operatingRegions').lean();
  if (!carrier) throw ApiError.notFound();
  const eligible = carrier.status === 'active' && carrier.authorityStatus === 'active' && carrier.complianceStatus === 'approved';
  const profileComplete = (carrier.equipmentTypes ?? []).length > 0 && (carrier.operatingRegions ?? []).length > 0;
  return {
    eligible,
    reason: eligible ? null : 'Available loads are shown once your carrier account, authority and compliance have been approved.',
    profileComplete,
    hint: eligible && !profileComplete ? 'Add your equipment types and operating regions in your profile to see loads that match you.' : null,
  };
}

/** Candidate cap for the eligibility pass: the board is a recent-freight list, not an archive. */
const BOARD_CANDIDATE_CAP = 500;

/** One load against the shared engine, using the carrier's own record (never request input). */
async function isEligibleForLoad(owner, load) {
  const [carrier, user, withHistory] = await Promise.all([
    Carrier.findOne({ _id: owner.carrierId }).active().lean(),
    User.findById(owner.userId).select('isActive').lean(),
    Load.findOne({ _id: load._id }).select('+assignmentHistory').lean(),
  ]);
  if (!carrier) return false;
  const removedCarrierIds = (withHistory?.assignmentHistory ?? []).filter((entry) => entry.unassignedAt).map((entry) => entry.carrierId);
  return evaluateCarrierForLoad({ load, carrier, user, removedCarrierIds }).eligible;
}

/**
 * Open (or carrier-search) loads this carrier is eligible for, newest first. The database narrows by equipment and
 * cross-border capability; region coverage and the remaining rules run in memory through the shared engine.
 */
async function eligibleBoardLoads(owner, { equipmentType } = {}) {
  const [carrier, user] = await Promise.all([
    Carrier.findOne({ _id: owner.carrierId }).active().lean(),
    User.findById(owner.userId).select('isActive').lean(),
  ]);
  if (!carrier) throw ApiError.notFound();
  const filter = {
    status: { $in: BOARD_LOAD_STATUSES },
    carrierId: null,
    archivedAt: null,
    ...(equipmentType ? { equipmentType } : {}),
    ...(carrier.crossBorderCapability ? {} : { crossBorder: { $ne: true } }),
  };
  const candidates = await Load.find(filter)
    .select(`${select('Load')} +assignmentHistory`)
    .sort({ createdAt: -1, _id: -1 })
    .limit(BOARD_CANDIDATE_CAP)
    .lean();
  const removed = (load) => (load.assignmentHistory ?? []).filter((entry) => entry.unassignedAt).map((entry) => entry.carrierId);
  return candidates.filter((load) => evaluateCarrierForLoad({ load, carrier, user, removedCarrierIds: removed(load) }).eligible);
}

/* ---------- helpers ---------- */

async function loadsById(owner, loadIds) {
  if (loadIds.length === 0) return new Map();
  const loads = await Load.find({ _id: { $in: loadIds }, ...ownershipFilter(owner), archivedAt: null })
    .select(select('Load'))
    .lean();
  return new Map(loads.map((load) => [String(load._id), load]));
}

// `shared` documents (for example a proof of delivery) belong to both the customer and the carrier of the shipment.
const carrierDocumentFilter = (owner) => ({ ...ownershipFilter(owner), visibility: { $in: ['carrier', 'shared'] }, archivedAt: null });

async function findOwnedShipment(owner, shipmentId) {
  const shipment = await Shipment.findOne({ _id: shipmentId, ...ownershipFilter(owner) })
    .active()
    .select(select('Shipment'))
    .lean();
  return assertOwnsRecord(owner, shipment);
}

/* ---------- dashboard ---------- */

export async function getDashboard(owner) {
  const own = ownershipFilter(owner);
  const board = await getLoadBoardEligibility(owner);

  const [
    availableLoads,
    myActiveLoads,
    activeShipments,
    inTransit,
    delivered,
    pendingPayments,
    unreadNotifications,
    recentLoads,
    recentShipments,
    recentNotifications,
  ] = await Promise.all([
    board.eligible ? eligibleBoardLoads(owner).then((loads) => loads.length) : 0,
    Load.countDocuments({ ...own, status: { $in: ACTIVE_LOAD_STATUSES }, archivedAt: null }),
    Shipment.countDocuments({ ...own, status: { $nin: FINISHED_SHIPMENT_STATUSES }, archivedAt: null }),
    Shipment.countDocuments({ ...own, status: { $in: IN_TRANSIT_SHIPMENT_STATUSES }, archivedAt: null }),
    Shipment.countDocuments({ ...own, status: { $in: ['delivered', 'completed'] }, archivedAt: null }),
    Payment.find({ ...own, paymentType: 'carrier_payment', status: { $nin: SETTLED_PAYMENT_STATUSES }, archivedAt: null })
      .select('amount currency')
      .lean(),
    Notification.countDocuments({ ...NOTIFICATION_SCOPE(owner), isRead: false }),
    Load.find({ ...own, archivedAt: null }).select(select('Load')).sort({ updatedAt: -1 }).limit(5).lean(),
    Shipment.find({ ...own, archivedAt: null }).select(select('Shipment')).sort({ createdAt: -1 }).limit(5).lean(),
    Notification.find(NOTIFICATION_SCOPE(owner)).sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  const loads = await loadsById(owner, recentShipments.map((shipment) => shipment.loadId));
  const totals = new Map();
  for (const payment of pendingPayments) {
    const currency = payment.currency ?? 'USD';
    totals.set(currency, (totals.get(currency) ?? 0) + payment.amount);
  }

  // Recent activity comes only from the carrier's own shipments. The audit log is internal and is never read here.
  const activity = recentShipments
    .flatMap((shipment) =>
      (shipment.trackingEvents ?? []).slice(-3).map((event) => ({
        kind: 'shipment',
        title: `Shipment ${shipment.trackingNumber}: ${event.status.replace(/_/g, ' ')}`,
        entityId: String(shipment._id),
        at: event.timestamp,
      }))
    )
    .filter((entry) => entry.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 8)
    .map((entry) => ({ ...entry, at: new Date(entry.at).toISOString() }));

  return {
    loadBoard: board,
    stats: {
      availableLoads,
      myActiveLoads,
      activeShipments,
      inTransit,
      delivered,
      pendingPayments: { count: pendingPayments.length, totals: [...totals].map(([currency, amount]) => ({ currency, amount })) },
      unreadNotifications,
    },
    recentLoads: recentLoads.map(presentMyLoadSummary),
    recentShipments: recentShipments.map((shipment) => presentShipmentSummary(shipment, loads.get(String(shipment.loadId)))),
    recentNotifications: recentNotifications.map(presentNotification),
    recentActivity: activity,
  };
}

/* ---------- available loads ---------- */

export async function listAvailableLoads(owner, { page, limit, equipmentType }) {
  const board = await getLoadBoardEligibility(owner);
  if (!board.eligible) {
    return { items: [], pagination: pagination(page, limit, 0), eligibility: board };
  }
  const eligibleLoads = await eligibleBoardLoads(owner, { equipmentType });
  const items = eligibleLoads.slice(skipFor(page, limit), skipFor(page, limit) + limit).map(presentAvailableLoad);
  return { items, pagination: pagination(page, limit, eligibleLoads.length), eligibility: board };
}

/**
 * A load is readable here in exactly two cases: it is assigned to this carrier, or it is open (or in carrier search),
 * unassigned and this carrier is eligible for it. Any other load (another carrier's, or open while not cleared) is a plain 404.
 * Open loads get the limited board view; assigned loads get the full carrier view.
 */
export async function getLoad(owner, loadId) {
  const load = await Load.findOne({ _id: loadId, archivedAt: null }).select(select('Load')).lean();
  if (load && String(load.carrierId) === String(owner.carrierId)) {
    return getMyLoadView(owner, load);
  }
  const board = load && !load.carrierId && BOARD_LOAD_STATUSES.includes(load.status) ? await getLoadBoardEligibility(owner) : null;
  if (!board?.eligible) throw ApiError.notFound();
  if (!(await isEligibleForLoad(owner, load))) throw ApiError.notFound();
  return { ...presentAvailableLoad(load), ownedByYou: false };
}

/* ---------- my loads ---------- */

export async function listMyLoads(owner, { page, limit, status }) {
  const filter = { ...ownershipFilter(owner), archivedAt: null, ...(status ? { status } : {}) };
  const [loads, total] = await Promise.all([
    Load.find(filter).select(select('Load')).sort({ updatedAt: -1, _id: -1 }).skip(skipFor(page, limit)).limit(limit).lean(),
    Load.countDocuments(filter),
  ]);
  return { items: loads.map(presentMyLoadSummary), pagination: pagination(page, limit, total) };
}

async function getMyLoadView(owner, load) {
  const own = ownershipFilter(owner);
  const shipment = await Shipment.findOne({ loadId: load._id, ...own, archivedAt: null }).select('trackingNumber status').lean();
  const documents = await Document.find({
    ...carrierDocumentFilter(owner),
    relatedEntityType: { $in: ['load', 'shipment'] },
    relatedEntityId: { $in: [load._id, ...(shipment ? [shipment._id] : [])] },
  })
    .select(select('Document'))
    .sort({ createdAt: -1 })
    .lean();
  return { ...presentMyLoadDetail(load, { shipment, documents }), ownedByYou: true };
}

export async function getMyLoad(owner, loadId) {
  const load = await Load.findOne({ _id: loadId, ...ownershipFilter(owner), archivedAt: null }).select(select('Load')).lean();
  assertOwnsRecord(owner, load);
  return getMyLoadView(owner, load);
}

/* ---------- shipments ---------- */

export async function listShipments(owner, { page, limit, status }) {
  const filter = { ...ownershipFilter(owner), archivedAt: null, ...(status ? { status } : {}) };
  const [shipments, total] = await Promise.all([
    Shipment.find(filter).select(select('Shipment')).sort({ createdAt: -1, _id: -1 }).skip(skipFor(page, limit)).limit(limit).lean(),
    Shipment.countDocuments(filter),
  ]);
  const loads = await loadsById(owner, shipments.map((shipment) => shipment.loadId));
  return {
    items: shipments.map((shipment) => presentShipmentSummary(shipment, loads.get(String(shipment.loadId)))),
    pagination: pagination(page, limit, total),
  };
}

export async function getShipment(owner, shipmentId) {
  const shipment = await findOwnedShipment(owner, shipmentId);
  const load = (await loadsById(owner, [shipment.loadId])).get(String(shipment.loadId)) ?? null;
  const [documents, payments] = await Promise.all([
    Document.find({
      ...carrierDocumentFilter(owner),
      relatedEntityType: { $in: ['shipment', 'load'] },
      relatedEntityId: { $in: [shipment._id, shipment.loadId] },
    })
      .select(select('Document'))
      .sort({ createdAt: -1 })
      .lean(),
    Payment.find({ ...ownershipFilter(owner), paymentType: 'carrier_payment', loadId: shipment.loadId, archivedAt: null })
      .select(select('Payment'))
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  const pod = documents.find((document) => document.type === 'POD' && document.isPrimary);
  return {
    ...presentShipmentDetail(shipment, load, { documents, payments }),
    proofOfDelivery: {
      onFile: Boolean(pod),
      uploadAllowed: storageReady() && documentService.POD_ALLOWED_STATUSES.includes(shipment.status),
      reason: !storageReady() ? 'File storage is not configured yet.' : !documentService.POD_ALLOWED_STATUSES.includes(shipment.status) ? 'Proof of delivery can be uploaded once the shipment is out for delivery or delivered.' : null,
      canReplace: Boolean(pod),
    },
    documentUploadTypes: documentService.CARRIER_UPLOAD_TYPES,
    documentUpload: {
      allowed: storageReady() && shipment.status !== 'cancelled',
      reason: !storageReady() ? 'File storage is not configured yet.' : shipment.status === 'cancelled' ? 'This shipment was cancelled, so documents can no longer be added.' : null,
    },
  };
}

/** Looks a tracking number up among this carrier's own shipments only. Someone else's number looks like a typo. */
export async function trackOwnShipment(owner, trackingNumber) {
  const shipment = await Shipment.findOne({ trackingNumber: trackingNumber.toUpperCase(), ...ownershipFilter(owner) })
    .active()
    .select(select('Shipment'))
    .lean();
  if (!shipment) throw ApiError.notFound('No shipment was found for that tracking number.', 'SHIPMENT_NOT_FOUND');
  return presentTracking(shipment);
}

/* ---------- documents ---------- */

async function relatedLabels(owner, documents) {
  const idsFor = (type) => documents.filter((d) => d.relatedEntityType === type).map((d) => d.relatedEntityId);
  const own = ownershipFilter(owner);
  const [shipments, loads] = await Promise.all([
    Shipment.find({ _id: { $in: idsFor('shipment') }, ...own }).select('trackingNumber').lean(),
    Load.find({ _id: { $in: idsFor('load') }, ...own }).select('loadNumber').lean(),
  ]);
  const labels = new Map();
  shipments.forEach((s) => labels.set(`shipment:${s._id}`, s.trackingNumber));
  loads.forEach((l) => labels.set(`load:${l._id}`, l.loadNumber));
  return (document) => labels.get(`${document.relatedEntityType}:${document.relatedEntityId}`) ?? null;
}

export async function listDocuments(owner, { page, limit }) {
  const filter = carrierDocumentFilter(owner);
  const [documents, total] = await Promise.all([
    Document.find(filter).select(select('Document')).sort({ createdAt: -1, _id: -1 }).skip(skipFor(page, limit)).limit(limit).lean(),
    Document.countDocuments(filter),
  ]);
  const labelFor = await relatedLabels(owner, documents);
  return {
    items: documents.map((document) => presentDocument(document, labelFor(document))),
    pagination: pagination(page, limit, total),
    capabilities: { download: storageReady(), upload: storageReady() },
  };
}

async function findOwnedDocument(owner, documentId) {
  const document = await Document.findOne({ _id: documentId, ...carrierDocumentFilter(owner) }).select(select('Document')).lean();
  return assertOwnsRecord(owner, document);
}

export async function getDocument(owner, documentId, context) {
  const document = await findOwnedDocument(owner, documentId);
  const labelFor = await relatedLabels(owner, [document]);
  await recordActivity({
    userId: owner.userId,
    action: 'carrier.document.viewed',
    module: 'documents',
    entityId: document._id,
    description: 'Carrier opened a document record.',
    metadata: { documentType: document.type },
    context,
  });
  return { ...presentDocument(document, labelFor(document)), capabilities: { download: storageReady() && Boolean(document.storageProvider) } };
}

/** Ownership and visibility are verified first (a foreign or archived id is a 404), then a short-lived link is issued. */
export async function authorizeDocumentDownload(owner, documentId, context, { disposition = 'attachment', user } = {}) {
  const document = await findOwnedDocument(owner, documentId);
  await recordActivity({
    userId: owner.userId,
    action: 'carrier.document.download_requested',
    module: 'documents',
    entityId: document._id,
    description: 'Carrier requested a document download.',
    metadata: { documentType: document.type, available: storageReady() && Boolean(document.storageProvider) },
    context,
  });
  const access = await documentService.issueAccess({
    documentId,
    filter: carrierDocumentFilter(owner),
    actor: user ?? { _id: owner.userId },
    role: ROLE,
    disposition,
    context,
  });
  return { access };
}

/* ---------- proof of delivery and shipment documents ---------- */

export const uploadPod = (owner, user, shipmentId, file, { fileName, replace }, context) =>
  documentService.uploadPod({ owner, user, shipmentId, file, fileName, replace, context }).then((document) => presentDocument(document));

export const uploadShipmentDocument = (owner, user, shipmentId, file, { fileName, type, name }, context) =>
  documentService.uploadShipmentDocument({ owner, user, shipmentId, type, file, fileName, name, context }).then((document) => presentDocument(document));

/* ---------- payments ---------- */

export async function listPayments(owner, { page, limit, status }) {
  const filter = { ...ownershipFilter(owner), paymentType: 'carrier_payment', archivedAt: null, ...(status ? { status } : {}) };
  const base = { ...ownershipFilter(owner), paymentType: 'carrier_payment', archivedAt: null };
  const [payments, total, open] = await Promise.all([
    Payment.find(filter).select(select('Payment')).sort({ createdAt: -1, _id: -1 }).skip(skipFor(page, limit)).limit(limit).lean(),
    Payment.countDocuments(filter),
    Payment.find({ ...base, status: { $nin: SETTLED_PAYMENT_STATUSES } }).select('amount currency').lean(),
  ]);
  const loads = await loadsById(owner, payments.map((payment) => payment.loadId));
  const totals = new Map();
  for (const payment of open) totals.set(payment.currency ?? 'USD', (totals.get(payment.currency ?? 'USD') ?? 0) + payment.amount);
  return {
    items: payments.map((payment) => presentPayment(payment, loads.get(String(payment.loadId)))),
    pagination: pagination(page, limit, total),
    summary: { pendingCount: open.length, pendingTotals: [...totals].map(([currency, amount]) => ({ currency, amount })) },
  };
}

/* ---------- messages ---------- */

/** There is no Message model yet. This reports that honestly instead of fabricating conversations. */
export function getMessages() {
  return { items: [], capabilities: { messaging: MESSAGING_AVAILABLE } };
}

/* ---------- notifications ---------- */

export async function listNotifications(owner, { page, limit, type, unread }) {
  const filter = {
    ...NOTIFICATION_SCOPE(owner),
    ...(type ? { type } : {}),
    ...(unread === undefined ? {} : { isRead: unread === 'false' }),
  };
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter).select(select('Notification')).sort({ createdAt: -1, _id: -1 }).skip(skipFor(page, limit)).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...NOTIFICATION_SCOPE(owner), isRead: false }),
  ]);
  return { items: items.map(presentNotification), pagination: pagination(page, limit, total), unreadCount };
}

export async function markNotificationRead(owner, notificationId, context) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, ...NOTIFICATION_SCOPE(owner) },
    { $set: { isRead: true } },
    { returnDocument: 'after' }
  ).lean();
  if (!notification) throw ApiError.notFound();
  await recordActivity({
    userId: owner.userId,
    action: 'carrier.notification.read',
    module: 'notifications',
    entityId: notification._id,
    description: 'Carrier marked a notification as read.',
    context,
  });
  return presentNotification(notification);
}

/* ---------- profile ---------- */

async function loadProfileRecords(owner) {
  const [user, carrier] = await Promise.all([
    User.findById(owner.userId),
    Carrier.findOne({ _id: owner.carrierId }).active().select(select('Carrier')),
  ]);
  if (!user || !carrier) throw ApiError.notFound();
  return { user, carrier };
}

export async function getProfile(owner) {
  const { user, carrier } = await loadProfileRecords(owner);
  return presentProfile(user, carrier);
}

const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

export async function updateProfile(owner, input, context) {
  const { user, carrier } = await loadProfileRecords(owner);
  const changed = [];

  const { firstName, lastName, phone, companyName, contactPerson, businessEmail, address, equipmentTypes, operatingRegions, crossBorderCapability } = input;
  const carrierChanges = compact({ companyName, contactPerson, email: businessEmail, equipmentTypes, operatingRegions, crossBorderCapability });
  Object.assign(carrier, carrierChanges);
  changed.push(...Object.keys(carrierChanges).map((key) => (key === 'email' ? 'businessEmail' : key)));
  if (phone !== undefined) {
    carrier.phone = phone;
    user.phone = phone;
    changed.push('phone');
  }
  if (address) {
    carrier.address = { ...(carrier.address?.toObject?.() ?? {}), ...compact(address) };
    changed.push('address');
  }
  if (firstName !== undefined) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  changed.push(...['firstName', 'lastName'].filter((key) => input[key] !== undefined));

  await carrier.save();
  await user.save();

  await recordActivity({
    userId: owner.userId,
    action: 'carrier.profile.updated',
    module: 'carriers',
    entityId: owner.carrierId,
    description: 'Carrier updated their profile.',
    metadata: { fields: [...new Set(changed)] },
    context,
  });
  return presentProfile(user, carrier);
}

export const changePassword = (owner, input, context) => changeOwnPassword(owner, input, context, 'carrier');
