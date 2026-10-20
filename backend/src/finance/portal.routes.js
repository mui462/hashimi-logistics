import { Router } from 'express';
import { noStore } from '../middleware/noStore.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getGatewayStatus } from './gateway.js';
import { sendPdf } from './finance.routes.js';
import * as portal from './portal.service.js';
import * as v from './finance.validator.js';

/** Read-only customer billing API: mounted under /api/v1/customer/billing (customer role + owner context already applied). */
export const customerBillingRouter = Router();
customerBillingRouter.use(noStore);
customerBillingRouter.get('/invoices', validate(v.customerBillingListSchema), async (req, res) =>
  sendSuccess(res, { data: { ...(await portal.listCustomerInvoices(req.owner, req.validated.query)), payment: getGatewayStatus() } })
);
customerBillingRouter.get('/invoices/:id', validate(v.idParamSchema), async (req, res) =>
  sendSuccess(res, { data: await portal.getCustomerInvoice(req.owner, req.validated.params.id) })
);
customerBillingRouter.get('/invoices/:id/pdf', validate(v.idParamSchema), async (req, res) =>
  sendPdf(res, await portal.renderCustomerInvoicePdf(req.owner, req.validated.params.id))
);

/** Read-only carrier payables API: mounted under /api/v1/carrier/payables. No write endpoint exists. */
export const carrierPayablesRouter = Router();
carrierPayablesRouter.use(noStore);
carrierPayablesRouter.get('/', validate(v.carrierPayablesListSchema), async (req, res) =>
  sendSuccess(res, { data: await portal.listCarrierPayables(req.owner, req.validated.query) })
);
carrierPayablesRouter.get('/:id', validate(v.idParamSchema), async (req, res) =>
  sendSuccess(res, { data: await portal.getCarrierPayable(req.owner, req.validated.params.id) })
);
