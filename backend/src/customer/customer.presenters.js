/**
 * Customer-facing response shapes.
 *
 * These are explicit allow-lists: a field appears in a response only because it is named here.
 * That is the second layer behind the model-level `select: false` and accessProjections: even if a future
 * schema change added an internal field to a model, it would still not reach a customer.
 *
 * Never named anywhere in this file: carrierId, carrierRate, brokerMargin, internalNotes, estimatedRate, assignedTo,
 * assignedBy, uploadedBy, storageKey, fileUrl, archivedBy, tokenVersion, or any password / token field.
 */

import { QUOTE_RATE_VISIBLE_STATUSES } from '../operations/quoteStatus.service.js';

const id = (value) => (value == null ? undefined : String(value));
const iso = (value) => (value ? new Date(value).toISOString() : null);

const stop = (value) =>
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

const positionLabel = (value) =>
  value ? [value.city, value.state, value.country].filter(Boolean).join(', ') : '';

const money = (amount, currency) => (amount == null ? null : { amount, currency: currency ?? 'USD' });

export function presentQuoteSummary(quote) {
  return {
    id: id(quote._id),
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    origin: stop(quote.origin),
    destination: stop(quote.destination),
    pickupDate: iso(quote.pickupDate),
    deliveryDate: iso(quote.deliveryDate),
    equipmentType: quote.equipmentType ?? null,
    shipmentType: quote.shipmentType ?? null,
    commodity: quote.commodity,
    isCrossBorder: Boolean(quote.isCrossBorder),
    // The price is private until staff send the quote: pricing in progress, or a cancelled quote, shows no rate.
    rate: QUOTE_RATE_VISIBLE_STATUSES.includes(quote.status) ? money(quote.quotedRate, quote.currency) : null,
    quoteExpiresAt: iso(quote.quoteExpiresAt),
    acceptedAt: iso(quote.acceptedAt),
    declinedAt: iso(quote.declinedAt),
    canRespond: quote.status === 'quoted' && !(quote.quoteExpiresAt && new Date(quote.quoteExpiresAt) < new Date()),
    createdAt: iso(quote.createdAt),
    updatedAt: iso(quote.updatedAt),
  };
}

export function presentQuoteDetail(quote, linkedShipment = null) {
  return {
    ...presentQuoteSummary(quote),
    weight: quote.weight ? { value: quote.weight.value, unit: quote.weight.unit } : null,
    quantity: quote.quantity ?? null,
    pallets: quote.pallets ?? null,
    dimensions: quote.dimensions
      ? {
          length: quote.dimensions.length,
          width: quote.dimensions.width,
          height: quote.dimensions.height,
          unit: quote.dimensions.unit,
        }
      : null,
    temperatureRequirements: quote.temperatureRequirements
      ? {
          minimum: quote.temperatureRequirements.minimum,
          maximum: quote.temperatureRequirements.maximum,
          unit: quote.temperatureRequirements.unit,
          notes: quote.temperatureRequirements.notes,
        }
      : null,
    customsStatus: quote.isCrossBorder ? (quote.customsStatus ?? null) : null,
    borderCrossing: quote.isCrossBorder ? (quote.borderCrossing ?? null) : null,
    specialInstructions: quote.specialInstructions ?? null,
    contactInformation: quote.contactInformation
      ? {
          name: quote.contactInformation.name,
          email: quote.contactInformation.email,
          phone: quote.contactInformation.phone,
        }
      : null,
    shipment: linkedShipment
      ? { id: id(linkedShipment._id), trackingNumber: linkedShipment.trackingNumber, status: linkedShipment.status }
      : null,
  };
}

/** Shipment facts live on the Load (route, equipment, commodity) and the Shipment (status, tracking). */
export function presentShipmentSummary(shipment, load) {
  return {
    id: id(shipment._id),
    trackingNumber: shipment.trackingNumber,
    status: shipment.status,
    loadNumber: load?.loadNumber ?? null,
    origin: stop(load?.origin),
    destination: stop(load?.destination),
    equipmentType: load?.equipmentType ?? null,
    commodity: load?.commodity ?? null,
    isCrossBorder: shipment.borderStatus ? shipment.borderStatus !== 'not_applicable' : false,
    estimatedPickup: iso(shipment.estimatedPickup),
    estimatedDelivery: iso(shipment.estimatedDelivery),
    actualDelivery: iso(shipment.actualDelivery),
    currentLocation: position(shipment.currentLocation),
    createdAt: iso(shipment.createdAt),
    updatedAt: iso(shipment.updatedAt),
  };
}

/**
 * Tracking events are reduced to status, time and place. Free-text descriptions are left out on purpose:
 * staff write them for operations and they can name a carrier, driver or internal reason.
 */
export function presentTrackingEvents(shipment) {
  return [...(shipment.trackingEvents ?? [])]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map((event) => ({
      status: event.status,
      timestamp: iso(event.timestamp),
      location: positionLabel(event.location),
    }));
}

export function presentTracking(shipment) {
  return {
    trackingNumber: shipment.trackingNumber,
    status: shipment.status,
    isCrossBorder: shipment.borderStatus ? shipment.borderStatus !== 'not_applicable' : false,
    events: presentTrackingEvents(shipment),
  };
}

export function presentShipmentDetail(shipment, load, { documents = [], payments = [] } = {}) {
  return {
    ...presentShipmentSummary(shipment, load),
    weight: load?.weight ? { value: load.weight.value, unit: load.weight.unit } : null,
    pickupWindow: load?.pickup ? { earliest: iso(load.pickup.earliest), latest: iso(load.pickup.latest) } : null,
    deliveryWindow: load?.delivery ? { earliest: iso(load.delivery.earliest), latest: iso(load.delivery.latest) } : null,
    pickupAppointment: iso(load?.pickupAppointment?.scheduledAt),
    deliveryAppointment: iso(load?.deliveryAppointment?.scheduledAt),
    specialInstructions: load?.specialInstructions ?? null,
    actualPickup: iso(shipment.actualPickup),
    borderStatus: shipment.borderStatus ?? 'not_applicable',
    exception: shipment.exception
      ? { reason: shipment.exception.reason, reportedAt: iso(shipment.exception.reportedAt), resolved: Boolean(shipment.exception.resolvedAt) }
      : null,
    charge: money(load?.rate, load?.currency),
    events: presentTrackingEvents(shipment),
    documents: documents.map(presentDocument),
    payments: payments.map(presentInvoice),
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

/**
 * The Payment model is a ledger record, not an invoice: it has no invoice number, issue date, due date or line
 * items. This adapter exposes what exists and leaves the rest absent instead of inventing it.
 */
export function presentInvoice(payment, load = null) {
  return {
    id: id(payment._id),
    reference: payment.referenceNumber ?? null,
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
  value
    ? { street: value.street, city: value.city, state: value.state, zipCode: value.zipCode, country: value.country }
    : null;

export function presentProfile(user, customer) {
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
      companyName: customer.companyName,
      contactPerson: customer.contactPerson ?? null,
      businessEmail: customer.email ?? null,
      phone: customer.phone ?? null,
      address: address(customer.address),
      billing: customer.billingInformation
        ? {
            contactName: customer.billingInformation.contactName ?? null,
            email: customer.billingInformation.email ?? null,
            phone: customer.billingInformation.phone ?? null,
            address: address(customer.billingInformation.address),
            paymentTermsDays: customer.billingInformation.paymentTermsDays ?? null,
          }
        : null,
      status: customer.status,
    },
  };
}
