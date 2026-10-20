import { ApiError } from '../utils/ApiError.js';

/** Largest single amount accepted anywhere in the finance module: 10,000,000.00 in minor units. */
export const MAX_AMOUNT_MINOR = 1_000_000_000;

export const startOfUtcDay = (date = new Date()) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
export const parseDay = (text) => new Date(`${text}T00:00:00.000Z`);
export const addDays = (date, days) => new Date(date.getTime() + days * 86_400_000);

/** Exact integer arithmetic only. Throws if a result leaves the supported range. */
export function assertAmount(value, label = 'Amount') {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_AMOUNT_MINOR) {
    throw ApiError.validation([{ field: label, message: `${label} is outside the supported range.` }]);
  }
  return value;
}

export function buildLineItems(items) {
  const lineItems = items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unitAmount,
    amount: assertAmount(item.quantity * item.unitAmount, 'Line amount'),
  }));
  const subtotal = assertAmount(lineItems.reduce((sum, item) => sum + item.amount, 0), 'Invoice total');
  return { lineItems, subtotal, total: subtotal };
}

export const isOverdue = (invoice, now = new Date()) =>
  ['issued', 'partially_paid'].includes(invoice.status) && invoice.dueDate && new Date(invoice.dueDate) < startOfUtcDay(now);

export const outstandingOf = (record, totalField) => (record.status === 'void' ? 0 : Math.max(0, record[totalField] - (record.amountPaid ?? 0)));

/** Creates a record with a fresh sequential number, retrying on a duplicate-key conflict (the counter is atomic, so this is a safety net). */
export async function withNumberRetry(nextNumber, create, attempts = 4) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await create(await nextNumber());
    } catch (error) {
      if (error?.code !== 11000 || attempt >= attempts) throw error;
    }
  }
}

export const isDuplicateKey = (error) => error?.code === 11000;
