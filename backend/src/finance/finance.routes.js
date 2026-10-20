import { Router } from 'express';
import { createFinanceLimiter } from '../middleware/rateLimiters.js';
import { noStore } from '../middleware/noStore.js';
import { rejectOperators } from '../middleware/rejectOperators.js';
import { validate } from '../middleware/validate.js';
import { requestContext } from '../services/activity.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { getGatewayStatus } from './gateway.js';
import * as invoices from './invoice.service.js';
import * as ledger from './ledger.service.js';
import * as payables from './payable.service.js';
import { renderAdminInvoicePdf } from './portal.service.js';
import { getFinanceSummary } from './summary.service.js';
import * as v from './finance.validator.js';

/**
 * Super Admin finance API, mounted at /api/v1/finance behind authenticate + requireSuperAdmin (routes/index.js), so a
 * customer or carrier receives 403 before any handler runs. Nothing here accepts an owner id, a status, a balance or a
 * "paid" flag from the client: owners, currency and balances come from stored records and every state change is a named action.
 */
const router = Router();
router.use(noStore);
router.use(rejectOperators);

const actor = (req) => ({ userId: req.user._id });
const send = (handler, { message, statusCode } = {}) => async (req, res) => sendSuccess(res, { data: await handler(req), message, statusCode });
const { params, body, query } = { params: (r) => r.validated.params, body: (r) => r.validated.body, query: (r) => r.validated.query };
const write = createFinanceLimiter();

router.get('/summary', validate(v.summarySchema), send(() => getFinanceSummary()));
router.get('/reconciliation', validate(v.summarySchema), send(() => ledger.reconcile()));
router.get('/payment-gateway', validate(v.summarySchema), send(() => getGatewayStatus()));

/* invoices */
router.get('/invoices', validate(v.listInvoicesSchema), send((r) => invoices.listInvoices(query(r))));
router.post('/invoices', write, validate(v.createInvoiceSchema), send((r) => invoices.createInvoice(body(r), actor(r), requestContext(r)), { message: 'Draft invoice created.', statusCode: 201 }));
router.get('/invoices/:id', validate(v.idParamSchema), send((r) => invoices.getInvoice(params(r).id)));
router.patch('/invoices/:id', write, validate(v.updateInvoiceSchema), send((r) => invoices.updateDraftInvoice(params(r).id, body(r), actor(r), requestContext(r)), { message: 'Draft invoice saved.' }));
router.post('/invoices/:id/issue', write, validate(v.issueInvoiceSchema), send((r) => invoices.issueInvoice(params(r).id, body(r), actor(r), requestContext(r)), { message: 'Invoice issued.' }));
router.post('/invoices/:id/void', write, validate(v.voidSchema), send((r) => invoices.voidInvoice(params(r).id, body(r), actor(r), requestContext(r)), { message: 'Invoice voided.' }));
router.post('/invoices/:id/payments', write, validate(v.recordPaymentSchema), async (req, res) => {
  const result = await ledger.recordCustomerReceipt(params(req).id, body(req), actor(req), requestContext(req));
  sendSuccess(res, { statusCode: result.replayed ? 200 : 201, message: result.replayed ? 'This payment was already recorded.' : 'Payment recorded (manual entry, not bank-verified).', data: result });
});
router.get('/invoices/:id/pdf', validate(v.idParamSchema), async (req, res) => {
  const pdf = await renderAdminInvoicePdf(params(req).id);
  if (!pdf) throw ApiError.notFound('Invoice not found.', 'INVOICE_NOT_FOUND');
  sendPdf(res, pdf);
});

/* ledger */
router.get('/payments', validate(v.listTransactionsSchema), send((r) => ledger.listTransactions(query(r))));
router.post('/payments/:id/reverse', write, validate(v.reverseSchema), send((r) => ledger.reverseTransaction(params(r).id, body(r), actor(r), requestContext(r)), { message: 'Payment record reversed.' }));

/* carrier payables */
router.get('/payables', validate(v.listPayablesSchema), send((r) => payables.listPayables(query(r))));
router.post('/payables', write, validate(v.createPayableSchema), send((r) => payables.createPayable(body(r), actor(r), requestContext(r)), { message: 'Draft payable created.', statusCode: 201 }));
router.get('/payables/:id', validate(v.idParamSchema), send((r) => payables.getPayable(params(r).id)));
router.patch('/payables/:id', write, validate(v.updatePayableSchema), send((r) => payables.updateDraftPayable(params(r).id, body(r), actor(r), requestContext(r)), { message: 'Draft payable saved.' }));
router.post('/payables/:id/approve', write, validate(v.emptyBody), send((r) => payables.approvePayable(params(r).id, actor(r), requestContext(r)), { message: 'Payable approved. Approval is not a payment.' }));
router.post('/payables/:id/hold', write, validate(v.holdSchema), send((r) => payables.holdPayable(params(r).id, body(r), actor(r), requestContext(r)), { message: 'Payable put on hold.' }));
router.post('/payables/:id/release', write, validate(v.emptyBody), send((r) => payables.releasePayable(params(r).id, actor(r), requestContext(r)), { message: 'Payable released.' }));
router.post('/payables/:id/adjust', write, validate(v.adjustSchema), send((r) => payables.adjustPayable(params(r).id, body(r), actor(r), requestContext(r)), { message: 'Payable amount adjusted.' }));
router.post('/payables/:id/void', write, validate(v.voidSchema), send((r) => payables.voidPayable(params(r).id, body(r), actor(r), requestContext(r)), { message: 'Payable voided.' }));
router.post('/payables/:id/payments', write, validate(v.recordPaymentSchema), async (req, res) => {
  const result = await ledger.recordCarrierPayout(params(req).id, body(req), actor(req), requestContext(req));
  sendSuccess(res, { statusCode: result.replayed ? 200 : 201, message: result.replayed ? 'This payment was already recorded.' : 'Payout recorded (manual entry; no funds were transferred by this system).', data: result });
});

export function sendPdf(res, { fileName, buffer }) {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
    'Content-Length': String(buffer.length),
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
  });
  res.status(200).end(buffer);
}

export default router;
