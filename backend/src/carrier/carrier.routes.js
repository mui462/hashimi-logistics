import { Router } from 'express';
import { noStore } from '../middleware/noStore.js';
import { createNotificationLimiter, createPasswordChangeLimiter, createUploadLimiter } from '../middleware/rateLimiters.js';
import preferencesRoutes from '../notifications/preferences.routes.js';
import { carrierPayablesRouter } from '../finance/portal.routes.js';
import { validate } from '../middleware/validate.js';
import { accessSchema, carrierDocumentUploadSchema, carrierPodSchema } from '../documents/document.validator.js';
import { readUpload, requireStorage } from '../storage/uploadBody.js';
import * as controller from './carrier.controller.js';
import {
  changePasswordSchema,
  idParamSchema,
  listDocumentsSchema,
  listLoadsSchema,
  listMyLoadsSchema,
  listNotificationsSchema,
  listPaymentsSchema,
  listShipmentsSchema,
  trackingNumberSchema,
  updateProfileSchema,
} from './carrier.validator.js';

/**
 * Mounted at /carrier behind authenticate + requireCarrier + requireOwnerContext (see routes/index.js), so every
 * handler already has req.user (a carrier) and req.owner = { userId, carrierId }.
 * Responses carry business and financial data and are never cacheable.
 */
const router = Router();
router.use(noStore);
router.use('/notification-preferences', preferencesRoutes);
router.use('/payables', carrierPayablesRouter);

router.get('/dashboard', controller.dashboard);

router.get('/loads', validate(listLoadsSchema), controller.listLoads);
router.get('/loads/:id', validate(idParamSchema), controller.getLoad);
router.get('/my-loads', validate(listMyLoadsSchema), controller.listMyLoads);
router.get('/my-loads/:id', validate(idParamSchema), controller.getMyLoad);

router.get('/shipments', validate(listShipmentsSchema), controller.listShipments);
router.get('/shipments/:id', validate(idParamSchema), controller.getShipment);
router.get('/tracking/:trackingNumber', validate(trackingNumberSchema), controller.trackShipment);

router.get('/documents', validate(listDocumentsSchema), controller.listDocuments);
router.get('/documents/:id', validate(idParamSchema), controller.getDocument);
router.get('/documents/:id/download', validate(accessSchema), controller.downloadDocument);
// Phase 10: proof of delivery and supporting documents for the carrier's own shipments (the file is the raw request body).
router.post('/shipments/:id/pod', createUploadLimiter(), requireStorage, validate(carrierPodSchema), readUpload('document'), controller.uploadPod);
router.post('/shipments/:id/documents', createUploadLimiter(), requireStorage, validate(carrierDocumentUploadSchema), readUpload('document'), controller.uploadShipmentDocument);

router.get('/payments', validate(listPaymentsSchema), controller.listPayments);
router.get('/messages', controller.getMessages);

router.get('/notifications', createNotificationLimiter(), validate(listNotificationsSchema), controller.listNotifications);
router.patch('/notifications/:id/read', createNotificationLimiter(), validate(idParamSchema), controller.markNotificationRead);

router.get('/profile', controller.getProfile);
router.patch('/profile', validate(updateProfileSchema), controller.updateProfile);
router.post('/profile/password', createPasswordChangeLimiter(), validate(changePasswordSchema), controller.changePassword);

export default router;
