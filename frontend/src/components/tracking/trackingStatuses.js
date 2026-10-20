export const TRACKING_STATUSES = [
  { key: 'booked', label: 'Booked' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'picked_up', label: 'Picked Up' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'at_border', label: 'At Border', border: true },
  { key: 'border_cleared', label: 'Border Cleared', border: true },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
];

// `completed` follows `delivered` once the job is closed out. It is a label only: the progress list ends at Delivered.
export const FINAL_STATUSES = [{ key: 'completed', label: 'Completed' }];

export const EXCEPTION_STATUSES = [
  { key: 'exception', label: 'Exception' },
  { key: 'cancelled', label: 'Cancelled' },
];

export const normalizeStatus = (status) => String(status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

// Domestic shipments never show border statuses.
export const statusesFor = (isCrossBorder) => TRACKING_STATUSES.filter((s) => isCrossBorder || !s.border);

export const labelFor = (status) =>
  [...TRACKING_STATUSES, ...FINAL_STATUSES, ...EXCEPTION_STATUSES].find((s) => s.key === normalizeStatus(status))?.label || String(status || 'Unknown');
