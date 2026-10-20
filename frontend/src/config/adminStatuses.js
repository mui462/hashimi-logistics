// Display only. The server owns every status and every allowed transition (`operationsStatus`, `nextStatuses`); this file
// turns a status string into readable text and a tone. Status is always shown as words, colour is reinforcement.
export function humanize(value) {
  if (value === null || value === undefined || value === '') return '—';
  const text = String(value).replace(/[_.-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const SUCCESS = ['handled', 'completed', 'delivered', 'customer_accepted', 'converted_to_load', 'approved', 'active', 'paid', 'cleared', 'resolved', 'success', 'verified', 'eligible', 'carrier_assigned', 'published', 'visible'];
const DANGER = ['cancelled', 'declined', 'customer_declined', 'exception', 'rejected', 'suspended', 'failed', 'failure', 'delayed', 'revoked', 'expired', 'not_eligible'];
const WARNING = ['pending', 'submitted', 'new', 'under_review', 'reviewing', 'pricing', 'processing', 'inactive', 'draft'];
const NEUTRAL = ['not_applicable', 'scheduled', 'booked', 'unknown', 'hidden', 'archived'];

export function toneFor(status) {
  const key = String(status ?? '');
  if (SUCCESS.includes(key)) return 'success';
  if (DANGER.includes(key)) return 'danger';
  if (WARNING.includes(key)) return 'warning';
  if (NEUTRAL.includes(key)) return 'neutral';
  return 'info';
}

export const QUOTE_FILTER_STATUSES = ['new', 'reviewing', 'pricing', 'quoted', 'customer_accepted', 'converted_to_load', 'declined', 'expired', 'cancelled'];
export const LOAD_FILTER_STATUSES = ['draft', 'open', 'carrier_search', 'assigned', 'dispatched', 'picked_up', 'in_transit', 'delivered', 'completed', 'cancelled'];
export const SHIPMENT_FILTER_STATUSES = ['booked', 'dispatched', 'picked_up', 'in_transit', 'at_border', 'border_cleared', 'out_for_delivery', 'delivered', 'completed', 'exception', 'cancelled'];
export const EQUIPMENT_TYPES = ['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Box Truck', 'Straight Truck', 'Cargo Van', 'Sprinter', 'Other'];
export const COUNTRIES = ['US', 'CA', 'MX'];
export const CURRENCIES = ['USD', 'CAD', 'MXN'];
export const EXCEPTION_REASONS = ['delay', 'damage', 'breakdown', 'refused', 'weather', 'documentation', 'vehicle_issue', 'appointment_issue', 'documentation_issue', 'border_issue', 'delivery_issue', 'other'];
export const MODULES = ['auth', 'users', 'customers', 'carriers', 'carrier_applications', 'contact_messages', 'quotes', 'loads', 'shipments', 'documents', 'payments', 'notifications', 'cms', 'media', 'seo', 'settings', 'system'];

export const options = (values) => values.map((value) => ({ value, label: humanize(value) }));

// Wall-clock input for stops needs an IANA zone. These are the North American zones brokerage stops fall in.
export const NA_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage',
  'America/Halifax', 'America/Toronto', 'America/Winnipeg', 'America/Edmonton', 'America/Vancouver', 'America/Mexico_City', 'UTC',
];
