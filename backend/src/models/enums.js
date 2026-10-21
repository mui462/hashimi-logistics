const list = (...values) => Object.freeze(values);

export const COUNTRIES = list('US', 'CA', 'MX');
export const CURRENCIES = list('USD', 'CAD', 'MXN');

export const EQUIPMENT_TYPES = list(
  'Dry Van',
  'Reefer',
  'Flatbed',
  'Step Deck',
  'Box Truck',
  'Straight Truck',
  'Cargo Van',
  'Sprinter',
  'Other'
);

export const CUSTOMER_STATUSES = list('active', 'inactive', 'suspended');
export const CARRIER_STATUSES = list('active', 'inactive', 'suspended', 'pending');
export const AUTHORITY_STATUSES = list('pending', 'active', 'inactive', 'revoked');
export const COMPLIANCE_STATUSES = list('pending', 'approved', 'rejected', 'expired');
export const CARRIER_APPLICATION_STATUSES = list('pending', 'under_review', 'approved', 'rejected');

/**
 * Quote lifecycle (Phase 7). Operations vocabulary -> stored value:
 *   submitted -> new, under_review -> reviewing, customer_declined -> declined; the rest are stored as named.
 * `negotiating`, `approved`, `booked` and `completed` are legacy Phase 2 values: still valid on old records but
 * not reachable from the operations state machine (see operations/quoteStatus.service.js).
 */
/** Where a quote request came from: the customer portal, or a guest on the public website. */
export const QUOTE_SOURCES = list('customer', 'public');

/** Public contact form (website): what the visitor is writing about, and where the office has got to with it. */
export const CONTACT_INTERESTS = list('shipping', 'carrier', 'general');
export const CONTACT_MESSAGE_STATUSES = list('new', 'handled');

export const QUOTE_STATUSES = list(
  'new',
  'reviewing',
  'pricing',
  'quoted',
  'customer_accepted',
  'converted_to_load',
  'expired',
  'negotiating',
  'approved',
  'booked',
  'completed',
  'declined',
  'cancelled'
);
export const SHIPMENT_TYPES = list('FTL', 'LTL', 'Partial', 'Expedited', 'Other');
export const CUSTOMS_STATUSES = list(
  'not_applicable',
  'not_started',
  'documents_pending',
  'in_progress',
  'cleared',
  'held'
);

/** Load lifecycle (Phase 7). `assigned` is the stored value for the operations stage "carrier_assigned". */
export const LOAD_STATUSES = list(
  'draft',
  'open',
  'carrier_search',
  'assigned',
  'dispatched',
  'picked_up',
  'in_transit',
  'delivered',
  'completed',
  'cancelled'
);
export const LOAD_STATUSES_REQUIRING_CARRIER = list(
  'assigned',
  'dispatched',
  'picked_up',
  'in_transit',
  'delivered',
  'completed'
);

export const SHIPMENT_STATUSES = list(
  'booked',
  'dispatched',
  'picked_up',
  'in_transit',
  'at_border',
  'border_cleared',
  'out_for_delivery',
  'delivered',
  'completed',
  'exception',
  'cancelled'
);
export const BORDER_STATUSES = list('not_applicable', 'pending', 'at_border', 'cleared', 'delayed');
export const BORDER_EVENT_TYPES = list(
  'at_border',
  'customs_processing',
  'border_cleared',
  'border_delayed'
);
export const EXCEPTION_REASONS = list(
  'delay',
  'damage',
  'breakdown',
  'refused',
  'weather',
  'documentation',
  'vehicle_issue',
  'appointment_issue',
  'documentation_issue',
  'border_issue',
  'delivery_issue',
  'other'
);

export const DOCUMENT_TYPES = list(
  'BOL',
  'POD',
  'Rate Confirmation',
  'W9',
  'Insurance',
  'Carrier Agreement',
  'Invoice',
  'Other'
);
export const RELATED_ENTITY_TYPES = list(
  'quote',
  'load',
  'shipment',
  'customer',
  'carrier',
  'payment',
  'carrier_application',
  'invoice',
  'carrier_payable'
);
// Phase 10 (additive): `shared` = both the owning customer and the owning carrier (and Super Admin), for example a proof of delivery.
export const DOCUMENT_VISIBILITIES = list('private', 'customer', 'carrier', 'admin', 'shared');
// Phase 10 (additive): where the file lives. `local` is the development disk provider; `memory` exists only for automated tests.
export const DOCUMENT_STORAGE_PROVIDERS = list('cloudinary', 'local', 'memory');

export const PAYMENT_STATUSES = list('pending', 'processing', 'paid', 'failed', 'cancelled');
export const PAYMENT_TYPES = list('customer_payment', 'carrier_payment', 'other');

export const NOTIFICATION_TYPES = list(
  'quote',
  'load',
  'shipment',
  'document',
  'payment',
  'carrier_application',
  'system'
);
export const NOTIFICATION_ENTITY_TYPES = list(...RELATED_ENTITY_TYPES, 'document');

// Phase 11: notification delivery (outbox). SENT means the provider accepted the message, not that it reached an inbox or phone.
export const DELIVERY_CHANNELS = list('IN_APP', 'EMAIL', 'SMS');
export const DELIVERY_STATUSES = list('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'RETRYING', 'CANCELLED');
export const DELIVERY_CATEGORIES = list('notification', 'security');

// Phase 12 (additive): invoices, carrier payables and payment transactions. `overdue` is derived from the due date, never stored.
export const INVOICE_STATUSES = list('draft', 'issued', 'partially_paid', 'paid', 'void');
export const PAYABLE_STATUSES = list('draft', 'approved', 'on_hold', 'partially_paid', 'paid', 'void');
export const TRANSACTION_KINDS = list('customer_receipt', 'carrier_payout');
export const TRANSACTION_ENTRY_TYPES = list('payment', 'reversal');
// succeeded = counted toward the balance; failed = recorded attempt that never counted; reversed = was counted, then cancelled by a linked reversal entry.
export const TRANSACTION_STATUSES = list('succeeded', 'failed', 'reversed');
export const TRANSACTION_METHODS = list('bank_transfer', 'check', 'other_offline');
export const TRANSACTION_SOURCES = list('manual');
// admin_recorded = the Super Admin entered it; nothing here verifies a bank settlement.
export const TRANSACTION_CONFIRMATIONS = list('admin_recorded');

export const ACTIVITY_MODULES = list(
  'auth',
  'users',
  'customers',
  'carriers',
  'carrier_applications',
  'contact_messages',
  'quotes',
  'loads',
  'shipments',
  'documents',
  'payments',
  'notifications',
  'cms',
  'media',
  'seo',
  'settings',
  'system'
);

export const CMS_STATUSES = list('draft', 'published', 'archived');
/** Blog posts add a scheduled state. A scheduled post goes live by itself once `scheduledAt` has passed (see cms/content.service.js). */
export const BLOG_STATUSES = list('draft', 'scheduled', 'published', 'archived');
/** System pages the public site routes to. Their key and slug never change, so editing content cannot remove a route. */
export const PAGE_KEYS = list('about', 'services', 'industries', 'service-areas', 'for-shippers', 'for-carriers', 'how-it-works', 'faq', 'contact', 'privacy', 'terms', 'become-a-carrier', 'carrier-resources', 'request-quote', 'track-shipment', 'resources');
/** Homepage sections whose order and visibility the Super Admin controls. The default order is the Phase 4 order. */
export const HOMEPAGE_SECTION_KEYS = list('trust', 'services', 'whyChooseUs', 'howItWorks', 'industries', 'crossBorder', 'serviceAreas', 'stats', 'testimonials', 'faq', 'finalCTA');
export const MEDIA_PROVIDERS = list('external', 'cloudinary', 's3', 'local', 'memory');
export const COVERAGE_TYPES = list('domestic', 'cross_border', 'both');
export const FAQ_CATEGORIES = list(
  'Shippers',
  'Carriers',
  'Quotes',
  'Tracking',
  'Cross-Border',
  'General'
);
export const MEDIA_TYPES = list('image', 'video', 'document', 'other');
export const WEEKDAYS = list(
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
);
export const SOCIAL_PLATFORMS = list('facebook', 'linkedin', 'x', 'instagram', 'youtube', 'tiktok');

export const ENTITY_MODEL_NAMES = Object.freeze({
  quote: 'QuoteRequest',
  load: 'Load',
  shipment: 'Shipment',
  customer: 'Customer',
  carrier: 'Carrier',
  payment: 'Payment',
  invoice: 'Invoice',
  carrier_payable: 'CarrierPayable',
  carrier_application: 'CarrierApplication',
  document: 'Document',
});
