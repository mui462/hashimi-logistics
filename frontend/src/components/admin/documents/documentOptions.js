export const DOCUMENT_TYPES = ['BOL', 'POD', 'Rate Confirmation', 'W9', 'Insurance', 'Invoice', 'Other'];
export const TYPE_OPTIONS = DOCUMENT_TYPES.map((value) => ({ value, label: value }));
export const VISIBILITY_LABELS = {
  private: 'Private (Super Admin only)',
  admin: 'Super Admin only',
  customer: 'Customer can see',
  carrier: 'Carrier can see',
  shared: 'Customer and carrier can see',
};
export const VISIBILITY_OPTIONS = Object.entries(VISIBILITY_LABELS).map(([value, label]) => ({ value, label }));
export const RELATED_LABELS = { shipment: 'Shipment', load: 'Load', customer: 'Customer', carrier: 'Carrier', quote: 'Quote', payment: 'Payment' };
export const PICKER_TYPES = ['shipment', 'load', 'customer', 'carrier'];
export const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';
export const DOCUMENT_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const DOCUMENT_ACCEPT_LABEL = 'PDF, JPEG, PNG or WebP.';
export const DOCUMENT_MAX_MB = 25;
