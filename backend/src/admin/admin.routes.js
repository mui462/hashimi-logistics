import { Router } from 'express';
import { noStore } from '../middleware/noStore.js';
import { rejectOperators } from '../middleware/rejectOperators.js';
import { validate } from '../middleware/validate.js';
import { readUpload, requireStorage } from '../storage/uploadBody.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { requestContext } from '../services/activity.service.js';
import * as documents from '../documents/document.service.js';
import * as dv from '../documents/document.validator.js';
import { getDelivery, listDeliveries, retryDelivery } from '../notifications/delivery.service.js';
import * as dv2 from '../notifications/notifications.validator.js';
import preferencesRoutes from '../notifications/preferences.routes.js';
import { getDeliveryStatus } from '../notifications/providers/index.js';
import { createNotificationLimiter } from '../middleware/rateLimiters.js';
import * as approvals from './carrierApproval.service.js';
import * as service from './admin.service.js';
import * as v from './admin.validator.js';

/**
 * Super Admin read API for the admin panel (Phase 8; Phase 10 adds document upload, update, archive/restore and secure download), mounted at /api/v1/admin behind authenticate + requireSuperAdmin.
 * Everything here is read-only except marking the admin's own notification as read and a contact message handled. Workflow changes live in /operations.
 */
const router = Router();
router.use(noStore);
router.use(rejectOperators);

const read = (handler) => async (req, res) => sendSuccess(res, { data: await handler(req) });
const q = (req) => req.validated.query;
const id = (req) => req.validated.params.id;
const adminId = (req) => req.user._id;

router.get('/overview', validate(v.emptyQuerySchema), read((req) => service.getOverview(adminId(req))));
router.get('/search', validate(v.searchSchema), read((req) => service.search(q(req).q)));

router.get('/customers', validate(v.customersSchema), read((req) => service.listCustomers(q(req))));
router.get('/customers/:id', validate(v.idParamSchema), read((req) => service.getCustomer(id(req))));
router.get('/carriers', validate(v.carriersSchema), read((req) => service.listCarriers(q(req))));
router.get('/carriers/:id', validate(v.idParamSchema), read((req) => service.getCarrier(id(req))));
router.get('/carrier-applications', validate(v.applicationsSchema), read((req) => service.listApplications(q(req))));
router.get('/carrier-applications/:id', validate(v.idParamSchema), read((req) => service.getApplication(id(req))));
// Website contact form inbox: read, then mark handled (or back to new). The visitor's message itself is never edited.
// Carrier approval workflow. Super Admin only (the whole router is mounted behind requireSuperAdmin); every change is audited.
const decide = (action, schema) =>
  router.post(`/carriers/:id/${action}`, validate(schema), read((req) => approvals.decideCarrier(id(req), action, req.validated.body, req.user, requestContext(req))));
decide('approve', v.carrierActionSchema);
decide('reject', v.carrierRejectSchema);
decide('suspend', v.carrierActionSchema);
decide('reactivate', v.carrierActionSchema);
router.post('/carrier-applications/:id/decision', validate(v.applicationDecisionSchema), read((req) => approvals.decideApplication(id(req), req.validated.body, req.user, requestContext(req))));

router.get('/contact-messages', validate(v.contactMessagesSchema), read((req) => service.listContactMessages(q(req))));
router.get('/contact-messages/:id', validate(v.idParamSchema), read((req) => service.getContactMessage(id(req))));
router.post('/contact-messages/:id/handled', validate(v.idParamSchema), read((req) => service.setContactMessageStatus(id(req), 'handled', req.user, requestContext(req))));
router.post('/contact-messages/:id/reopen', validate(v.idParamSchema), read((req) => service.setContactMessageStatus(id(req), 'new', req.user, requestContext(req))));
router.get('/documents', validate(v.documentsSchema), read((req) => service.listDocuments(q(req))));
router.get('/documents/:id', validate(v.idParamSchema), read((req) => service.getDocument(id(req))));

// Phase 10: Super Admin document management. Files arrive as the raw request body (see storage/uploadBody.js).
const created = (handler) => async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Document uploaded.', data: await handler(req) });
const present = async (documentId) => service.getDocument(documentId);
router.post('/documents', requireStorage, validate(dv.adminUploadSchema), readUpload('document'), created(async (req) => {
  const { fileName, type, relatedEntityType, relatedEntityId, visibility, name } = req.validated.query;
  const document = await documents.adminUpload({ user: req.user, file: req.upload, fileName, type, relatedEntityType, relatedEntityId, visibility, name, context: requestContext(req) });
  return present(document._id);
}));
router.get('/documents/:id/download', validate(dv.accessSchema), read((req) =>
  documents.issueAccess({ documentId: id(req), filter: {}, actor: req.user, role: 'super_admin', disposition: q(req).disposition, context: requestContext(req) }).then((access) => ({ access }))
));
router.patch('/documents/:id', validate(dv.adminUpdateSchema), read(async (req) => {
  await documents.adminUpdate({ documentId: id(req), changes: req.validated.body, user: req.user, context: requestContext(req) });
  return present(id(req));
}));
router.post('/documents/:id/archive', validate(v.idParamSchema), read(async (req) => {
  await documents.adminArchive({ documentId: id(req), user: req.user, context: requestContext(req) });
  return present(id(req));
}));
router.post('/documents/:id/restore', validate(v.idParamSchema), read(async (req) => {
  await documents.adminRestore({ documentId: id(req), user: req.user, context: requestContext(req) });
  return present(id(req));
}));
router.get('/payments', validate(v.paymentsSchema), read((req) => service.listPayments(q(req))));
router.get('/payments/:id', validate(v.idParamSchema), read((req) => service.getPayment(id(req))));
router.get('/notifications', validate(v.notificationsSchema), read((req) => service.listNotifications(adminId(req), q(req))));
router.post('/notifications/:id/read', validate(v.idParamSchema), read((req) => service.markNotificationRead(adminId(req), id(req))));
router.use('/notification-preferences', preferencesRoutes);
// Phase 11: delivery log. Metadata only (no message bodies, addresses, tokens or credentials); Super Admin only.
router.get('/notification-deliveries', createNotificationLimiter(), validate(dv2.listDeliveriesSchema), read(async (req) => ({ ...(await listDeliveries(q(req))), providers: getDeliveryStatus() })));
router.get('/notification-deliveries/:id', validate(dv2.idParamSchema), read((req) => getDelivery(id(req))));
router.post('/notification-deliveries/:id/retry', createNotificationLimiter(), validate(dv2.retryDeliverySchema), read((req) => retryDelivery(id(req))));
router.get('/activity-logs', validate(v.activityLogsSchema), read((req) => service.listActivity(q(req))));
router.get('/security', validate(v.emptyQuerySchema), read((req) => service.getSecurity(adminId(req))));
router.get('/settings', validate(v.emptyQuerySchema), read(() => service.getSettings()));

export default router;
