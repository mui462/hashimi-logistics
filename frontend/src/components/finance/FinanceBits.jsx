import Badge from '../common/Badge';
import { METHODS, RECORDED_NOTICE, newIdempotencyKey, statusLabel, statusTone, todayIso } from '../../config/finance';
import { ApiRequestError } from '../../utils/apiRequestError';
import { formatAmount } from '../../utils/format';
import { dollarsToCents } from '../../utils/money';

export function FinanceBadge({ status, overdue = false }) {
  if (overdue) return <Badge tone="danger">Overdue</Badge>;
  return <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>;
}

/** Both labels: "Overdue" is shown next to the stored status, never instead of it, so nothing hides that it is still unpaid. */
export function InvoiceStatus({ invoice }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <FinanceBadge status={invoice.status} />
      {invoice.isOverdue && <FinanceBadge overdue />}
    </span>
  );
}

export const Money = ({ amount, currency }) => <span className="whitespace-nowrap">{formatAmount(amount, currency)}</span>;

export function RecordedNotice({ children = RECORDED_NOTICE }) {
  return <p className="rounded-md border border-steel-300 bg-steel-50 p-3 text-base text-steel-700">{children}</p>;
}

/** Form fields for "record a payment" (dialog). A new idempotency key is created each time the dialog is built. */
export const paymentFields = (outstanding, currency) => [
  { name: 'amount', label: `Amount (${currency})`, required: true, inputMode: 'decimal', help: `Outstanding: ${formatAmount(outstanding, currency)}. Enter an amount such as 1250.00.` },
  { name: 'method', label: 'Method', type: 'select', required: true, defaultValue: 'bank_transfer', options: METHODS },
  { name: 'reference', label: 'Reference', maxLength: 120, help: 'Required for bank transfers and checks, for example a wire or check number.' },
  { name: 'paymentDate', label: 'Payment date (YYYY-MM-DD)', required: true, defaultValue: todayIso(), maxLength: 10 },
  { name: 'outcome', label: 'Outcome', type: 'select', required: true, defaultValue: 'succeeded', options: [{ value: 'succeeded', label: 'Payment received and recorded' }, { value: 'failed', label: 'Failed attempt (no balance change)' }] },
  { name: 'failureNote', label: 'Failure note', maxLength: 300, help: 'Only used for a failed attempt.' },
  { name: 'internalNotes', label: 'Internal note', type: 'textarea', maxLength: 1000, help: 'Visible to the Super Admin only.' },
];

/** Turns dialog values into the API body. Money is converted to integer cents here with exact decimal-text parsing (no floats). */
export function buildPaymentBody(values, currency, idempotencyKey) {
  const cents = dollarsToCents(values.amount);
  if (cents == null) throw new ApiRequestError('Enter the amount as a number such as 1250.00 (at most two decimals).', { status: 422 });
  if (['bank_transfer', 'check'].includes(values.method) && !values.reference) throw new ApiRequestError('Enter the reference for this bank transfer or check.', { status: 422 });
  return {
    amount: cents,
    currency,
    method: values.method,
    paymentDate: values.paymentDate,
    outcome: values.outcome,
    idempotencyKey,
    ...(values.reference ? { reference: values.reference } : {}),
    ...(values.outcome === 'failed' && values.failureNote ? { failureNote: values.failureNote } : {}),
    ...(values.internalNotes ? { internalNotes: values.internalNotes } : {}),
  };
}

export { newIdempotencyKey };
