import { ApiRequestError } from '../utils/apiRequestError';
import { apiClient } from './apiClient';
import { uploadFile } from './uploadClient';

// Every call goes through the shared apiClient (cookie session, no tokens in JS). Identity always comes from the
// session on the server: no function here sends or accepts a carrier id.
const unwrap = (response) => response.data.data;
const enc = encodeURIComponent;

/** The carrier's own approval state. Also answers for suspended or deactivated carriers, so the portal can explain why data is blocked. */
export const getAccountStatus = () => apiClient.get('/carrier/account-status').then(unwrap);

export const getDashboard = () => apiClient.get('/carrier/dashboard').then(unwrap);

export const listLoads = (params) => apiClient.get('/carrier/loads', { params }).then(unwrap);
export const getLoad = (id) => apiClient.get(`/carrier/loads/${enc(id)}`).then(unwrap).then((data) => data.load);
export const listMyLoads = (params) => apiClient.get('/carrier/my-loads', { params }).then(unwrap);
export const getMyLoad = (id) => apiClient.get(`/carrier/my-loads/${enc(id)}`).then(unwrap).then((data) => data.load);

export const listShipments = (params) => apiClient.get('/carrier/shipments', { params }).then(unwrap);
export const getShipment = (id) => apiClient.get(`/carrier/shipments/${enc(id)}`).then(unwrap).then((data) => data.shipment);

export const listDocuments = (params) => apiClient.get('/carrier/documents', { params }).then(unwrap);
export const getDocument = (id) => apiClient.get(`/carrier/documents/${enc(id)}`).then(unwrap).then((data) => data.document);

export class DownloadUnavailableError extends Error {
  constructor() {
    super('Secure document download is not available yet.');
    this.name = 'DownloadUnavailableError';
  }
}

// The server checks ownership first and answers with a short-lived link (never stored). `disposition` is "inline" for a
// preview or "attachment" for a download. A record without a stored file answers 501 DOWNLOAD_UNAVAILABLE.
export async function requestDocumentDownload(id, disposition = 'attachment') {
  try {
    return await apiClient.get(`/carrier/documents/${enc(id)}/download`, { params: { disposition } }).then(unwrap).then((data) => data.access);
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === 'DOWNLOAD_UNAVAILABLE') throw new DownloadUnavailableError();
    throw error;
  }
}

export const listPayments = (params) => apiClient.get('/carrier/payments', { params }).then(unwrap);
export const getMessages = () => apiClient.get('/carrier/messages').then(unwrap);

export const listNotifications = (params) => apiClient.get('/carrier/notifications', { params }).then(unwrap);
export const markNotificationRead = (id) =>
  apiClient.patch(`/carrier/notifications/${enc(id)}/read`).then(unwrap).then((data) => data.notification);

export const getProfile = () => apiClient.get('/carrier/profile').then(unwrap);
export const updateProfile = (changes) => apiClient.patch('/carrier/profile', changes).then(unwrap);
export const changePassword = (fields) => apiClient.post('/carrier/profile/password', fields).then((response) => response.data.message);

// Uploads. The carrier is taken from the session and the shipment must be one of theirs; no owner id is ever sent.
export const uploadProofOfDelivery = (shipmentId, file, { replace = false, name } = {}, options) =>
  uploadFile(`/carrier/shipments/${enc(shipmentId)}/pod`, file, { query: { ...(replace ? { replace: 'true' } : {}), name }, ...options }).then((data) => data.document);
export const uploadShipmentDocument = (shipmentId, file, { type, name }, options) =>
  uploadFile(`/carrier/shipments/${enc(shipmentId)}/documents`, file, { query: { type, name }, ...options }).then((data) => data.document);
