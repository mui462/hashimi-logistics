import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { createNotificationLimiter, createPasswordChangeLimiter, createQuoteIpLimiter } from '../middleware/rateLimiters.js';
import preferencesRoutes from '../notifications/preferences.routes.js';
import { customerBillingRouter } from '../finance/portal.routes.js';
import { noStore } from '../middleware/noStore.js';
import { requireVerifiedEmail } from '../middleware/requireVerifiedEmail.js';
import { accessSchema } from '../documents/document.validator.js';
import * as controller from './customer.controller.js';
import {
  acceptQuoteSchema,
  changePasswordSchema,
  createQuoteSchema,
  declineQuoteSchema,
  idParamSchema,
  listDocumentsSchema,
  listInvoicesSchema,
  listNotificationsSchema,
  listQuotesSchema,
  listShipmentsSchema,
  trackingNumberSchema,
  updateProfileSchema,
} from './customer.validator.js';

/**
 * Mounted at /customer behind authenticate + requireCustomer + requireOwnerContext (see routes/index.js), so every
 * handler below already has req.user (a customer) and req.owner = { userId, customerId }.
 * Responses carry personal and financial data and are never cacheable.
 */
const router = Router();
router.use(noStore);
router.use('/notification-preferences', preferencesRoutes);
router.use('/billing', customerBillingRouter);

router.get('/dashboard', controller.dashboard);

router.get('/quotes', validate(listQuotesSchema), controller.listQuotes);
// Creating or accepting a quote needs a confirmed email address; reading everything else does not.
router.post('/quotes', requireVerifiedEmail, createQuoteIpLimiter(), createNotificationLimiter(), validate(createQuoteSchema), controller.createQuote);
router.get('/quotes/:id', validate(idParamSchema), controller.getQuote);
router.post('/quotes/:id/accept', requireVerifiedEmail, validate(acceptQuoteSchema), controller.acceptQuote);
router.post('/quotes/:id/decline', validate(declineQuoteSchema), controller.declineQuote);

router.get('/shipments', validate(listShipmentsSchema), controller.listShipments);
router.get('/shipments/:id', validate(idParamSchema), controller.getShipment);
router.get('/tracking/:trackingNumber', validate(trackingNumberSchema), controller.trackShipment);

router.get('/documents', validate(listDocumentsSchema), controller.listDocuments);
router.get('/documents/:id', validate(idParamSchema), controller.getDocument);
router.get('/documents/:id/download', validate(accessSchema), controller.downloadDocument);

router.get('/invoices', validate(listInvoicesSchema), controller.listInvoices);

router.get('/notifications', createNotificationLimiter(), validate(listNotificationsSchema), controller.listNotifications);
router.patch('/notifications/:id/read', createNotificationLimiter(), validate(idParamSchema), controller.markNotificationRead);

router.get('/profile', controller.getProfile);
router.patch('/profile', validate(updateProfileSchema), controller.updateProfile);
router.post(
  '/profile/password',
  createPasswordChangeLimiter(),
  validate(changePasswordSchema),
  controller.changePassword
);

export default router;
