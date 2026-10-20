import { labelFor } from '../components/tracking/trackingStatuses';

// Labels and tones for the real backend enums. A status is always shown as text; colour is only reinforcement.
export const QUOTE_STATUS = {
  new: { label: 'New', tone: 'neutral' },
  reviewing: { label: 'In review', tone: 'neutral' },
  pricing: { label: 'Pricing', tone: 'neutral' },
  quoted: { label: 'Quoted', tone: 'info' },
  customer_accepted: { label: 'Accepted', tone: 'success' },
  converted_to_load: { label: 'Being arranged', tone: 'success' },
  expired: { label: 'Expired', tone: 'neutral' },
  negotiating: { label: 'Negotiating', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  booked: { label: 'Booked', tone: 'success' },
  completed: { label: 'Completed', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};
export const QUOTE_STATUS_VALUES = Object.keys(QUOTE_STATUS);

export const QUOTE_STATUS_HELP = {
  new: 'Your request has been received. Our team will review it and follow up with a rate.',
  reviewing: 'Our team is reviewing your request.',
  pricing: 'Our team is preparing your rate.',
  quoted: 'A rate is ready. Review it below, then accept or decline it. You can also contact our team to discuss changes.',
  customer_accepted: 'You accepted this quote. Our team is arranging your freight.',
  converted_to_load: 'Your freight is being arranged. Shipment details appear under My Shipments once a carrier is scheduled.',
  expired: 'This quote expired. Submit a new quote request if you still need this freight moved.',
  negotiating: 'Our team is working through the details with you.',
  approved: 'This quote is approved and is being prepared for booking.',
  booked: 'This freight is booked. Shipment details appear under My Shipments once they are available.',
  completed: 'This request is complete.',
  declined: 'This request was declined.',
  cancelled: 'This request was cancelled.',
};

const SHIPMENT_TONES = { delivered: 'success', completed: 'success', exception: 'danger', cancelled: 'danger', booked: 'neutral' };
export const shipmentStatus = (status) => ({ label: labelFor(status), tone: SHIPMENT_TONES[status] ?? 'info' });
export const SHIPMENT_FILTERS = ['booked', 'dispatched', 'picked_up', 'in_transit', 'at_border', 'border_cleared', 'out_for_delivery', 'delivered', 'completed', 'exception', 'cancelled'];

export const PAYMENT_STATUS = {
  pending: { label: 'Pending', tone: 'warning' },
  processing: { label: 'Processing', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const NOTIFICATION_TYPE_LABELS = {
  quote: 'Quote', load: 'Load', shipment: 'Shipment', document: 'Document', payment: 'Billing', system: 'System',
};

export const DOCUMENT_TYPE_LABELS = { BOL: 'Bill of lading', POD: 'Proof of delivery', 'Rate Confirmation': 'Rate confirmation', Invoice: 'Invoice' };

// Load statuses (carrier portal). "open" means unassigned; the other values follow the load through delivery.
export const LOAD_STATUS = {
  draft: { label: 'Draft', tone: 'neutral' },
  open: { label: 'Open', tone: 'info' },
  carrier_search: { label: 'Finding a carrier', tone: 'info' },
  assigned: { label: 'Assigned', tone: 'neutral' },
  dispatched: { label: 'Dispatched', tone: 'info' },
  picked_up: { label: 'Picked up', tone: 'info' },
  in_transit: { label: 'In transit', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'success' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};
export const LOAD_FILTERS = ['assigned', 'dispatched', 'picked_up', 'in_transit', 'delivered', 'completed', 'cancelled'];
