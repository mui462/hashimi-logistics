import { ApiRequestError } from '../utils/apiRequestError';
import { apiClient } from './apiClient';
import { uploadFile } from './uploadClient';

// Every call goes through the shared apiClient (cookie session, no tokens in JS). Identity always comes from the
// session on the server: no function here sends or accepts a customer id.
const unwrap = (response) => response.data.data;

export const getDashboard = () => apiClient.get('/customer/dashboard').then(unwrap);

export const listQuotes = (params) => apiClient.get('/customer/quotes', { params }).then(unwrap);
export const getQuote = (id) => apiClient.get(`/customer/quotes/${encodeURIComponent(id)}`).then(unwrap).then((data) => data.quote);
export const createQuote = (payload) => apiClient.post('/customer/quotes', payload).then(unwrap).then((data) => data.quote);

export const acceptQuote = (id) => apiClient.post(`/customer/quotes/${encodeURIComponent(id)}/accept`, {}).then(unwrap).then((data) => data.quote);
export const declineQuote = (id, reason) =>
  apiClient.post(`/customer/quotes/${encodeURIComponent(id)}/decline`, reason ? { reason } : {}).then(unwrap).then((data) => data.quote);

export const listShipments = (params) => apiClient.get('/customer/shipments', { params }).then(unwrap);
export const getShipment = (id) => apiClient.get(`/customer/shipments/${encodeURIComponent(id)}`).then(unwrap).then((data) => data.shipment);

export const listDocuments = (params) => apiClient.get('/customer/documents', { params }).then(unwrap);
export const getDocument = (id) => apiClient.get(`/customer/documents/${encodeURIComponent(id)}`).then(unwrap).then((data) => data.document);

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
    return await apiClient.get(`/customer/documents/${encodeURIComponent(id)}/download`, { params: { disposition } }).then(unwrap).then((data) => data.access);
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === 'DOWNLOAD_UNAVAILABLE') throw new DownloadUnavailableError();
    throw error;
  }
}

export const listInvoices = (params) => apiClient.get('/customer/invoices', { params }).then(unwrap);

export const listNotifications = (params) => apiClient.get('/customer/notifications', { params }).then(unwrap);
export const markNotificationRead = (id) =>
  apiClient.patch(`/customer/notifications/${encodeURIComponent(id)}/read`).then(unwrap).then((data) => data.notification);

export const getProfile = () => apiClient.get('/customer/profile').then(unwrap);
export const updateProfile = (changes) => apiClient.patch('/customer/profile', changes).then(unwrap);
export const changePassword = (fields) => apiClient.post('/customer/profile/password', fields).then((response) => response.data.message);
