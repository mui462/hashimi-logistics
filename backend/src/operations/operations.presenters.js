import { formatInZone } from '../utils/timezone.js';
import { loadMachine, loadOperationsStatus } from './loadStatus.service.js';
import { quoteMachine, quoteOperationsStatus } from './quoteStatus.service.js';
import { shipmentMachine, shipmentOperationsStatus } from './shipmentStatus.service.js';

/**
 * Super Admin response shapes. Admin sees everything operational (rates, margin, internal notes, carrier and customer
 * identity), but still through explicit lists so that secrets (password hashes, token versions, storage keys) can never
 * ride along if a model grows a new field.
 */

const id = (value) => (value == null ? undefined : String(value));
const iso = (value) => (value ? new Date(value).toISOString() : null);

export const money = (amount, currency) => (amount == null ? null : { amount, currency: currency ?? 'USD' });

const stop = (value) =>
  value
    ? {
        facilityName: value.facilityName,
        street: value.street,
        city: value.city,
        state: value.state,
        zipCode: value.zipCode,
        country: value.country,
        contactName: value.contactName,
        contactPhone: value.contactPhone,
        contactEmail: value.contactEmail,
      }
    : null;

const windowView = (value) =>
  value
    ? {
        earliest: iso(value.earliest),
        latest: iso(value.latest),
        timezone: value.timezone ?? null,
        earliestLocal: formatInZone(value.earliest, value.timezone),
        latestLocal: formatInZone(value.latest, value.timezone),
      }
    : null;

const appointmentView = (value) =>
  value && (value.scheduledAt || value.confirmationNumber)
    ? {
        scheduledAt: iso(value.scheduledAt),
        timezone: value.timezone ?? null,
        scheduledLocal: formatInZone(value.scheduledAt, value.timezone),
        confirmationNumber: value.confirmationNumber ?? null,
        notes: value.notes ?? null,
      }
    : null;

const weightView = (value) => (value ? { value: value.value, unit: value.unit } : null);
const position = (value) => (value ? { city: value.city, state: value.state, country: value.country, latitude: value.latitude, longitude: value.longitude } : null);

const customerView = (customer) =>
  customer
    ? { id: id(customer._id), companyName: customer.companyName, contactPerson: customer.contactPerson ?? null, email: customer.email ?? null, phone: customer.phone ?? null }
    : null;

const carrierView = (carrier) =>
  carrier
    ? {
        id: id(carrier._id),
        companyName: carrier.companyName,
        contactPerson: carrier.contactPerson ?? null,
        email: carrier.email ?? null,
        phone: carrier.phone ?? null,
        MCNumber: carrier.MCNumber ?? null,
        DOTNumber: carrier.DOTNumber ?? null,
        status: carrier.status,
      }
    : null;

const pricingView = ({ customerRate, carrierRate, brokerMargin, currency }) => ({
  customerRate: money(customerRate, currency),
  carrierRate: money(carrierRate, currency),
  brokerMargin: money(brokerMargin, currency),
  marginPercent: customerRate > 0 && brokerMargin != null ? Math.round((brokerMargin / customerRate) * 10000) / 100 : null,
});

/* ---------- quotes ---------- */

export function presentQuote(quote, { customer, load } = {}) {
  return {
    id: id(quote._id),
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    operationsStatus: quoteOperationsStatus(quote.status),
    nextStatuses: quoteMachine.nextStatuses(quote.status).map((status) => ({ status, operationsStatus: quoteOperationsStatus(status) })),
    source: quote.source ?? 'customer',
    isGuest: !quote.customerId,
    customer: quote.customerId ? customerView(customer) ?? { id: id(quote.customerId) } : null,
    origin: stop(quote.origin),
    destination: stop(quote.destination),
    pickupDate: iso(quote.pickupDate),
    deliveryDate: iso(quote.deliveryDate),
    equipmentType: quote.equipmentType ?? null,
    shipmentType: quote.shipmentType ?? null,
    commodity: quote.commodity,
    weight: weightView(quote.weight),
    quantity: quote.quantity ?? null,
    pallets: quote.pallets ?? null,
    isCrossBorder: Boolean(quote.isCrossBorder),
    customsStatus: quote.isCrossBorder ? quote.customsStatus ?? null : null,
    borderCrossing: quote.isCrossBorder ? quote.borderCrossing ?? null : null,
    specialInstructions: quote.specialInstructions ?? null,
    contactInformation: quote.contactInformation
      ? { name: quote.contactInformation.name, company: quote.contactInformation.company ?? null, email: quote.contactInformation.email, phone: quote.contactInformation.phone }
      : null,
    pricing: pricingView({ customerRate: quote.quotedRate, carrierRate: quote.estimatedRate, brokerMargin: quote.brokerMargin, currency: quote.currency }),
    quotedAt: iso(quote.quotedAt),
    quoteExpiresAt: iso(quote.quoteExpiresAt),
    acceptedAt: iso(quote.acceptedAt),
    declinedAt: iso(quote.declinedAt),
    convertedAt: iso(quote.convertedAt),
    load: load ? { id: id(load._id), loadNumber: load.loadNumber, status: load.status } : quote.loadId ? { id: id(quote.loadId) } : null,
    internalNotes: quote.internalNotes ?? null,
    cancelledReason: quote.cancelledReason ?? null,
    reviewedBy: id(quote.reviewedBy) ?? null,
    createdAt: iso(quote.createdAt),
    updatedAt: iso(quote.updatedAt),
  };
}

export function presentQuoteSummary(quote, { customer } = {}) {
  return {
    id: id(quote._id),
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    operationsStatus: quoteOperationsStatus(quote.status),
    source: quote.source ?? 'customer',
    isGuest: !quote.customerId,
    customer: quote.customerId ? customerView(customer) ?? { id: id(quote.customerId) } : null,
    guestName: quote.customerId ? null : quote.contactInformation?.company || quote.contactInformation?.name || null,
    origin: { city: quote.origin?.city, state: quote.origin?.state, country: quote.origin?.country },
    destination: { city: quote.destination?.city, state: quote.destination?.state, country: quote.destination?.country },
    pickupDate: iso(quote.pickupDate),
    equipmentType: quote.equipmentType ?? null,
    commodity: quote.commodity,
    isCrossBorder: Boolean(quote.isCrossBorder),
    pricing: pricingView({ customerRate: quote.quotedRate, carrierRate: quote.estimatedRate, brokerMargin: quote.brokerMargin, currency: quote.currency }),
    quoteExpiresAt: iso(quote.quoteExpiresAt),
    loadId: id(quote.loadId) ?? null,
    createdAt: iso(quote.createdAt),
    updatedAt: iso(quote.updatedAt),
  };
}

/* ---------- loads ---------- */

const historyView = (history = [], carriers = new Map()) =>
  history.map((entry) => ({
    carrier: carrierView(carriers.get(String(entry.carrierId))) ?? { id: id(entry.carrierId) },
    assignedAt: iso(entry.assignedAt),
    assignedBy: id(entry.assignedBy) ?? null,
    unassignedAt: iso(entry.unassignedAt),
    unassignedBy: id(entry.unassignedBy) ?? null,
    reason: entry.reason ?? null,
  }));

export function presentLoad(load, { customer, carrier, quote, shipment, carriers } = {}) {
  return {
    id: id(load._id),
    loadNumber: load.loadNumber,
    status: load.status,
    operationsStatus: loadOperationsStatus(load.status),
    nextStatuses: loadMachine.nextStatuses(load.status).map((status) => ({ status, operationsStatus: loadOperationsStatus(status) })),
    customer: customerView(customer) ?? { id: id(load.customerId) },
    carrier: load.carrierId ? carrierView(carrier) ?? { id: id(load.carrierId) } : null,
    quote: load.quoteId ? { id: id(load.quoteId), quoteNumber: quote?.quoteNumber ?? null } : null,
    shipment: shipment ? { id: id(shipment._id), trackingNumber: shipment.trackingNumber, shipmentNumber: shipment.shipmentNumber ?? null, status: shipment.status } : null,
    origin: stop(load.origin),
    destination: stop(load.destination),
    crossBorder: Boolean(load.crossBorder),
    pickup: windowView(load.pickup),
    delivery: windowView(load.delivery),
    pickupAppointment: appointmentView(load.pickupAppointment),
    deliveryAppointment: appointmentView(load.deliveryAppointment),
    equipmentType: load.equipmentType ?? null,
    commodity: load.commodity,
    weight: weightView(load.weight),
    specialInstructions: load.specialInstructions ?? null,
    pricing: pricingView({ customerRate: load.rate, carrierRate: load.carrierRate, brokerMargin: load.brokerMargin, currency: load.currency }),
    internalNotes: load.internalNotes ?? null,
    cancelledReason: load.cancelledReason ?? null,
    assignmentHistory: historyView(load.assignmentHistory, carriers),
    archivedAt: iso(load.archivedAt),
    createdAt: iso(load.createdAt),
    updatedAt: iso(load.updatedAt),
  };
}

export function presentLoadSummary(load, { customer, carrier } = {}) {
  return {
    id: id(load._id),
    loadNumber: load.loadNumber,
    status: load.status,
    operationsStatus: loadOperationsStatus(load.status),
    customer: customerView(customer) ?? { id: id(load.customerId) },
    carrier: load.carrierId ? carrierView(carrier) ?? { id: id(load.carrierId) } : null,
    origin: { city: load.origin?.city, state: load.origin?.state, country: load.origin?.country },
    destination: { city: load.destination?.city, state: load.destination?.state, country: load.destination?.country },
    crossBorder: Boolean(load.crossBorder),
    pickup: windowView(load.pickup),
    equipmentType: load.equipmentType ?? null,
    commodity: load.commodity,
    pricing: pricingView({ customerRate: load.rate, carrierRate: load.carrierRate, brokerMargin: load.brokerMargin, currency: load.currency }),
    createdAt: iso(load.createdAt),
    updatedAt: iso(load.updatedAt),
  };
}

/* ---------- shipments ---------- */

const exceptionView = (exception) =>
  exception
    ? {
        id: id(exception._id),
        reason: exception.reason,
        note: exception.description ?? null,
        reportedAt: iso(exception.reportedAt),
        reportedBy: id(exception.reportedBy) ?? null,
        resumeStatus: exception.resumeStatus ?? null,
        resolvedAt: iso(exception.resolvedAt),
        resolvedBy: id(exception.resolvedBy) ?? null,
        resolutionNote: exception.resolutionNote ?? null,
      }
    : null;

export function presentShipment(shipment, { load, customer, carrier, pod } = {}) {
  return {
    id: id(shipment._id),
    trackingNumber: shipment.trackingNumber,
    shipmentNumber: shipment.shipmentNumber ?? null,
    status: shipment.status,
    operationsStatus: shipmentOperationsStatus(shipment.status),
    nextStatuses: shipmentMachine.nextStatuses(shipment.status).map((status) => ({ status, operationsStatus: shipmentOperationsStatus(status) })),
    load: load ? { id: id(load._id), loadNumber: load.loadNumber, status: load.status } : { id: id(shipment.loadId) },
    customer: customerView(customer) ?? { id: id(shipment.customerId) },
    carrier: shipment.carrierId ? carrierView(carrier) ?? { id: id(shipment.carrierId) } : null,
    origin: stop(load?.origin),
    destination: stop(load?.destination),
    borderStatus: shipment.borderStatus ?? 'not_applicable',
    isCrossBorder: shipment.borderStatus ? shipment.borderStatus !== 'not_applicable' : false,
    currentLocation: position(shipment.currentLocation),
    estimatedPickup: iso(shipment.estimatedPickup),
    actualPickup: iso(shipment.actualPickup),
    estimatedDelivery: iso(shipment.estimatedDelivery),
    actualDelivery: iso(shipment.actualDelivery),
    pickupTimezone: load?.pickup?.timezone ?? null,
    deliveryTimezone: load?.delivery?.timezone ?? null,
    trackingEvents: [...(shipment.trackingEvents ?? [])]
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((event) => ({ id: id(event._id), status: event.status, timestamp: iso(event.timestamp), location: position(event.location), note: event.description ?? null, createdBy: id(event.createdBy) ?? null })),
    borderEvents: [...(shipment.borderEvents ?? [])]
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((event) => ({ id: id(event._id), event: event.event, timestamp: iso(event.timestamp), location: position(event.location), note: event.description ?? null })),
    exception: exceptionView(shipment.exception),
    exceptions: (shipment.exceptions ?? []).map(exceptionView),
    // Reported from the real documents: recorded only when a proof-of-delivery file is on file (Phase 10). Never invented.
    proofOfDelivery: pod
      ? { recorded: true, documentId: id(pod._id), uploadedAt: iso(pod.createdAt) }
      : { recorded: false, reason: 'No proof of delivery has been uploaded yet.' },
    completedAt: iso(shipment.completedAt),
    cancelledAt: iso(shipment.cancelledAt),
    createdAt: iso(shipment.createdAt),
    updatedAt: iso(shipment.updatedAt),
  };
}

export function presentShipmentSummary(shipment, { load, customer, carrier } = {}) {
  return {
    id: id(shipment._id),
    trackingNumber: shipment.trackingNumber,
    shipmentNumber: shipment.shipmentNumber ?? null,
    status: shipment.status,
    operationsStatus: shipmentOperationsStatus(shipment.status),
    loadId: id(shipment.loadId),
    loadNumber: load?.loadNumber ?? null,
    customer: customerView(customer) ?? { id: id(shipment.customerId) },
    carrier: shipment.carrierId ? carrierView(carrier) ?? { id: id(shipment.carrierId) } : null,
    origin: { city: load?.origin?.city, state: load?.origin?.state, country: load?.origin?.country },
    destination: { city: load?.destination?.city, state: load?.destination?.state, country: load?.destination?.country },
    isCrossBorder: shipment.borderStatus ? shipment.borderStatus !== 'not_applicable' : false,
    borderStatus: shipment.borderStatus ?? 'not_applicable',
    hasOpenException: Boolean(shipment.exception) && !shipment.exception.resolvedAt && shipment.status === 'exception',
    estimatedPickup: iso(shipment.estimatedPickup),
    estimatedDelivery: iso(shipment.estimatedDelivery),
    createdAt: iso(shipment.createdAt),
    updatedAt: iso(shipment.updatedAt),
  };
}
