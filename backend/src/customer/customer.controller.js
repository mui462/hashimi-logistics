import { requestContext } from '../services/activity.service.js';
import { signAccessToken } from '../services/token.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { setAuthCookie } from '../utils/authCookie.js';
import * as customer from './customer.service.js';

/**
 * Controllers pass only req.owner (server-resolved) plus validated input. They never read a customer id from
 * req.body, req.query or req.params: the only id taken from the URL is the id of the record being requested,
 * and the service checks that record against req.owner.
 */

export const dashboard = async (req, res) => sendSuccess(res, { data: await customer.getDashboard(req.owner) });

export const listQuotes = async (req, res) =>
  sendSuccess(res, { data: await customer.listQuotes(req.owner, req.validated.query) });

export const getQuote = async (req, res) =>
  sendSuccess(res, { data: { quote: await customer.getQuote(req.owner, req.validated.params.id) } });

export const createQuote = async (req, res) => {
  const quote = await customer.createQuote(req.owner, req.validated.body, requestContext(req));
  sendSuccess(res, { statusCode: 201, message: 'Your quote request was submitted.', data: { quote } });
};

export const acceptQuote = async (req, res) => {
  const result = await customer.acceptQuote(req.owner, req.validated.params.id, requestContext(req));
  sendSuccess(res, { message: result.changed ? 'Thank you. You accepted this quote.' : 'You already accepted this quote.', data: { quote: result.quote } });
};

export const declineQuote = async (req, res) => {
  const result = await customer.declineQuote(req.owner, req.validated.params.id, req.validated.body, requestContext(req));
  sendSuccess(res, { message: result.changed ? 'You declined this quote.' : 'You already declined this quote.', data: { quote: result.quote } });
};

export const listShipments = async (req, res) =>
  sendSuccess(res, { data: await customer.listShipments(req.owner, req.validated.query) });

export const getShipment = async (req, res) =>
  sendSuccess(res, { data: { shipment: await customer.getShipment(req.owner, req.validated.params.id) } });

export const trackShipment = async (req, res) =>
  sendSuccess(res, { data: await customer.trackOwnShipment(req.owner, req.validated.params.trackingNumber) });

export const listDocuments = async (req, res) =>
  sendSuccess(res, { data: await customer.listDocuments(req.owner, req.validated.query) });

export const getDocument = async (req, res) =>
  sendSuccess(res, { data: { document: await customer.getDocument(req.owner, req.validated.params.id) } });

export const downloadDocument = async (req, res) =>
  sendSuccess(res, { data: await customer.authorizeDocumentDownload(req.owner, req.validated.params.id, requestContext(req), { disposition: req.validated.query.disposition, user: req.user }) });

export const listInvoices = async (req, res) =>
  sendSuccess(res, { data: await customer.listInvoices(req.owner, req.validated.query) });

export const listNotifications = async (req, res) =>
  sendSuccess(res, { data: await customer.listNotifications(req.owner, req.validated.query) });

export const markNotificationRead = async (req, res) => {
  const notification = await customer.markNotificationRead(req.owner, req.validated.params.id, requestContext(req));
  sendSuccess(res, { message: 'Notification marked as read.', data: { notification } });
};

export const getProfile = async (req, res) => sendSuccess(res, { data: await customer.getProfile(req.owner) });

export const updateProfile = async (req, res) => {
  const profile = await customer.updateProfile(req.owner, req.validated.body, requestContext(req));
  sendSuccess(res, { message: 'Your profile was updated.', data: profile });
};

export const changePassword = async (req, res) => {
  const user = await customer.changePassword(req.owner, req.validated.body, requestContext(req));
  // Other sessions were ended by the token-version bump; keep this browser signed in with a fresh cookie.
  const { token, expiresAt } = signAccessToken(user);
  setAuthCookie(res, token, expiresAt);
  sendSuccess(res, { message: 'Your password was changed. Other devices have been signed out.' });
};
