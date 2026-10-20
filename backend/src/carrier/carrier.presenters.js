/**
 * Carrier-facing response shapes.
 *
 * Explicit allow-lists: a field appears in a response only because it is named here. This is the second layer behind
 * the model-level `select: false` and accessProjections (the first layer), so a future schema change still cannot
 * leak an internal field to a carrier.
 *
 * Financial rule: the only money a carrier ever sees on a load is `carrierRate` (their own pay), presented as `pay`.
 * Never named in this file: customerId, quoteId, rate (customer price), brokerMargin, assignedBy, internalNotes,
 * estimatedRate, rating, notes, storageKey, fileUrl, uploadedBy, archivedBy, tokenVersion, or any password / token
 * field. Stop contact fields (contactName / contactPhone / contactEmail) belong to the customer's facilities and are
 * not presented either.
 */

const id = (value) => (value == null ? undefined : String(value));
const iso = (value) => (value ? new Date(value).toISOString() : null);

const cityOnly = (value) => (value ? { city: value.city, state: value.state, country: value.country } : null);

/** A stop with its street address. Only for loads already assigned to the signed-in carrier. */
const fullStop = (value) =>
  value
    ? {
        facilityName: value.facilityName,
        street: value.street,
        city: value.city,
        state: value.state,
        zipCode: value.zipCode,
        country: value.country,
      }
    : null;

const position = (value) => (value ? { city: value.city, state: value.state, country: value.country } : null);
const positionLabel = (value) => (value ? [value.city, value.state, value.country].filter(Boolean).join(', ') : '');

const money = (amount, currency) => (amount == null ? null : { amount, currency: currency ?? 'USD' });
const window_ = (value) => (value ? { earliest: iso(value.earliest), latest: iso(value.latest), timezone: value.timezone ?? null } : null);
const weight = (value) => (value ? { value: value.value, unit: value.unit } : null);

const isCrossBorder = (load) => Boolean(load?.origin?.country && load?.destination?.country && load.origin.country !== load.destination.country);

const crossesBorderStatus = (shipment) => Boolean(shipment.borderStatus) && shipment.borderStatus !== 'not_applicable';

/** A load that is open and not assigned to anyone. City-level locations only: no street, facility or contacts. */
export function presentAvailableLoad(load) {
  return {
    id: id(load._id),
    loadNumber: load.loadNumber,
    status: load.status,
    origin: cityOnly(load.origin),
    destination: cityOnly(load.destination),
    pickupWindow: window_(load.pickup),
    deliveryWindow: window_(load.delivery),
    equipmentType: load.equipmentType ?? null,
    commodity: load.commodity,
    weight: weight(load.weight),
    isCrossBorder: isCrossBorder(load),
    pay: money(load.carrierRate, load.currency),
    postedAt: iso(load.createdAt),
  };
}

/** A load assigned to the signed-in carrier. */
export function presentMyLoadSummary(load) {
  return {
    id: id(load._id),
    loadNumber: load.loadNumber,
    status: load.status,
    origin: fullStop(load.origin),
    destination: fullStop(load.destination),
    pickupWindow: window_(load.pickup),
    deliveryWindow: window_(load.delivery),
    equipmentType: load.equipmentType ?? null,
    commodity: load.commodity,
    weight: weight(load.weight),
    isCrossBorder: isCrossBorder(load),
    pay: money(load.carrierRate, load.currency),
    updatedAt: iso(load.updatedAt),
  };
}

export function presentMyLoadDetail(load, { shipment = null, documents = [] } = {}) {
  return {
    ...presentMyLoadSummary(load),
    pickupAppointment: iso(load.pickupAppointment?.scheduledAt),
    pickupAppointmentTimezone: load.pickupAppointment?.timezone ?? null,
    deliveryAppointment: iso(load.deliveryAppointment?.scheduledAt),
    deliveryAppointmentTimezone: load.deliveryAppointment?.timezone ?? null,
    specialInstructions: load.specialInstructions ?? null,
    shipment: shipment
      ? { id: id(shipment._id), trackingNumber: shipment.trackingNumber, status: shipment.status }
      : null,
    documents: documents.map((document) => presentDocument(document)),
  };
}

/** Free-text event descriptions are left out: staff write them for operations and they can name a customer. */
export function presentTrackingEvents(shipment) {
  return [...(shipment.trackingEvents ?? [])]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map((event) => ({ status: event.status, timestamp: iso(event.timestamp), location: positionLabel(event.location) }));
}

export function presentBorderEvents(shipment) {
  return [...(shipment.borderEvents ?? [])]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map((event) => ({ event: event.event, timestamp: iso(event.timestamp), location: positionLabel(event.location) }));
}

export function presentShipmentSummary(shipment, load) {
  return {
    id: id(shipment._id),
    trackingNumber: shipment.trackingNumber,
    status: shipment.status,
    borderStatus: shipment.borderStatus ?? 'not_applicable',
    isCrossBorder: crossesBorderStatus(shipment),
    loadId: id(shipment.loadId),
    loadNumber: load?.loadNumber ?? null,
    origin: fullStop(load?.origin),
    destination: fullStop(load?.destination),
    equipmentType: load?.equipmentType ?? null,
    commodity: load?.commodity ?? null,
    estimatedPickup: iso(shipment.estimatedPickup),
    estimatedDelivery: iso(shipment.estimatedDelivery),
    actualPickup: iso(shipment.actualPickup),
    actualDelivery: iso(shipment.actualDelivery),
    currentLocation: position(shipment.currentLocation),
    updatedAt: iso(shipment.updatedAt),
  };
}

export function presentShipmentDetail(shipment, load, { documents = [], payments = [] } = {}) {
  return {
    ...presentShipmentSummary(shipment, load),
    pickupWindow: window_(load?.pickup),
    deliveryWindow: window_(load?.delivery),
    weight: weight(load?.weight),
    pay: money(load?.carrierRate, load?.currency),
    exception: shipment.exception
      ? { reason: shipment.exception.reason, reportedAt: iso(shipment.exception.reportedAt), resolved: Boolean(shipment.exception.resolvedAt) }
      : null,
    events: presentTrackingEvents(shipment),
    borderEvents: presentBorderEvents(shipment),
    documents: documents.map((document) => presentDocument(document)),
    payments: payments.map((payment) => presentPayment(payment)),
  };
}

export function presentTracking(shipment) {
  return {
    trackingNumber: shipment.trackingNumber,
    status: shipment.status,
    borderStatus: shipment.borderStatus ?? 'not_applicable',
    isCrossBorder: crossesBorderStatus(shipment),
    events: presentTrackingEvents(shipment),
  };
}

export function presentDocument(document, relatedLabel = null) {
  return {
    id: id(document._id),
    name: document.name,
    type: document.type,
    mimeType: document.mimeType ?? null,
    fileSize: document.fileSize ?? null,
    relatedEntityType: document.relatedEntityType,
    relatedEntityId: id(document.relatedEntityId),
    relatedLabel,
    isPrimary: Boolean(document.isPrimary),
    previewable: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(document.mimeType),
    createdAt: iso(document.createdAt),
  };
}

/** Ledger record only: the Payment model has no invoice number, due date or line items, so none are shown. */
export function presentPayment(payment, load = null) {
  return {
    id: id(payment._id),
    reference: payment.referenceNumber ?? null,
    loadId: id(payment.loadId),
    loadNumber: load?.loadNumber ?? null,
    amount: payment.amount,
    currency: payment.currency ?? 'USD',
    status: payment.status,
    paidAt: iso(payment.paymentDate),
    recordedAt: iso(payment.createdAt),
  };
}

export function presentNotification(notification) {
  return {
    id: id(notification._id),
    type: notification.type,
    title: notification.title,
    message: notification.message,
    isRead: Boolean(notification.isRead),
    relatedEntity: notification.relatedEntity?.entityType
      ? { entityType: notification.relatedEntity.entityType, entityId: id(notification.relatedEntity.entityId) }
      : null,
    createdAt: iso(notification.createdAt),
  };
}

const address = (value) =>
  value ? { street: value.street, city: value.city, state: value.state, zipCode: value.zipCode, country: value.country } : null;

export function presentProfile(user, carrier) {
  return {
    account: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? null,
      isEmailVerified: Boolean(user.isEmailVerified),
      lastLogin: iso(user.lastLogin),
      memberSince: iso(user.createdAt),
    },
    company: {
      companyName: carrier.companyName,
      contactPerson: carrier.contactPerson ?? null,
      businessEmail: carrier.email ?? null,
      phone: carrier.phone ?? null,
      address: address(carrier.address),
      equipmentTypes: [...(carrier.equipmentTypes ?? [])],
      operatingRegions: [...(carrier.operatingRegions ?? [])],
      crossBorderCapability: Boolean(carrier.crossBorderCapability),
      // Read-only: staff-managed identifiers and statuses.
      mcNumber: carrier.MCNumber ?? null,
      dotNumber: carrier.DOTNumber ?? null,
      authorityStatus: carrier.authorityStatus,
      complianceStatus: carrier.complianceStatus,
      status: carrier.status,
    },
  };
}
