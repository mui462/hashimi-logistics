// Display helpers for the customer portal. They format real values only and show an em dash for anything missing.
const DASH = '—';

const isValid = (date) => !Number.isNaN(date.getTime());

// Date-only values (pickup and delivery dates) are stored at UTC midnight, so they are shown in UTC to avoid a day shift.
export function formatDate(value, { utc = false } = {}) {
  if (!value) return DASH;
  const date = new Date(value);
  if (!isValid(date)) return DASH;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', ...(utc ? { timeZone: 'UTC' } : {}) });
}

export function formatDateTime(value) {
  if (!value) return DASH;
  const date = new Date(value);
  if (!isValid(date)) return DASH;
  return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Amounts arrive as integer minor units (cents).
export function formatMoney(money) {
  if (!money || money.amount == null) return DASH;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: money.currency || 'USD' }).format(money.amount / 100);
}

export function formatAmount(amount, currency = 'USD') {
  return formatMoney({ amount, currency });
}

export function formatStop(stop) {
  if (!stop) return DASH;
  const place = [stop.city, stop.state].filter(Boolean).join(', ');
  return [place, stop.country].filter(Boolean).join(' · ') || DASH;
}

export const formatRoute = (origin, destination) => `${formatStop(origin)} → ${formatStop(destination)}`;

export function formatWeight(weight) {
  return weight?.value != null ? `${Number(weight.value).toLocaleString('en-US')} ${weight.unit}` : DASH;
}

export function formatFileSize(bytes) {
  if (bytes == null) return DASH;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const orDash = (value) => (value === null || value === undefined || value === '' ? DASH : value);
