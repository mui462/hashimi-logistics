import { humanize } from './adminStatuses';

export const RECORDED_NOTICE = 'Payments are recorded manually by the Super Admin. A recorded payment is an administrative entry and is not bank-verified.';
export const NO_ONLINE_PAYMENT = 'Online payment is not currently available.';

export const INVOICE_STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'void'];
export const INVOICE_FILTER_STATUSES = [...INVOICE_STATUSES, 'overdue'];
export const PAYABLE_STATUSES = ['draft', 'approved', 'on_hold', 'partially_paid', 'paid', 'void'];
export const METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'check', label: 'Check' },
  { value: 'other_offline', label: 'Other offline method' },
];
export const methodLabel = (value) => METHODS.find((m) => m.value === value)?.label ?? humanize(value ?? '');

const TONES = { draft: 'neutral', issued: 'info', partially_paid: 'warning', paid: 'success', void: 'neutral', overdue: 'danger', approved: 'info', on_hold: 'warning', recorded: 'success', reversed: 'neutral', failed: 'danger', succeeded: 'success' };
export const statusTone = (status) => TONES[status] ?? 'neutral';
export const statusLabel = (status) => humanize(String(status ?? '').replace(/_/g, ' '));

/** A fresh key per form open: re-submitting the same form can never record the payment twice. */
export function newIdempotencyKey() {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `ui-${random}`;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
