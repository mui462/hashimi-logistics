import { requestContext } from '../services/activity.service.js';
import { signAccessToken } from '../services/token.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { setAuthCookie } from '../utils/authCookie.js';
import * as carrier from './carrier.service.js';

/**
 * Controllers pass only req.owner (server-resolved) plus validated input. A carrier id is never read from
 * req.body, req.query, req.params or headers: the only id taken from the URL is the id of the record requested,
 * and the service checks that record against req.owner.
 */

const ok = (handler) => async (req, res) => sendSuccess(res, { data: await handler(req) });
const ctx = requestContext;

export const dashboard = ok((req) => carrier.getDashboard(req.owner));
export const listLoads = ok((req) => carrier.listAvailableLoads(req.owner, req.validated.query));
export const getLoad = ok(async (req) => ({ load: await carrier.getLoad(req.owner, req.validated.params.id) }));
export const listMyLoads = ok((req) => carrier.listMyLoads(req.owner, req.validated.query));
export const getMyLoad = ok(async (req) => ({ load: await carrier.getMyLoad(req.owner, req.validated.params.id) }));
export const listShipments = ok((req) => carrier.listShipments(req.owner, req.validated.query));
export const getShipment = ok(async (req) => ({ shipment: await carrier.getShipment(req.owner, req.validated.params.id) }));
export const trackShipment = ok((req) => carrier.trackOwnShipment(req.owner, req.validated.params.trackingNumber));
export const listDocuments = ok((req) => carrier.listDocuments(req.owner, req.validated.query));
export const getDocument = ok(async (req) => ({ document: await carrier.getDocument(req.owner, req.validated.params.id, ctx(req)) }));
export const listPayments = ok((req) => carrier.listPayments(req.owner, req.validated.query));
export const getMessages = ok(() => carrier.getMessages());
export const listNotifications = ok((req) => carrier.listNotifications(req.owner, req.validated.query));
export const getProfile = ok((req) => carrier.getProfile(req.owner));

export const downloadDocument = ok((req) => carrier.authorizeDocumentDownload(req.owner, req.validated.params.id, ctx(req), { disposition: req.validated.query.disposition, user: req.user }));

export const uploadPod = async (req, res) => {
  const document = await carrier.uploadPod(req.owner, req.user, req.validated.params.id, req.upload, { fileName: req.validated.query.fileName, replace: req.validated.query.replace === 'true' }, ctx(req));
  sendSuccess(res, { statusCode: 201, message: 'Proof of delivery uploaded.', data: { document } });
};

export const uploadShipmentDocument = async (req, res) => {
  const document = await carrier.uploadShipmentDocument(req.owner, req.user, req.validated.params.id, req.upload, req.validated.query, ctx(req));
  sendSuccess(res, { statusCode: 201, message: 'Document uploaded.', data: { document } });
};

export const markNotificationRead = async (req, res) => {
  const notification = await carrier.markNotificationRead(req.owner, req.validated.params.id, ctx(req));
  sendSuccess(res, { message: 'Notification marked as read.', data: { notification } });
};

export const updateProfile = async (req, res) => {
  const profile = await carrier.updateProfile(req.owner, req.validated.body, ctx(req));
  sendSuccess(res, { message: 'Your profile was updated.', data: profile });
};

export const changePassword = async (req, res) => {
  const user = await carrier.changePassword(req.owner, req.validated.body, ctx(req));
  // Other sessions were ended by the token-version bump; keep this browser signed in with a fresh cookie.
  const { token, expiresAt } = signAccessToken(user);
  setAuthCookie(res, token, expiresAt);
  sendSuccess(res, { message: 'Your password was changed. Other devices have been signed out.' });
};
