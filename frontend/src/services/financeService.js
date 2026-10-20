import { apiClient } from './apiClient';

// Phase 12 finance API. Admin functions call /finance/* (Super Admin only); customer and carrier functions are read-only
// views of their own records. Nothing here sends an owner id, a status, a balance or a "paid" flag: the server derives them.
const unwrap = (response) => response.data.data;
const enc = encodeURIComponent;
const get = (url, params) => apiClient.get(url, { params }).then(unwrap);
const post = (url, body = {}) => apiClient.post(url, body).then(unwrap);

/* admin */
export const getFinanceSummary = () => get('/finance/summary');
export const getReconciliation = () => get('/finance/reconciliation');
export const getPaymentGateway = () => get('/finance/payment-gateway');

export const listInvoices = (params) => get('/finance/invoices', params);
export const getInvoice = (id) => get(`/finance/invoices/${enc(id)}`);
export const createInvoice = (body) => post('/finance/invoices', body);
export const updateInvoice = (id, body) => apiClient.patch(`/finance/invoices/${enc(id)}`, body).then(unwrap);
export const issueInvoice = (id, body = {}) => post(`/finance/invoices/${enc(id)}/issue`, body);
export const voidInvoice = (id, reason) => post(`/finance/invoices/${enc(id)}/void`, { reason });
export const recordInvoicePayment = (id, body) => post(`/finance/invoices/${enc(id)}/payments`, body);

export const listTransactions = (params) => get('/finance/payments', params);
export const reverseTransaction = (id, reason) => post(`/finance/payments/${enc(id)}/reverse`, { reason });

export const listPayables = (params) => get('/finance/payables', params);
export const getPayable = (id) => get(`/finance/payables/${enc(id)}`);
export const createPayable = (body) => post('/finance/payables', body);
export const approvePayable = (id) => post(`/finance/payables/${enc(id)}/approve`);
export const holdPayable = (id, reason) => post(`/finance/payables/${enc(id)}/hold`, { reason });
export const releasePayable = (id) => post(`/finance/payables/${enc(id)}/release`);
export const adjustPayable = (id, body) => post(`/finance/payables/${enc(id)}/adjust`, body);
export const voidPayable = (id, reason) => post(`/finance/payables/${enc(id)}/void`, { reason });
export const recordPayableOutflow = (id, body) => post(`/finance/payables/${enc(id)}/payments`, body);

/* customer portal (own invoices only) */
export const listBillingInvoices = (params) => get('/customer/billing/invoices', params);
export const getBillingInvoice = (id) => get(`/customer/billing/invoices/${enc(id)}`);

/* carrier portal (own payables only) */
export const listCarrierPayables = (params) => get('/carrier/payables', params);
export const getCarrierPayable = (id) => get(`/carrier/payables/${enc(id)}`);

/**
 * Downloads a PDF through the authenticated session (cookie) as a short-lived in-memory blob: the invoice is never put at
 * a public URL. `path` is one of the PDF endpoints above.
 */
export async function downloadInvoicePdf(path, fileName) {
  const response = await apiClient.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export const adminInvoicePdfPath = (id) => `/finance/invoices/${enc(id)}/pdf`;
export const customerInvoicePdfPath = (id) => `/customer/billing/invoices/${enc(id)}/pdf`;
