import { apiClient } from './apiClient';
import { uploadFile } from './uploadClient';

// The single place the admin panel talks to the API. Every function maps to a real endpoint:
//   /operations/*  brokerage workflow (Phase 7)      /admin/*  read-only partner, finance, log and settings views
// Nothing here computes eligibility, pricing, margin or workflow rules: the server decides and the UI shows its answer.
const unwrap = (response) => response.data.data;
const enc = encodeURIComponent;
const get = (url, params) => apiClient.get(url, { params }).then(unwrap);
const post = (url, body = {}) => apiClient.post(url, body).then(unwrap);

/* overview & search */
export const getDashboard = () => get('/operations/dashboard');
export const getOverview = () => get('/admin/overview');
export const searchAll = (q) => get('/admin/search', { q });

/* quotes */
export const listQuotes = (params) => get('/operations/quotes', params);
export const getQuote = (id) => get(`/operations/quotes/${enc(id)}`).then((data) => data.quote);
export const reviewQuote = (id, body) => post(`/operations/quotes/${enc(id)}/review`, body);
export const startQuotePricing = (id) => post(`/operations/quotes/${enc(id)}/start-pricing`);
export const setQuotePricing = (id, body) => apiClient.put(`/operations/quotes/${enc(id)}/pricing`, body).then(unwrap);
export const sendQuote = (id, body) => post(`/operations/quotes/${enc(id)}/send`, body);
export const expireQuote = (id) => post(`/operations/quotes/${enc(id)}/expire`);
export const cancelQuote = (id, reason) => post(`/operations/quotes/${enc(id)}/cancel`, { reason });
export const convertQuote = (id) => post(`/operations/quotes/${enc(id)}/convert`);
export const updateQuoteNotes = (id, internalNotes) => apiClient.patch(`/operations/quotes/${enc(id)}/internal-notes`, { internalNotes }).then(unwrap);

/* loads */
export const listLoads = (params) => get('/operations/loads', params);
export const getLoad = (id) => get(`/operations/loads/${enc(id)}`).then((data) => data.load);
export const updateLoad = (id, body) => apiClient.patch(`/operations/loads/${enc(id)}`, body).then(unwrap);
export const setCarrierRate = (id, body) => apiClient.put(`/operations/loads/${enc(id)}/carrier-rate`, body).then(unwrap);
export const scheduleLoad = (id, body) => apiClient.put(`/operations/loads/${enc(id)}/schedule`, body).then(unwrap);
export const openLoad = (id) => post(`/operations/loads/${enc(id)}/open`);
export const startCarrierSearch = (id) => post(`/operations/loads/${enc(id)}/carrier-search`);
export const getCarrierMatches = (id) => get(`/operations/loads/${enc(id)}/carrier-matches`).then((data) => data.matching);
export const assignCarrier = (id, body) => post(`/operations/loads/${enc(id)}/assign`, body);
export const reassignCarrier = (id, body) => post(`/operations/loads/${enc(id)}/reassign`, body);
export const unassignCarrier = (id, body) => post(`/operations/loads/${enc(id)}/unassign`, body);
export const cancelLoad = (id, reason) => post(`/operations/loads/${enc(id)}/cancel`, { reason });
export const createShipment = (loadId) => post(`/operations/loads/${enc(loadId)}/shipment`);

/* shipments */
export const listShipments = (params) => get('/operations/shipments', params);
export const getShipment = (id) => get(`/operations/shipments/${enc(id)}`).then((data) => data.shipment);
export const runShipmentAction = (id, action, body) => post(`/operations/shipments/${enc(id)}/${action}`, body);
export const addTrackingUpdate = (id, body) => post(`/operations/shipments/${enc(id)}/tracking-updates`, body);
export const addBorderEvent = (id, body) => post(`/operations/shipments/${enc(id)}/border-events`, body);
export const raiseException = (id, body) => post(`/operations/shipments/${enc(id)}/exceptions`, body);
export const resolveException = (id, exceptionId, body) => post(`/operations/shipments/${enc(id)}/exceptions/${enc(exceptionId)}/resolve`, body);
export const cancelShipment = (id, reason) => post(`/operations/shipments/${enc(id)}/cancel`, { reason });

/* partners */
export const listCustomers = (params) => get('/admin/customers', params);
export const getCustomer = (id) => get(`/admin/customers/${enc(id)}`).then((data) => data.customer);
export const listCarriers = (params) => get('/admin/carriers', params);
export const getCarrier = (id) => get(`/admin/carriers/${enc(id)}`).then((data) => data.carrier);
export const listApplications = (params) => get('/admin/carrier-applications', params);
export const getApplication = (id) => get(`/admin/carrier-applications/${enc(id)}`).then((data) => data.application);

/* website contact messages (inbox) */
/* Carrier approval (Super Admin only on the server): action is approve, reject, suspend or reactivate. */
export const decideCarrier = (id, action, body = {}) => post(`/admin/carriers/${enc(id)}/${action}`, body);
export const decideApplication = (id, body) => post(`/admin/carrier-applications/${enc(id)}/decision`, body);
export const listContactMessages = (params) => get('/admin/contact-messages', params);
export const getContactMessage = (id) => get(`/admin/contact-messages/${enc(id)}`).then((data) => data.message);
export const markContactMessage = (id, handled) => post(`/admin/contact-messages/${enc(id)}/${handled ? 'handled' : 'reopen'}`).then((data) => data.message);

/* documents, payments, notifications */
export const listDocuments = (params) => get('/admin/documents', params);
export const getDocument = (id) => get(`/admin/documents/${enc(id)}`).then((data) => data.document);
export const uploadDocument = (file, query, options) => uploadFile('/admin/documents', file, { query, ...options }).then((data) => data.document);
export const updateDocument = (id, body) => apiClient.patch(`/admin/documents/${enc(id)}`, body).then(unwrap).then((data) => data.document);
export const runDocumentAction = (id, action) => post(`/admin/documents/${enc(id)}/${action}`).then((data) => data.document);
export const requestDocumentAccess = (id, disposition) => get(`/admin/documents/${enc(id)}/download`, { disposition }).then((data) => data.access);
export const listPayments = (params) => get('/admin/payments', params);
export const getPayment = (id) => get(`/admin/payments/${enc(id)}`).then((data) => data.payment);
export const listNotifications = (params) => get('/admin/notifications', params);
export const markNotificationRead = (id) => post(`/admin/notifications/${enc(id)}/read`).then((data) => data.notification);

/* system */
export const listActivity = (params) => get('/admin/activity-logs', params);
export const getSecurity = () => get('/admin/security');
export const getSettings = () => get('/admin/settings');

/* website CMS (Phase 9): Super Admin only. The server validates every field and decides what is public; the UI never sets a role, an owner or a status directly. */
const patch = (url, body) => apiClient.patch(url, body).then(unwrap);
export const getCmsOverview = () => get('/admin/cms/overview');
export const getCmsHomepage = () => get('/admin/cms/homepage');
export const saveCmsHomepage = (body) => patch('/admin/cms/homepage', body);

export const listCmsPages = (params) => get('/admin/cms/pages', params);
export const getCmsPage = (id) => get(`/admin/cms/pages/${enc(id)}`);
export const createCmsPage = (body) => post('/admin/cms/pages', body);
export const saveCmsPage = (id, body) => patch(`/admin/cms/pages/${enc(id)}`, body);
export const runCmsPageAction = (id, action) => post(`/admin/cms/pages/${enc(id)}/${action}`);

export const listCmsServices = (params) => get('/admin/cms/services', params);
export const getCmsService = (id) => get(`/admin/cms/services/${enc(id)}`);
export const createCmsService = (body) => post('/admin/cms/services', body);
export const saveCmsService = (id, body) => patch(`/admin/cms/services/${enc(id)}`, body);
export const archiveCmsService = (id) => post(`/admin/cms/services/${enc(id)}/archive`);
export const restoreCmsService = (id) => post(`/admin/cms/services/${enc(id)}/restore`);
export const reorderCmsServices = (ids) => post('/admin/cms/services/reorder', { ids });

export const listCmsIndustries = (params) => get('/admin/cms/industries', params);
export const getCmsIndustry = (id) => get(`/admin/cms/industries/${enc(id)}`);
export const createCmsIndustry = (body) => post('/admin/cms/industries', body);
export const saveCmsIndustry = (id, body) => patch(`/admin/cms/industries/${enc(id)}`, body);
export const archiveCmsIndustry = (id) => post(`/admin/cms/industries/${enc(id)}/archive`);
export const restoreCmsIndustry = (id) => post(`/admin/cms/industries/${enc(id)}/restore`);
export const reorderCmsIndustries = (ids) => post('/admin/cms/industries/reorder', { ids });

export const listCmsServiceAreas = (params) => get('/admin/cms/service-areas', params);
export const getCmsServiceArea = (id) => get(`/admin/cms/service-areas/${enc(id)}`);
export const createCmsServiceArea = (body) => post('/admin/cms/service-areas', body);
export const saveCmsServiceArea = (id, body) => patch(`/admin/cms/service-areas/${enc(id)}`, body);
export const archiveCmsServiceArea = (id) => post(`/admin/cms/service-areas/${enc(id)}/archive`);
export const restoreCmsServiceArea = (id) => post(`/admin/cms/service-areas/${enc(id)}/restore`);
export const reorderCmsServiceAreas = (ids) => post('/admin/cms/service-areas/reorder', { ids });

export const listCmsFaqs = (params) => get('/admin/cms/faqs', params);
export const getCmsFaq = (id) => get(`/admin/cms/faqs/${enc(id)}`);
export const createCmsFaq = (body) => post('/admin/cms/faqs', body);
export const saveCmsFaq = (id, body) => patch(`/admin/cms/faqs/${enc(id)}`, body);
export const archiveCmsFaq = (id) => post(`/admin/cms/faqs/${enc(id)}/archive`);
export const restoreCmsFaq = (id) => post(`/admin/cms/faqs/${enc(id)}/restore`);
export const reorderCmsFaqs = (ids) => post('/admin/cms/faqs/reorder', { ids });

export const listCmsTestimonials = (params) => get('/admin/cms/testimonials', params);
export const getCmsTestimonial = (id) => get(`/admin/cms/testimonials/${enc(id)}`);
export const createCmsTestimonial = (body) => post('/admin/cms/testimonials', body);
export const saveCmsTestimonial = (id, body) => patch(`/admin/cms/testimonials/${enc(id)}`, body);
export const archiveCmsTestimonial = (id) => post(`/admin/cms/testimonials/${enc(id)}/archive`);
export const restoreCmsTestimonial = (id) => post(`/admin/cms/testimonials/${enc(id)}/restore`);
export const reorderCmsTestimonials = (ids) => post('/admin/cms/testimonials/reorder', { ids });

export const listCmsBlog = (params) => get('/admin/cms/blog', params);
export const getCmsBlogPost = (id) => get(`/admin/cms/blog/${enc(id)}`);
export const createCmsBlogPost = (body) => post('/admin/cms/blog', body);
export const saveCmsBlogPost = (id, body) => patch(`/admin/cms/blog/${enc(id)}`, body);
export const runCmsBlogAction = (id, action, body) => post(`/admin/cms/blog/${enc(id)}/${action}`, body);

export const getCmsStorage = () => get('/admin/cms/media/storage');
export const listCmsMedia = (params) => get('/admin/cms/media', params);
export const uploadCmsMedia = (file, query, options) => uploadFile('/admin/cms/media/upload', file, { query, ...options }).then((data) => data.media ?? data);
export const replaceCmsMedia = (id, file, query, options) => uploadFile(`/admin/cms/media/${enc(id)}/replace`, file, { query, ...options }).then((data) => data.media ?? data);
export const addCmsMediaLink = (body) => post('/admin/cms/media/external', body);
export const saveCmsMedia = (id, body) => patch(`/admin/cms/media/${enc(id)}`, body);
export const deleteCmsMedia = (id) => apiClient.delete(`/admin/cms/media/${enc(id)}`).then(unwrap);

export const getCmsSeo = () => get('/admin/cms/seo');
export const saveCmsGlobalSeo = (body) => patch('/admin/cms/seo/global', body);
export const saveCmsHomepageSeo = (body) => patch('/admin/cms/seo/homepage', body);
export const saveCmsEntrySeo = (kind, id, body) => patch(`/admin/cms/seo/${enc(kind)}/${enc(id)}`, body);

export const getCmsSettings = () => get('/admin/cms/settings');
export const saveCmsSettings = (body) => patch('/admin/cms/settings', body);
/* Website navbar appearance: { appearance, defaults, isDefault, updatedAt }. Save sends the complete set; reset restores the defaults. */
export const getNavbarAppearance = () => get('/admin/cms/settings/navbar-appearance');
export const saveNavbarAppearance = (appearance) => apiClient.put('/admin/cms/settings/navbar-appearance', appearance).then(unwrap);
export const resetNavbarAppearance = () => post('/admin/cms/settings/navbar-appearance/reset');
/* Website theme: { theme, defaults, isDefault, updatedAt }. Save sends the complete set; reset restores the defaults. */
export const getThemeAppearance = () => get('/admin/cms/settings/theme-appearance');
export const saveThemeAppearance = (theme) => apiClient.put('/admin/cms/settings/theme-appearance', theme).then(unwrap);
export const resetThemeAppearance = () => post('/admin/cms/settings/theme-appearance/reset');

/* notification delivery log (Phase 11, Super Admin only) */
export const listDeliveries = (params) => get('/admin/notification-deliveries', params);
export const retryDelivery = (id) => post(`/admin/notification-deliveries/${enc(id)}/retry`).then((data) => data);
