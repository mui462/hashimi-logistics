import { z } from 'zod';
import { CURRENCIES, INVOICE_STATUSES, PAYABLE_STATUSES, TRANSACTION_ENTRY_TYPES, TRANSACTION_KINDS, TRANSACTION_METHODS, TRANSACTION_STATUSES } from '../models/enums.js';
import { objectIdSchema as rawObjectIdSchema } from '../validators/common.validator.js';
import { MAX_AMOUNT_MINOR } from './common.js';

/** Ids are lower-cased so "ABC…" and "abc…" can never produce different lock or idempotency keys. */
const objectIdSchema = rawObjectIdSchema.transform((value) => value.toLowerCase());
export const idParamSchema = z.object({ params: z.object({ id: objectIdSchema }) });

const text = (max, label) => z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);
const required = (max, label) => text(max, label).min(1, `${label} is required.`);
const day = z.string().regex(/^(?:19|20)\d{2}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'Enter a real calendar date.');
const cents = (label) =>
  z.number({ error: `${label} must be a whole number of cents.` }).int(`${label} must be a whole number of cents.`).positive(`${label} must be greater than zero.`).max(MAX_AMOUNT_MINOR, `${label} is too large.`);

const page = { page: z.coerce.number().int().min(1).max(10000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) };
const order = z.enum(['asc', 'desc']).default('desc');
const search = text(40, 'Search').min(2, 'Search needs at least 2 characters.');
const listQuery = (shape) => z.object({ query: z.object({ ...page, ...shape }).strict() });
const withId = (shape) => z.object({ params: idParamSchema.shape.params, body: z.object(shape).strict() });
const idOnly = z.object({ params: idParamSchema.shape.params, body: z.object({}).strict() });

const lineItem = z.object({ description: required(200, 'Description'), quantity: z.number().int().min(1).max(100000), unitAmount: cents('Unit amount') }).strict();
const lineItems = z.array(lineItem).min(1, 'Add at least one line item.').max(20, 'Use 20 line items or fewer.');

export const summarySchema = z.object({ query: z.object({}).strict() });

/* invoices */
export const listInvoicesSchema = listQuery({
  status: z.enum([...INVOICE_STATUSES, 'overdue']).optional(),
  customerId: objectIdSchema.optional(),
  loadId: objectIdSchema.optional(),
  q: search.optional(),
  dueFrom: day.optional(),
  dueTo: day.optional(),
  sort: z.enum(['createdAt', 'dueDate', 'total', 'invoiceNumber', 'issueDate']).optional(),
  order: order.optional(),
});
export const createInvoiceSchema = z.object({
  body: z.object({ loadId: objectIdSchema, lineItems, customerNote: text(1000, 'Note').optional(), internalNotes: text(2000, 'Internal notes').optional() }).strict(),
});
export const updateInvoiceSchema = withId({ lineItems: lineItems.optional(), customerNote: text(1000, 'Note').optional(), internalNotes: text(2000, 'Internal notes').optional() });
export const issueInvoiceSchema = withId({ dueDate: day.optional() });
export const voidSchema = withId({ reason: required(500, 'Reason') });

/* payments */
const paymentShape = {
  amount: cents('Amount'),
  currency: z.enum(CURRENCIES),
  method: z.enum(TRANSACTION_METHODS),
  reference: text(120, 'Reference').min(1).optional(),
  paymentDate: day,
  idempotencyKey: z.string().trim().regex(/^[A-Za-z0-9._:-]{8,64}$/, 'Use 8-64 letters, digits or . _ : -'),
  outcome: z.enum(['succeeded', 'failed']).default('succeeded'),
  failureNote: text(300, 'Failure note').optional(),
  internalNotes: text(1000, 'Internal notes').optional(),
};
const paymentBody = z
  .object(paymentShape)
  .strict()
  .superRefine((value, ctx) => {
    if (['bank_transfer', 'check'].includes(value.method) && !value.reference) {
      ctx.addIssue({ code: 'custom', path: ['reference'], message: 'A reference is required for bank transfers and checks.' });
    }
  });
export const recordPaymentSchema = z.object({ params: idParamSchema.shape.params, body: paymentBody });
export const reverseSchema = withId({ reason: required(500, 'Reason') });
export const listTransactionsSchema = listQuery({
  kind: z.enum(TRANSACTION_KINDS).optional(),
  status: z.enum(TRANSACTION_STATUSES).optional(),
  entryType: z.enum(TRANSACTION_ENTRY_TYPES).optional(),
  invoiceId: objectIdSchema.optional(),
  payableId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
  carrierId: objectIdSchema.optional(),
  from: day.optional(),
  to: day.optional(),
  sort: z.enum(['recordedAt', 'paymentDate', 'amount']).optional(),
  order: order.optional(),
});

/* payables */
export const listPayablesSchema = listQuery({
  status: z.enum(PAYABLE_STATUSES).optional(),
  carrierId: objectIdSchema.optional(),
  loadId: objectIdSchema.optional(),
  q: search.optional(),
  sort: z.enum(['createdAt', 'dueDate', 'amount', 'payableNumber']).optional(),
  order: order.optional(),
});
export const createPayableSchema = z.object({
  body: z.object({ loadId: objectIdSchema, amount: cents('Amount').optional(), dueDate: day.optional(), internalNotes: text(2000, 'Internal notes').optional() }).strict(),
});
export const updatePayableSchema = withId({ amount: cents('Amount').optional(), dueDate: day.optional(), internalNotes: text(2000, 'Internal notes').optional() });
export const holdSchema = withId({ reason: required(500, 'Reason') });
export const adjustSchema = withId({ amount: cents('Amount'), reason: required(500, 'Reason') });

/* portals (read only) */
export const customerBillingListSchema = listQuery({
  status: z.enum(['issued', 'partially_paid', 'paid', 'void', 'overdue']).optional(),
  sort: z.enum(['createdAt', 'dueDate', 'total']).optional(),
  order: order.optional(),
});
export const carrierPayablesListSchema = listQuery({
  status: z.enum(['approved', 'on_hold', 'partially_paid', 'paid']).optional(),
  sort: z.enum(['createdAt', 'dueDate', 'amount']).optional(),
  order: order.optional(),
});
export const emptyBody = idOnly;
