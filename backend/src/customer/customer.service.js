import { Customer } from '../models/Customer.js';
import { Document } from '../models/Document.js';
import * as documentService from '../documents/document.service.js';
import { storage } from '../storage/index.js';
import { Load } from '../models/Load.js';
import { Notification } from '../models/Notification.js';
import { Payment } from '../models/Payment.js';
import { QuoteRequest } from '../models/QuoteRequest.js';
import { Shipment } from '../models/Shipment.js';
import { User } from '../models/User.js';
import { selectionFor } from '../models/accessProjections.js';
import { crossesBorder } from '../models/helpers/crossBorder.js';
import { changeOwnPassword } from '../services/passwordChange.service.js';
import { recordActivity } from '../services/activity.service.js';
import { nextQuoteNumber } from '../services/numbering.service.js';
import { assertOwnsRecord, ownershipFilter } from '../services/ownership.service.js';
import { notifySuperAdmins, notifyUser } from '../operations/notifications.service.js';
import { acceptQuote as acceptOwnQuote, declineQuote as declineOwnQuote } from '../operations/quoteAcceptance.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ACCOUNT_TYPES } from '../utils/constants.js';
import {
  presentDocument,
  presentInvoice,
  presentNotification,
  presentProfile,
  presentQuoteDetail,
  presentQuoteSummary,
  presentShipmentDetail,
  presentShipmentSummary,
  presentTracking,
} from './customer.presenters.js';

/**
 * Every function here receives `owner` (req.owner, resolved server-side from the session) and builds its
 * query from ownershipFilter(owner) or from owner.userId. No function accepts a customerId from a caller's input.
 * Projections come from accessProjections for the customer role.
 */

const ROLE = ACCOUNT_TYPES.CUSTOMER;
const select = (modelName) => selectionFor(modelName, ROLE) ?? '';

/** Quote statuses in which the request is still waiting on someone (not booked, finished, declined or cancelled). */
export const PENDING_QUOTE_STATUSES = ['new', 'reviewing', 'pricing', 'quoted', 'customer_accepted', 'negotiating', 'approved'];
export const FINISHED_SHIPMENT_STATUSES = ['delivered', 'completed', 'cancelled'];
export const IN_TRANSIT_SHIPMENT_STATUSES = ['picked_up', 'in_transit', 'at_border', 'border_cleared', 'out_for_delivery'];
const SETTLED_PAYMENT_STATUSES = ['paid', 'cancelled'];

/**
 * Phase 10: downloads are available exactly when file storage is configured. A file is opened only through
 * documents/document.service.js, which issues a short-lived link after this customer's access filter matched.
 */
const storageReady = () => storage.isConfigured();

const pagination = (page, limit, total) => ({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
const skipFor = (page, limit) => (page - 1) * limit;

/* ---------- helpers ---------- */

async function loadsById(owner, loadIds) {
  if (loadIds.length === 0) return new Map();
  const loads = await Load.find({ _id: { $in: loadIds }, ...ownershipFilter(owner) })
    .active()
    .select(select('Load'))
    .lean();
  return new Map(loads.map((load) => [String(load._id), load]));
}

async function findOwnedShipment(owner, shipmentId) {
  const shipment = await Shipment.findOne({ _id: shipmentId, ...ownershipFilter(owner) })
    .active()
    .select(select('Shipment'))
    .lean();
  return assertOwnsRecord(owner, shipment);
}

// `shared` documents (for example a proof of delivery) belong to both the customer and the carrier of the shipment.
const customerDocumentFilter = (owner) => ({ ...ownershipFilter(owner), visibility: { $in: ['customer', 'shared'] }, archivedAt: null });

/* ---------- dashboard ---------- */

export async function getDashboard(owner) {
  const own = ownershipFilter(owner);
  const unreadFilter = { recipientId: owner.userId, isRead: false, type: { $ne: 'carrier_application' } };

  const [
    activeShipments,
    inTransit,
    delivered,
    pendingQuotes,
    outstanding,
    unreadNotifications,
    recentQuotes,
    recentShipments,
    recentNotifications,
  ] = await Promise.all([
    Shipment.countDocuments({ ...own, status: { $nin: FINISHED_SHIPMENT_STATUSES }, archivedAt: null }),
    Shipment.countDocuments({ ...own, status: { $in: IN_TRANSIT_SHIPMENT_STATUSES }, archivedAt: null }),
    Shipment.countDocuments({ ...own, status: { $in: ['delivered', 'completed'] }, archivedAt: null }),
    QuoteRequest.countDocuments({ ...own, status: { $in: PENDING_QUOTE_STATUSES }, archivedAt: null }),
    Payment.find({
      ...own,
      paymentType: 'customer_payment',
      status: { $nin: SETTLED_PAYMENT_STATUSES },
      archivedAt: null,
    })
      .select('amount currency')
      .lean(),
    Notification.countDocuments(unreadFilter),
    QuoteRequest.find({ ...own, archivedAt: null }).select(select('QuoteRequest')).sort({ createdAt: -1 }).limit(5).lean(),
    Shipment.find({ ...own, archivedAt: null }).select(select('Shipment')).sort({ createdAt: -1 }).limit(5).lean(),
    Notification.find({ recipientId: owner.userId, type: { $ne: 'carrier_application' } })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
  ]);

  const loads = await loadsById(
    owner,
    recentShipments.map((shipment) => shipment.loadId)
  );

  const totalsByCurrency = new Map();
  for (const payment of outstanding) {
    const currency = payment.currency ?? 'USD';
    totalsByCurrency.set(currency, (totalsByCurrency.get(currency) ?? 0) + payment.amount);
  }

  // "Recent activity" is built only from the customer's own records. The audit log is internal and is never read here.
  const activity = [
    ...recentQuotes.map((quote) => ({
      kind: 'quote',
      title: `Quote request ${quote.quoteNumber} ${quote.status === 'new' ? 'submitted' : `is ${quote.status}`}`,
      entityId: String(quote._id),
      at: quote.updatedAt ?? quote.createdAt,
    })),
    ...recentShipments.flatMap((shipment) =>
      (shipment.trackingEvents ?? []).slice(-3).map((event) => ({
        kind: 'shipment',
        title: `Shipment ${shipment.trackingNumber}: ${event.status.replace(/_/g, ' ')}`,
        entityId: String(shipment._id),
        at: event.timestamp,
      }))
    ),
  ]
    .filter((entry) => entry.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 8)
    .map((entry) => ({ ...entry, at: new Date(entry.at).toISOString() }));

  return {
    stats: {
      activeShipments,
      pendingQuotes,
      inTransit,
      delivered,
      outstandingInvoices: {
        count: outstanding.length,
        totals: [...totalsByCurrency].map(([currency, amount]) => ({ currency, amount })),
      },
      unreadNotifications,
    },
    recentQuotes: recentQuotes.map(presentQuoteSummary),
    recentShipments: recentShipments.map((shipment) =>
      presentShipmentSummary(shipment, loads.get(String(shipment.loadId)))
    ),
    recentNotifications: recentNotifications.map(presentNotification),
    recentActivity: activity,
  };
}

/* ---------- quotes ---------- */

export async function listQuotes(owner, { page, limit, status }) {
  const filter = { ...ownershipFilter(owner), archivedAt: null, ...(status ? { status } : {}) };
  const [items, total] = await Promise.all([
    QuoteRequest.find(filter)
      .select(select('QuoteRequest'))
      .sort({ createdAt: -1, _id: -1 })
      .skip(skipFor(page, limit))
      .limit(limit)
      .lean(),
    QuoteRequest.countDocuments(filter),
  ]);
  return { items: items.map(presentQuoteSummary), pagination: pagination(page, limit, total) };
}

export async function getQuote(owner, quoteId) {
  const quote = await QuoteRequest.findOne({ _id: quoteId, ...ownershipFilter(owner) })
    .active()
    .select(select('QuoteRequest'))
    .lean();
  assertOwnsRecord(owner, quote);

  const load = await Load.findOne({ quoteId: quote._id, ...ownershipFilter(owner) })
    .active()
    .select('_id')
    .lean();
  const shipment = load
    ? await Shipment.findOne({ loadId: load._id, ...ownershipFilter(owner) })
        .active()
        .select('trackingNumber status')
        .lean()
    : null;
  return presentQuoteDetail(quote, shipment);
}

/**
 * Creates a quote request for the signed-in customer. customerId, quoteNumber, status and the cross-border flag are
 * set here. The validated body cannot contain any of them (the schema is strict).
 */
export async function createQuote(owner, input, context) {
  const isCrossBorder = crossesBorder(input.origin.country, input.destination.country);
  const quote = await QuoteRequest.create({
    ...input,
    customerId: owner.customerId,
    quoteNumber: await nextQuoteNumber(),
    status: 'new',
    isCrossBorder,
    originCountry: input.origin.country,
    destinationCountry: input.destination.country,
  });

  await recordActivity({
    userId: owner.userId,
    action: 'customer.quote.requested',
    module: 'quotes',
    entityId: quote._id,
    description: 'Customer submitted a quote request.',
    metadata: { quoteNumber: quote.quoteNumber, isCrossBorder },
    context,
  });
  await notifyUser(owner.userId, {
    type: 'quote',
    title: 'We received your quote request',
    message: `Quote request ${quote.quoteNumber} was received. We will review it and send you a price.`,
    entityType: 'quote',
    entityId: quote._id,
    eventKey: `quote.received:${quote._id}`,
  });
  await notifySuperAdmins({
    type: 'quote',
    title: 'A new quote request arrived',
    message: `Quote request ${quote.quoteNumber} is waiting for review.`,
    entityType: 'quote',
    entityId: quote._id,
    eventKey: `quote.created:${quote._id}`,
  });

  return presentQuoteDetail(quote.toObject());
}

/* ---------- shipments ---------- */

export async function listShipments(owner, { page, limit, status }) {
  const filter = { ...ownershipFilter(owner), archivedAt: null, ...(status ? { status } : {}) };
  const [shipments, total] = await Promise.all([
    Shipment.find(filter)
      .select(select('Shipment'))
      .sort({ createdAt: -1, _id: -1 })
      .skip(skipFor(page, limit))
      .limit(limit)
      .lean(),
    Shipment.countDocuments(filter),
  ]);
  const loads = await loadsById(
    owner,
    shipments.map((shipment) => shipment.loadId)
  );
  return {
    items: shipments.map((shipment) => presentShipmentSummary(shipment, loads.get(String(shipment.loadId)))),
    pagination: pagination(page, limit, total),
  };
}

export async function getShipment(owner, shipmentId) {
  const shipment = await findOwnedShipment(owner, shipmentId);
  const load = (await loadsById(owner, [shipment.loadId])).get(String(shipment.loadId)) ?? null;

  const relatedIds = [shipment._id, shipment.loadId];
  const [documents, payments] = await Promise.all([
    Document.find({
      ...customerDocumentFilter(owner),
      relatedEntityType: { $in: ['shipment', 'load'] },
      relatedEntityId: { $in: relatedIds },
      archivedAt: null,
    })
      .select(select('Document'))
      .sort({ createdAt: -1 })
      .lean(),
    Payment.find({
      ...ownershipFilter(owner),
      paymentType: 'customer_payment',
      loadId: shipment.loadId,
      archivedAt: null,
    })
      .select(select('Payment'))
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  return presentShipmentDetail(shipment, load, { documents, payments });
}

/** Looks a tracking number up among the customer's own shipments only. Someone else's number looks like a typo. */
export async function trackOwnShipment(owner, trackingNumber) {
  const shipment = await Shipment.findOne({
    trackingNumber: trackingNumber.toUpperCase(),
    ...ownershipFilter(owner),
  })
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
  const [quotes, shipments, loads] = await Promise.all([
    QuoteRequest.find({ _id: { $in: idsFor('quote') }, ...own }).select('quoteNumber').lean(),
    Shipment.find({ _id: { $in: idsFor('shipment') }, ...own }).select('trackingNumber').lean(),
    Load.find({ _id: { $in: idsFor('load') }, ...own }).select('loadNumber').lean(),
  ]);
  const labels = new Map();
  quotes.forEach((q) => labels.set(`quote:${q._id}`, q.quoteNumber));
  shipments.forEach((s) => labels.set(`shipment:${s._id}`, s.trackingNumber));
  loads.forEach((l) => labels.set(`load:${l._id}`, l.loadNumber));
  return (document) => labels.get(`${document.relatedEntityType}:${document.relatedEntityId}`) ?? null;
}

export async function listDocuments(owner, { page, limit }) {
  const filter = { ...customerDocumentFilter(owner), archivedAt: null };
  const [documents, total] = await Promise.all([
    Document.find(filter)
      .select(select('Document'))
      .sort({ createdAt: -1, _id: -1 })
      .skip(skipFor(page, limit))
      .limit(limit)
      .lean(),
    Document.countDocuments(filter),
  ]);
  const labelFor = await relatedLabels(owner, documents);
  return {
    items: documents.map((document) => presentDocument(document, labelFor(document))),
    pagination: pagination(page, limit, total),
    capabilities: { download: storageReady(), upload: false },
  };
}

async function findOwnedDocument(owner, documentId) {
  const document = await Document.findOne({ _id: documentId, ...customerDocumentFilter(owner) })
    .active()
    .select(select('Document'))
    .lean();
  return assertOwnsRecord(owner, document);
}

export async function getDocument(owner, documentId) {
  const document = await findOwnedDocument(owner, documentId);
  const labelFor = await relatedLabels(owner, [document]);
  return {
    ...presentDocument(document, labelFor(document)),
    capabilities: { download: storageReady() && Boolean(document.storageProvider) },
  };
}

/** Ownership and visibility are verified first (a foreign or archived id is a 404), then a short-lived link is issued. */
export async function authorizeDocumentDownload(owner, documentId, context, { disposition = 'attachment', user } = {}) {
  await findOwnedDocument(owner, documentId);
  const access = await documentService.issueAccess({
    documentId,
    filter: customerDocumentFilter(owner),
    actor: user ?? { _id: owner.userId },
    role: ACCOUNT_TYPES.CUSTOMER,
    disposition,
    context,
  });
  return { access };
}

/* ---------- invoices (adapter over Payment) ---------- */

export async function listInvoices(owner, { page, limit }) {
  const filter = { ...ownershipFilter(owner), paymentType: 'customer_payment', archivedAt: null };
  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .select(select('Payment'))
      .sort({ createdAt: -1, _id: -1 })
      .skip(skipFor(page, limit))
      .limit(limit)
      .lean(),
    Payment.countDocuments(filter),
  ]);
  const loads = await loadsById(
    owner,
    payments.map((payment) => payment.loadId)
  );
  const outstanding = await Payment.find({ ...filter, status: { $nin: SETTLED_PAYMENT_STATUSES } })
    .select('amount currency')
    .lean();
  const totals = new Map();
  for (const payment of outstanding) {
    const currency = payment.currency ?? 'USD';
    totals.set(currency, (totals.get(currency) ?? 0) + payment.amount);
  }

  return {
    items: payments.map((payment) => presentInvoice(payment, loads.get(String(payment.loadId)))),
    pagination: pagination(page, limit, total),
    summary: {
      outstandingCount: outstanding.length,
      outstandingTotals: [...totals].map(([currency, amount]) => ({ currency, amount })),
    },
  };
}

/* ---------- notifications ---------- */

export async function listNotifications(owner, { page, limit, type, unread }) {
  const filter = {
    recipientId: owner.userId,
    type: type ?? { $ne: 'carrier_application' },
    ...(unread === undefined ? {} : { isRead: unread === 'false' }),
  };
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .select(select('Notification'))
      .sort({ createdAt: -1, _id: -1 })
      .skip(skipFor(page, limit))
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipientId: owner.userId, isRead: false, type: { $ne: 'carrier_application' } }),
  ]);
  return { items: items.map(presentNotification), pagination: pagination(page, limit, total), unreadCount };
}

export async function markNotificationRead(owner, notificationId, context) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipientId: owner.userId },
    { $set: { isRead: true } },
    { returnDocument: 'after' }
  ).lean();
  if (!notification) throw ApiError.notFound();

  await recordActivity({
    userId: owner.userId,
    action: 'customer.notification.read',
    module: 'notifications',
    entityId: notification._id,
    description: 'Customer marked a notification as read.',
    context,
  });
  return presentNotification(notification);
}

/* ---------- profile ---------- */

async function loadProfileRecords(owner) {
  const [user, customer] = await Promise.all([
    User.findById(owner.userId),
    Customer.findOne({ _id: owner.customerId }).active().select(select('Customer')),
  ]);
  if (!user || !customer) throw ApiError.notFound();
  return { user, customer };
}

export async function getProfile(owner) {
  const { user, customer } = await loadProfileRecords(owner);
  return presentProfile(user, customer);
}

const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

export async function updateProfile(owner, input, context) {
  const { user, customer } = await loadProfileRecords(owner);
  const changed = [];

  // Customer (business) fields
  const { firstName, lastName, phone, companyName, contactPerson, businessEmail, address, billing } = input;
  const customerChanges = compact({ companyName, contactPerson, email: businessEmail });
  Object.assign(customer, customerChanges);
  changed.push(...Object.keys(customerChanges).map((key) => (key === 'email' ? 'businessEmail' : key)));
  if (phone !== undefined) {
    customer.phone = phone;
    changed.push('phone');
  }
  if (address) {
    customer.address = { ...(customer.address?.toObject?.() ?? {}), ...compact(address) };
    changed.push('address');
  }
  if (billing) {
    const current = customer.billingInformation?.toObject?.() ?? {};
    customer.billingInformation = {
      ...current, // keeps staff-managed paymentTermsDays untouched
      ...compact({ contactName: billing.contactName, email: billing.email, phone: billing.phone }),
      ...(billing.address ? { address: { ...(current.address ?? {}), ...compact(billing.address) } } : {}),
    };
    changed.push('billing');
  }

  // Account (user) fields. Role, status, verification state, login email and security fields are not reachable here.
  if (firstName !== undefined) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  if (phone !== undefined) user.phone = phone;
  changed.push(...['firstName', 'lastName'].filter((key) => input[key] !== undefined));

  await customer.save();
  await user.save();

  await recordActivity({
    userId: owner.userId,
    action: 'customer.profile.updated',
    module: 'customers',
    entityId: owner.customerId,
    description: 'Customer updated their profile.',
    metadata: { fields: [...new Set(changed)] },
    context,
  });
  return presentProfile(user, customer);
}

/** Password change is shared with the carrier portal; see services/passwordChange.service.js. */
export const changePassword = (owner, input, context) => changeOwnPassword(owner, input, context, 'customer');

/* ---------- quote responses (Phase 7) ---------- */

async function respondedQuote(owner, outcome) {
  return { quote: await getQuote(owner, outcome.quote._id), changed: outcome.changed };
}

export async function acceptQuote(owner, quoteId, context) {
  return respondedQuote(owner, await acceptOwnQuote(owner, quoteId, context));
}

export async function declineQuote(owner, quoteId, input, context) {
  return respondedQuote(owner, await declineOwnQuote(owner, quoteId, input, context));
}
