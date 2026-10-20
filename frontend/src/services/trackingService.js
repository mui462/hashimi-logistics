import { ApiRequestError } from '../utils/apiRequestError';
import { apiClient } from './apiClient';

export class ShipmentNotFoundError extends Error {
  constructor() {
    super('No shipment was found for that tracking number.');
    this.name = 'ShipmentNotFoundError';
  }
}

export class TrackingUnavailableError extends Error {
  constructor() {
    super('Online tracking is not available yet. Please contact our team for a shipment update.');
    this.name = 'TrackingUnavailableError';
  }
}

// GET /tracking/:trackingNumber -> { data: { trackingNumber, status, isCrossBorder, events: [...] } }.
// Contract: a real "no such shipment" answer is HTTP 404 with { code: 'SHIPMENT_NOT_FOUND' }.
// Any other 404/405/501/502/503 means the tracking API does not exist or is down, which is reported as
// "unavailable" rather than "not found". No result is ever fabricated.
//
// `scope: 'customer'` looks the number up among the signed-in customer's own shipments (GET /customer/tracking/:n);
// the shape and the not-found / unavailable semantics are identical. `scope: 'carrier'` does the same among the
// signed-in carrier's own shipments (GET /carrier/tracking/:n).
export async function trackShipment(trackingNumber, { scope = 'public' } = {}) {
  const base = { customer: '/customer/tracking', carrier: '/carrier/tracking' }[scope] ?? '/tracking';
  try {
    const { data } = await apiClient.get(`${base}/${encodeURIComponent(trackingNumber.trim())}`);
    return data.data;
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 404 && error.code === 'SHIPMENT_NOT_FOUND') throw new ShipmentNotFoundError();
      if ([404, 405, 501, 502, 503].includes(error.status)) throw new TrackingUnavailableError();
    }
    throw error;
  }
}
