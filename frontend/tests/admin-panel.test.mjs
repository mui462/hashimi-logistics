/**
 * Phase 8 Super Admin panel, rendered in jsdom against a mocked API (the mocks live only in this file).
 * Covers routing and guards, every module's loading / data / empty / error states, workflow actions driven by the
 * server's `nextStatuses`, dialogs and keyboard behaviour, API failure handling (401/403/404/409/500, slow network),
 * and static guarantees about what the admin source may contain. Run with: npm test
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'FormData', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  try {
    globalThis[key] = dom.window[key];
  } catch {
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};

const require = createRequire(`${ROOT}package.json`);
const React = require('react');
const { createRoot } = require('react-dom/client');
const RR = await import(pathToFileURL(require.resolve('react-router-dom')).href);
const { act } = React;

const USERS = {
  super_admin: { id: 'u0', firstName: 'Root', lastName: 'Admin', fullName: 'Root Admin', email: 'root@example.com', role: 'super_admin' },
  customer: { id: 'u1', firstName: 'Casey', lastName: 'Customer', fullName: 'Casey Customer', email: 'casey@example.com', role: 'customer' },
  carrier: { id: 'u2', firstName: 'Kai', lastName: 'Carrier', fullName: 'Kai Carrier', email: 'k@example.com', role: 'carrier' },
};

const money = (amount, currency = 'USD') => ({ amount, currency });
const stop = (city, state, country = 'US') => ({ facilityName: 'Dock 4', street: '1 Main St', city, state, zipCode: '60601', country, contactName: 'Dana Dock', contactPhone: '312-555-0100', contactEmail: 'dock@example.com' });
const customer = { id: 'c1', companyName: 'Acme Freight', contactPerson: 'Casey', email: 'casey@acme.test', phone: '312-555-0101' };
const carrier = { id: 'k1', companyName: 'Alpha Trucking LLC', contactPerson: 'Kai', email: 'kai@alpha.test', phone: '214-555-0100', MCNumber: 'MC-100', DOTNumber: 'DOT-200', status: 'active' };
const next = (...statuses) => statuses.map((status) => ({ status, operationsStatus: status }));
const page = (items, extra = {}) => ({ items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 }, ...extra });

const fx = {
  quoteSummary: (extra = {}) => ({ id: 'q1', quoteNumber: 'QT-2026-000001', status: 'new', operationsStatus: 'submitted', customer, origin: { city: 'Chicago', state: 'IL', country: 'US' }, destination: { city: 'Toronto', state: 'ON', country: 'CA' }, pickupDate: '2026-12-01T00:00:00.000Z', equipmentType: 'Dry Van', commodity: 'Machine parts', isCrossBorder: true, pricing: { customerRate: null, carrierRate: null, brokerMargin: null, marginPercent: null }, quoteExpiresAt: null, loadId: null, createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-01T12:00:00.000Z', ...extra }),
  quote: (extra = {}) => ({ ...fx.quoteSummary(), origin: stop('Chicago', 'IL'), destination: stop('Toronto', 'ON', 'CA'), weight: { value: 12000, unit: 'lb' }, deliveryDate: null, nextStatuses: next('reviewing', 'cancelled'), internalNotes: 'Call before sending', quotedAt: null, acceptedAt: null, declinedAt: null, convertedAt: null, load: null, cancelledReason: null, ...extra }),
  loadSummary: (extra = {}) => ({ id: 'l1', loadNumber: 'LD-2026-000001', status: 'open', operationsStatus: 'open', customer, carrier: null, origin: { city: 'Chicago', state: 'IL', country: 'US' }, destination: { city: 'Dallas', state: 'TX', country: 'US' }, crossBorder: false, pickup: { earliest: '2026-11-03T15:00:00.000Z', latest: null, timezone: 'America/Chicago', earliestLocal: '2026-11-03 09:00', latestLocal: null }, equipmentType: 'Dry Van', commodity: 'Widgets', pricing: { customerRate: money(312345), carrierRate: money(251234), brokerMargin: money(61111), marginPercent: 19.57 }, createdAt: '2026-10-02T12:00:00.000Z', updatedAt: '2026-10-02T12:00:00.000Z', ...extra }),
  load: (extra = {}) => ({ ...fx.loadSummary(), nextStatuses: next('carrier_search', 'assigned', 'cancelled'), quote: { id: 'q1', quoteNumber: 'QT-2026-000001' }, shipment: null, origin: stop('Chicago', 'IL'), destination: stop('Dallas', 'TX'), delivery: { earliest: null, latest: null, timezone: 'America/Chicago', earliestLocal: null, latestLocal: '2026-11-05 17:00' }, pickupAppointment: null, deliveryAppointment: null, weight: { value: 9000, unit: 'lb' }, specialInstructions: 'Call ahead', internalNotes: 'VIP customer', cancelledReason: null, assignmentHistory: [], archivedAt: null, ...extra }),
  matching: (extra = {}) => ({
    loadId: 'l1', loadNumber: 'LD-2026-000001', evaluatedAt: '2026-10-09T12:00:00.000Z',
    criteria: { equipmentType: 'Dry Van', crossBorder: false, originCountry: 'US', destinationCountry: 'US', pickupState: 'IL', pickupCity: 'Chicago' },
    matches: [{ carrierId: 'k1', companyName: 'Alpha Trucking LLC', status: 'active', authorityStatus: 'active', complianceStatus: 'approved', equipmentTypes: ['Dry Van'], crossBorderCapability: false, score: 92, coverage: { pickup: 'state', delivery: 'country' }, eligible: true }],
    excluded: [{ carrierId: 'k2', companyName: 'Charlie Suspended Co', status: 'suspended', authorityStatus: 'active', complianceStatus: 'approved', equipmentTypes: ['Dry Van'], crossBorderCapability: true, eligible: false, reasons: [{ code: 'CARRIER_NOT_ACTIVE', message: 'This carrier is suspended.' }, { code: 'INSURANCE_EXPIRED', message: 'Insurance has expired.' }] }],
    counts: { evaluated: 2, eligible: 1, excluded: 1 }, truncated: false, ...extra,
  }),
  shipmentSummary: (extra = {}) => ({ id: 's1', trackingNumber: 'HL-ABC123XYZ9', shipmentNumber: 'SH-2026-000001', status: 'in_transit', operationsStatus: 'in_transit', loadId: 'l1', loadNumber: 'LD-2026-000001', customer, carrier, origin: { city: 'Chicago', state: 'IL', country: 'US' }, destination: { city: 'Dallas', state: 'TX', country: 'US' }, isCrossBorder: false, borderStatus: 'not_applicable', hasOpenException: false, estimatedPickup: null, estimatedDelivery: null, createdAt: '2026-10-03T12:00:00.000Z', updatedAt: '2026-10-04T12:00:00.000Z', ...extra }),
  shipment: (extra = {}) => ({ ...fx.shipmentSummary(), nextStatuses: next('out_for_delivery', 'delivered', 'at_border', 'exception'), load: { id: 'l1', loadNumber: 'LD-2026-000001', status: 'in_transit' }, origin: stop('Chicago', 'IL'), destination: stop('Dallas', 'TX'), currentLocation: null, estimatedPickup: null, actualPickup: '2026-10-04T10:00:00.000Z', estimatedDelivery: null, actualDelivery: null, trackingEvents: [{ id: 'e1', status: 'booked', timestamp: '2026-10-03T12:00:00.000Z', location: null, note: null }, { id: 'e2', status: 'in_transit', timestamp: '2026-10-04T12:00:00.000Z', location: { city: 'Joliet', state: 'IL', country: 'US' }, note: 'Left yard' }], borderEvents: [], exception: null, exceptions: [], proofOfDelivery: { recorded: false, reason: 'Document storage is not configured.' }, completedAt: null, cancelledAt: null, ...extra }),
  dashboard: () => ({ generatedAt: '2026-10-09T12:00:00.000Z', quotes: { total: 40, submitted: 4, underReview: 3, pricing: 2, quoted: 6, awaitingConversion: 5, converted_to_load: 12, declined: 3, expired: 2, cancelled: 1, quotedButPastExpiry: 1 }, loads: { total: 20, needingCarrier: 7, overduePickups: 2, overdueDeliveries: 1 }, shipments: { total: 15, live: 9, crossBorderLive: 3, openExceptions: 2, delivered: 4, completed: 2 }, financials: { byCurrency: [{ currency: 'USD', customerRevenue: 1250000, carrierCost: 1000000, brokerMargin: 250000, loads: 5 }], truncated: false }, recentActivity: [{ action: 'operations.quote.sent', description: 'Quote QT-2026-000001 was sent to the customer.', module: 'quotes', entityId: 'q1', at: '2026-10-09T11:00:00.000Z' }] }),
  overview: () => ({ customers: { total: 12, active: 11, suspended: 1 }, carriers: { total: 9, active: 7, pending: 2 }, applications: { total: 3, pending: 3 }, unreadNotifications: 4 }),
  customer: () => ({ ...customer, status: 'active', address: { street: '9 Elm', city: 'Chicago', state: 'IL', zipCode: '60601', country: 'US' }, createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-02T12:00:00.000Z', account: { email: 'casey@acme.test', isActive: true, isEmailVerified: true, lastLogin: '2026-10-08T12:00:00.000Z', createdAt: '2026-09-01T12:00:00.000Z' }, billing: { contactName: 'Bill', email: 'ap@acme.test', phone: null, address: null, paymentTermsDays: 30 }, internalNotes: 'Pays on time', counts: { quotes: 4, loads: 2, shipments: 1 }, recentQuotes: [{ id: 'q1', quoteNumber: 'QT-2026-000001', status: 'new', createdAt: '2026-10-01T12:00:00.000Z' }] }),
  carrier: () => ({ ...carrier, authorityStatus: 'active', complianceStatus: 'approved', equipmentTypes: ['Dry Van', 'Reefer'], operatingRegions: ['Texas', 'Illinois'], crossBorderCapability: true, createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-02T12:00:00.000Z', address: null, insurance: { provider: 'Shield', policyNumber: 'P-1', liabilityCoverage: money(100000000), cargoCoverage: money(10000000), effectiveDate: '2026-01-01T00:00:00.000Z', expirationDate: '2030-01-01T00:00:00.000Z', expired: false }, rating: 4.5, account: { email: 'kai@alpha.test', isActive: true, isEmailVerified: false, lastLogin: null, createdAt: '2026-09-01T12:00:00.000Z' }, internalNotes: 'Reliable', documentCount: 2, counts: { loads: 5, active: 1, completed: 3 }, recentLoads: [{ id: 'l1', loadNumber: 'LD-2026-000001', status: 'assigned', createdAt: '2026-10-02T12:00:00.000Z' }] }),
  application: () => ({ id: 'a1', companyName: 'Applicant Haulage', contactPerson: 'Appl Icant', email: 'apply@example.com', phone: '555-010-0000', MCNumber: 'MC-APP', DOTNumber: null, status: 'pending', equipmentTypes: ['Flatbed'], crossBorderCapability: false, createdAt: '2026-10-05T12:00:00.000Z', address: null, operatingRegions: ['Ohio'], documentCount: 1, reviewedAt: null, reviewedBy: null, rejectionReason: null, carrierId: null, internalNotes: null, updatedAt: '2026-10-05T12:00:00.000Z' }),
  document: () => ({ id: 'd1', name: 'Bill of lading.pdf', type: 'BOL', mimeType: 'application/pdf', fileSize: 20480, visibility: 'customer', relatedEntityType: 'load', relatedEntityId: 'l1', customer: { id: 'c1', companyName: 'Acme Freight' }, carrier: null, uploadedBy: { id: 'u0', name: 'Root Admin', email: 'root@example.com', role: 'super_admin' }, download: { available: false, reason: 'Document storage is not configured yet.' }, createdAt: '2026-10-02T12:00:00.000Z', updatedAt: '2026-10-02T12:00:00.000Z' }),
  payment: (extra = {}) => ({ id: 'p1', paymentType: 'customer_payment', status: 'pending', amount: money(125000), referenceNumber: 'REF-1', paymentDate: null, load: { id: 'l1', loadNumber: 'LD-2026-000001' }, customer: { id: 'c1', companyName: 'Acme Freight' }, carrier: null, createdAt: '2026-10-02T12:00:00.000Z', updatedAt: '2026-10-02T12:00:00.000Z', internalNotes: 'Net 30', ...extra }),
  notification: (extra = {}) => ({ id: 'n1', type: 'quote', title: 'New quote request', message: 'QT-2026-000001 was submitted.', isRead: false, relatedEntity: { entityType: 'quote', entityId: 'q1' }, createdAt: '2026-10-09T10:00:00.000Z', ...extra }),
  activity: (extra = {}) => ({ id: 'g1', createdAt: '2026-10-09T10:00:00.000Z', actor: { id: 'u0', name: 'Root Admin', email: 'root@example.com', role: 'super_admin' }, action: 'operations.quote.sent', module: 'quotes', entityId: 'q1', description: 'Quote QT-2026-000001 was sent to the customer.', result: 'success', ipAddress: '203.0.113.9', metadata: { validForDays: 7 }, ...extra }),
  security: () => ({ generatedAt: '2026-10-09T12:00:00.000Z', account: { name: 'Root Admin', email: 'root@example.com', role: 'super_admin', isEmailVerified: true, lastLogin: '2026-10-09T09:00:00.000Z', superAdminAccounts: 1 }, authEvents: { failedSignIns: { last24Hours: 2, last7Days: 5 }, successfulSignIns: { last24Hours: 3, last7Days: 9 }, passwordResetsCompleted: { last7Days: 0 }, passwordsChanged: { last7Days: 1 } }, session: { lifetime: '7d', storage: 'HttpOnly cookie (not readable by page scripts)', sameSite: 'lax', secureCookie: true, signInRateLimit: { maxAttempts: 20, windowMinutes: 15 } }, unavailable: ['Two-factor authentication', 'Active session list'], recentAuthEvents: [{ id: 'g2', createdAt: '2026-10-09T09:00:00.000Z', action: 'auth.login.failed', result: 'failure', actor: null, ipAddress: '203.0.113.9' }] }),
  cmsSettings: (extra = {}) => ({ exists: true, companyName: 'HASHIMI LOGISTICS INC.', shortName: null, tagline: null, phone: '312-555-0000', email: 'hello@hashimi.test', address: { street: null, city: null, state: null, zipCode: null, country: null }, businessHours: [{ day: 'monday', isClosed: false, opensAt: '08:00', closesAt: '17:00' }], socialLinks: [], logo: null, favicon: null, primaryCta: null, footerText: null, copyrightText: null, timezone: 'America/Chicago', updatedAt: '2026-10-01T12:00:00.000Z', ...extra }),
  settings: () => ({ configured: true, settings: { companyName: 'HASHIMI LOGISTICS INC.', websiteTitle: null, tagline: 'Freight Brokerage & Transportation Solutions', description: null, phone: '312-555-0000', email: 'hello@hashimi.test', address: null, timezone: 'America/Chicago', copyrightText: null, logo: null, favicon: null, businessHours: [{ day: 'monday', isClosed: false, opensAt: '08:00', closesAt: '17:00' }], socialLinks: [], updatedAt: '2026-10-01T12:00:00.000Z' } }),
};

describe('Phase 8 Super Admin panel', () => {
  let vite;
  let appRoutes;
  let AuthProvider;
  let apiClient;
  let clearContentCache;
  let session = null;
  let calls = [];
  let routes = {};
  let delayMs = 0;
  const errors = [];
  const originalConsoleError = console.error;
  const tick = (ms = 30) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

  const defaults = () => ({
    'GET /operations/dashboard': () => ({ data: fx.dashboard() }),
    'GET /admin/overview': () => ({ data: fx.overview() }),
    'GET /operations/quotes': () => ({ data: page([fx.quoteSummary()]) }),
    'GET /operations/quotes/q1': () => ({ data: { quote: fx.quote() } }),
    'GET /operations/loads': () => ({ data: page([fx.loadSummary()]) }),
    'GET /operations/loads/l1': () => ({ data: { load: fx.load() } }),
    'GET /operations/loads/l1/carrier-matches': () => ({ data: { matching: fx.matching() } }),
    'GET /operations/shipments': () => ({ data: page([fx.shipmentSummary()]) }),
    'GET /operations/shipments/s1': () => ({ data: { shipment: fx.shipment() } }),
    'GET /admin/customers': () => ({ data: page([{ ...customer, status: 'active', createdAt: '2026-09-01T12:00:00.000Z' }]) }),
    'GET /admin/customers/c1': () => ({ data: { customer: fx.customer() } }),
    'GET /admin/carriers': () => ({ data: page([{ ...carrier, authorityStatus: 'active', complianceStatus: 'approved', equipmentTypes: ['Dry Van'], operatingRegions: [], crossBorderCapability: true, createdAt: '2026-09-01T12:00:00.000Z' }]) }),
    'GET /admin/carriers/k1': () => ({ data: { carrier: fx.carrier() } }),
    'GET /admin/carrier-applications': () => ({ data: page([{ id: 'a1', companyName: 'Applicant Haulage', contactPerson: 'Appl Icant', email: 'apply@example.com', phone: '555', MCNumber: 'MC-APP', DOTNumber: null, status: 'pending', equipmentTypes: [], crossBorderCapability: false, createdAt: '2026-10-05T12:00:00.000Z' }]) }),
    'GET /admin/carrier-applications/a1': () => ({ data: { application: fx.application() } }),
    'GET /admin/cms/media/storage': () => ({ data: { configured: false, provider: null, uploadsAvailable: false, externalLinksAvailable: true, limits: { imageMB: 10, videoMB: 200, documentMB: 25 }, message: 'File storage is not configured yet.' } }),
    'GET /admin/documents': () => ({ data: page([fx.document()]) }),
    'GET /admin/documents/d1': () => ({ data: { document: fx.document() } }),
    'GET /admin/payments': () => ({ data: page([fx.payment()]) }),
    'GET /admin/payments/p1': () => ({ data: { payment: fx.payment() } }),
    'GET /admin/notifications': () => ({ data: page([fx.notification()], { unreadCount: 1 }) }),
    'POST /admin/notifications/n1/read': () => ({ data: { notification: fx.notification({ isRead: true }) } }),
    'GET /admin/activity-logs': () => ({ data: page([fx.activity()]) }),
    'GET /admin/security': () => ({ data: fx.security() }),
    'GET /admin/cms/settings': () => ({ data: fx.cmsSettings() }),
    'PATCH /admin/cms/settings': () => ({ data: fx.cmsSettings({ companyName: 'Changed Co' }) }),
    'GET /admin/search': ({ params }) => ({ data: { query: params.q, results: [{ type: 'customer', id: 'c1', label: 'Acme Freight', detail: 'casey@acme.test' }] } }),
  });

  before(async () => {
    vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
    ({ appRoutes } = await vite.ssrLoadModule('/src/routes/appRoutes.jsx'));
    ({ AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
    ({ apiClient } = await vite.ssrLoadModule('/src/services/apiClient.js'));
    ({ clearContentCache } = await vite.ssrLoadModule('/src/services/contentService.js'));

    apiClient.defaults.adapter = async (config) => {
      const { url, method } = config;
      const body = typeof config.data === 'string' ? JSON.parse(config.data) : undefined;
      const key = `${method.toUpperCase()} ${url}`;
      calls.push({ key, body, params: config.params });
      const ok = (data, status = 200) => ({ data: { success: true, message: 'OK', ...data }, status, statusText: 'OK', headers: {}, config });
      const fail = (status, data) => {
        const error = new Error('request failed');
        error.response = { status, data: { success: false, errors: [], ...data } };
        throw error;
      };
      if (url === '/auth/me') return session ? ok({ data: { user: USERS[session], profile: null } }) : fail(401, { message: 'Authentication required.' });
      if (url === '/auth/logout') {
        session = null;
        return ok({ data: {} });
      }
      const handler = routes[key];
      if (!handler) throw new Error(`unmocked request: ${key}`);
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const result = handler({ body, params: config.params });
      if (result.networkError) throw new Error('Network Error');
      if (result.status && result.status >= 400) return fail(result.status, result.body);
      return ok(result, result.status ?? 200);
    };
    console.error = (...args) => errors.push(args.map(String).join(" ") + " @" + (globalThis.__path ?? ""));
  });

  after(async () => {
    console.error = originalConsoleError;
    await vite.close();
  });

  async function visit(path, asUser = 'super_admin', overrides = {}) {
    session = asUser;
    calls = [];
    clearContentCache();
    routes = { ...defaults(), ...overrides };
    document.body.innerHTML = '<div id="root"></div>';
    const router = RR.createMemoryRouter(appRoutes, { initialEntries: [path] }); globalThis.__path = path;
    const root = createRoot(document.getElementById('root'));
    await act(async () => {
      root.render(React.createElement(AuthProvider, null, React.createElement(RR.RouterProvider, { router })));
    });
    await tick();
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const loading = [...document.querySelectorAll('[role="status"]')].some((node) => /^Loading/.test(node.textContent));
      if (document.querySelector('h1') && !loading) break;
      await tick(40);
    }
    await tick();
    return { router, path: () => router.state.location.pathname + router.state.location.search, unmount: () => act(() => root.unmount()) };
  }

  const main = () => document.querySelector('main#main-content');
  const text = () => main().textContent;
  const h1 = () => document.querySelector('h1')?.textContent ?? '';
  const button = (label, scope = document) => [...scope.querySelectorAll('button')].find((item) => item.textContent.trim() === label || item.getAttribute('aria-label') === label);
  const buttonLike = (label, scope = document) => [...scope.querySelectorAll('button')].find((item) => item.textContent.includes(label));
  const link = (label) => [...document.querySelectorAll('a')].find((item) => item.textContent.trim() === label);
  const dialog = () => document.querySelector('[role="dialog"][aria-labelledby]:not([aria-label])');
  const click = async (element) => {
    assert.ok(element, 'element to click exists');
    await act(async () => element.click());
    await tick(60);
  };
  const called = (key) => calls.filter((call) => call.key === key);
  const labelled = (label, scope = document) => {
    const element = [...scope.querySelectorAll('label')].find((item) => item.textContent.startsWith(label));
    assert.ok(element, `a field labelled "${label}" exists`);
    return document.getElementById(element.htmlFor);
  };
  async function fill(fields, scope = document) {
    for (const [label, value] of Object.entries(fields)) {
      const input = labelled(label, scope);
      await act(async () => {
        const prototype = input.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
        input.dispatchEvent(new dom.window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      });
    }
  }
  const submitForm = async (form) => {
    assert.ok(form, 'form exists');
    await act(async () => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    await tick(80);
  };
  const formNamed = (name) => [...document.querySelectorAll('form')].find((item) => item.getAttribute('aria-label') === name);
  const press = async (key, target = document.activeElement ?? document.body) => {
    await act(async () => target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
    await tick(30);
  };

  describe('routing and guards', () => {
    const titles = {
      '/admin': 'Dashboard', '/admin/dashboard': 'Dashboard', '/admin/quotes': 'Quotes', '/admin/quotes/q1': 'Quote QT-2026-000001', '/admin/loads': 'Loads', '/admin/loads/l1': 'Load LD-2026-000001',
      '/admin/loads/l1/edit': 'Edit load LD-2026-000001', '/admin/loads/l1/matching': 'Carrier matching for LD-2026-000001', '/admin/shipments': 'Shipments', '/admin/shipments/s1': 'Shipment SH-2026-000001',
      '/admin/customers': 'Customers', '/admin/customers/c1': 'Acme Freight', '/admin/carriers': 'Carriers', '/admin/carriers/k1': 'Alpha Trucking LLC', '/admin/carrier-applications': 'Carrier applications',
      '/admin/carrier-applications/a1': 'Application from Applicant Haulage', '/admin/documents': 'Documents', '/admin/documents/d1': 'Bill of lading.pdf', '/admin/payments': 'Payments', '/admin/payments/p1': 'Payment REF-1',
      '/admin/notifications': 'Notifications', '/admin/activity-logs': 'Activity logs', '/admin/security': 'Security', '/admin/settings': 'Settings', '/admin/nope': 'Page not found',
    };
    for (const [path, title] of Object.entries(titles)) {
      test(`${path} renders "${title}" inside the admin layout`, async () => {
        const view = await visit(path);
        assert.equal(h1(), title);
        assert.equal(view.path(), path);
        assert.ok(document.querySelector('nav[aria-label="Super Admin"]') && main());
        await view.unmount();
      });
    }

    test('guests are sent to /admin/login from every admin area', async () => {
      for (const path of ['/admin', '/admin/quotes', '/admin/loads/l1/matching', '/admin/shipments/s1', '/admin/security', '/admin/settings']) {
        const view = await visit(path, null);
        assert.equal(view.path(), '/admin/login', path);
        assert.equal(h1(), 'Super Admin sign in');
        await view.unmount();
      }
    });

    test('customers and carriers are sent to their own portal and the admin API is never called', async () => {
      for (const [role, home] of [['customer', '/customer'], ['carrier', '/carrier']]) {
        for (const path of ['/admin', '/admin/quotes', '/admin/loads/l1/matching', '/admin/payments']) {
          const view = await visit(path, role);
          assert.equal(view.path(), home, `${role} ${path}`);
          assert.ok(!calls.some((call) => /^GET \/(operations|admin)\//.test(call.key)), 'no admin request was made');
          await view.unmount();
        }
      }
    });

    test('there is no /admin/loads/new page: the id "new" is an honest not-found', async () => {
      const view = await visit('/admin/loads/new', 'super_admin', { 'GET /operations/loads/new': () => ({ status: 400, body: { message: 'Invalid identifier.' } }) });
      assert.equal(h1(), 'Load details');
      assert.match(text(), /That load was not found/);
      assert.ok(!link('Create load') && !button('Create load'));
      await view.unmount();
    });

    test('the sidebar has the specified groups and links, includes the Website CMS group, and marks the current page', async () => {
      const view = await visit('/admin/loads');
      const nav = document.querySelector('nav[aria-label="Super Admin"]');
      assert.deepEqual([...nav.querySelectorAll('h2')].map((node) => node.textContent), ['Overview', 'Operations', 'Partners', 'Finance', 'Documents', 'Communication', 'Website CMS', 'System']);
      assert.deepEqual([...nav.querySelectorAll('a')].map((node) => node.textContent), ['Dashboard', 'Quotes', 'Loads', 'Shipments', 'Customers', 'Carriers', 'Carrier applications', 'Finance overview', 'Customer invoices', 'Carrier payables', 'Payment records', 'Payments', 'Documents', 'Notifications', 'Contact messages', 'Delivery log', 'Website overview', 'Homepage', 'Pages', 'Services', 'Industries', 'Service areas', 'Blog / Resources', 'FAQs', 'Testimonials', 'Media library', 'SEO', 'Navbar appearance', 'Website theme', 'Activity logs', 'Security', 'Settings']);
      assert.equal(nav.querySelector('[aria-current="page"]').textContent, 'Loads');
      assert.equal(nav.querySelectorAll('svg[aria-hidden="true"]').length, 32, 'every item has an SVG icon');
      await view.unmount();
    });

    test('/admin/dashboard is the same dashboard as /admin, with one nav item', async () => {
      const view = await visit('/admin/dashboard');
      assert.equal(document.querySelector('nav [aria-current="page"]').textContent, 'Dashboard');
      assert.equal([...document.querySelectorAll('nav a')].filter((a) => a.textContent === 'Dashboard').length, 1);
      await view.unmount();
    });

    test('breadcrumbs lead back up, and the current page is marked', async () => {
      const view = await visit('/admin/quotes/q1');
      const crumbs = document.querySelector('nav[aria-label="Breadcrumb"]');
      assert.deepEqual([...crumbs.querySelectorAll('a')].map((a) => a.textContent), ['Admin', 'Quotes']);
      assert.equal(crumbs.querySelector('[aria-current="page"]').textContent, 'QT-2026-000001');
      await view.unmount();
    });

    test('the mobile drawer is a dialog; Escape closes it and focus returns to the menu button', async () => {
      const view = await visit('/admin');
      const opener = document.querySelector('button[aria-label="Open navigation"]');
      assert.equal(opener.getAttribute('aria-expanded'), 'false');
      await click(opener);
      const drawer = document.querySelector('[role="dialog"][aria-label="Super Admin navigation"]');
      assert.ok(drawer && drawer.contains(document.activeElement));
      assert.equal(document.body.style.overflow, 'hidden');
      await press('Escape');
      assert.equal(document.querySelector('[role="dialog"]'), null);
      assert.equal(document.activeElement, opener);
      assert.notEqual(document.body.style.overflow, 'hidden');
      await view.unmount();
    });

    test('signing out ends the session and returns to the admin sign-in', async () => {
      const view = await visit('/admin');
      await click(button('Sign out'));
      assert.equal(view.path(), '/admin/login');
      assert.equal(called('POST /auth/logout').length, 1);
      await view.unmount();
    });
  });

  describe('session and API failures', () => {
    test('an expired session (401 from the API) sends the admin back to sign in', async () => {
      const view = await visit('/admin/quotes', 'super_admin', { 'GET /operations/quotes': () => ({ status: 401, body: { message: 'Authentication required.' } }) });
      for (let i = 0; i < 10 && view.path() !== '/admin/login'; i += 1) await tick(40);
      assert.equal(view.path(), '/admin/login');
      await view.unmount();
    });

    test('403 shows the permission message and no retry', async () => {
      const view = await visit('/admin/quotes', 'super_admin', { 'GET /operations/quotes': () => ({ status: 403, body: { message: 'Forbidden.' } }) });
      assert.match(text(), /You do not have permission to access this area\./);
      assert.ok(!buttonLike('Try again'));
      await view.unmount();
    });

    test('404 on a detail page says the record was not found', async () => {
      const view = await visit('/admin/quotes/q1', 'super_admin', { 'GET /operations/quotes/q1': () => ({ status: 404, body: { message: 'Quote not found.' } }) });
      assert.match(text(), /That quote was not found/);
      await view.unmount();
    });

    test('500 shows a generic message (never the raw error) with a working Retry', async () => {
      let attempts = 0;
      const view = await visit('/admin/shipments', 'super_admin', {
        'GET /operations/shipments': () => (++attempts === 1 ? { status: 500, body: { message: 'Internal Server Error at /srv/app/db.js:44 stack…' } } : { data: page([fx.shipmentSummary()]) }),
      });
      assert.match(text(), /We could not load this list/);
      assert.ok(!/db\.js|stack/.test(text()));
      await click(buttonLike('Try again'));
      assert.match(text(), /SH-2026-000001/);
      assert.equal(called('GET /operations/shipments').length, 2);
      await view.unmount();
    });

    test('a network failure is explained with Retry', async () => {
      const view = await visit('/admin/payments', 'super_admin', { 'GET /admin/payments': () => ({ networkError: true }) });
      assert.match(text(), /We could not load this list/);
      assert.ok(buttonLike('Try again'));
      await view.unmount();
    });

    test('a slow network shows a loading state first, then the data', async () => {
      delayMs = 250;
      session = 'super_admin';
      const view = await visit('/admin/security');
      delayMs = 0;
      assert.match(text(), /Failed sign-ins/);
      await view.unmount();
      delayMs = 300;
      calls = [];
      routes = { ...defaults() };
      document.body.innerHTML = '<div id="root"></div>';
      const router = RR.createMemoryRouter(appRoutes, { initialEntries: ['/admin/security'] });
      const root = createRoot(document.getElementById('root'));
      await act(async () => root.render(React.createElement(AuthProvider, null, React.createElement(RR.RouterProvider, { router }))));
      await tick(120);
      assert.ok(document.querySelector('[role="status"]') || document.querySelector('h1'), 'something is shown while loading');
      assert.ok(!/Failed sign-ins/.test(document.body.textContent), 'no data before the response');
      await tick(600);
      assert.match(document.body.textContent, /Failed sign-ins/);
      delayMs = 0;
      await act(() => root.unmount());
    });
  });

  describe('dashboard', () => {
    test('shows the backend figures exactly, with links to filtered lists', async () => {
      const view = await visit('/admin');
      const t = text();
      for (const label of ['New requests', 'Under review', 'Being priced', 'Quoted', 'Accepted, awaiting conversion', 'Needing a carrier', 'Overdue pickups', 'Live shipments', 'Open exceptions']) assert.match(t, new RegExp(label));
      assert.match(t, /Needing a carrier7/);
      assert.match(t, /Open exceptions2/);
      assert.match(t, /1 past their expiry date/);
      assert.equal(document.querySelector('a[href="/admin/shipments?exception=true"]')?.textContent.includes('Open exceptions'), true);
      assert.equal(called('GET /operations/dashboard').length, 1);
      await view.unmount();
    });

    test('the financial snapshot shows only what the server calculated', async () => {
      const view = await visit('/admin');
      assert.match(text(), /USD · 5 loads/);
      assert.match(text(), /\$12,500\.00/);
      assert.match(text(), /\$10,000\.00/);
      assert.match(text(), /\$2,500\.00/);
      await view.unmount();
    });

    test('with no financial data it says so instead of showing zeros or invented figures', async () => {
      const view = await visit('/admin', 'super_admin', { 'GET /operations/dashboard': () => ({ data: { ...fx.dashboard(), financials: { byCurrency: [], truncated: false }, recentActivity: [] } }) });
      assert.match(text(), /No financial data yet/);
      assert.match(text(), /No activity yet/);
      await view.unmount();
    });

    test('work queues ask the server with specific filters and render the results', async () => {
      const view = await visit('/admin');
      assert.deepEqual(called('GET /operations/quotes')[0].params, { limit: 5, sort: 'createdAt', order: 'desc' });
      assert.ok(called('GET /operations/loads').some((c) => c.params.status === 'open'));
      assert.ok(called('GET /operations/loads').some((c) => c.params.status === 'carrier_search'));
      assert.ok(called('GET /operations/shipments').some((c) => c.params.live === 'true'));
      assert.ok(called('GET /operations/shipments').some((c) => c.params.exception === 'true'));
      for (const heading of ['Recent quote requests', 'Loads awaiting a carrier', 'Active shipments', 'Exceptions']) assert.ok([...document.querySelectorAll('h2')].some((h) => h.textContent === heading), heading);
      assert.ok(link('QT-2026-000001'));
      await view.unmount();
    });

    test('one failing queue does not blank the dashboard, and it can be retried on its own', async () => {
      const view = await visit('/admin', 'super_admin', { 'GET /operations/quotes': () => ({ status: 500, body: { message: 'boom' } }) });
      assert.match(text(), /We could not load recent quote requests/);
      assert.match(text(), /Needing a carrier7/);
      await view.unmount();
    });

    test('empty queues say what they are for', async () => {
      const empty = () => ({ data: page([]) });
      const view = await visit('/admin', 'super_admin', { 'GET /operations/quotes': empty, 'GET /operations/loads': empty, 'GET /operations/shipments': empty });
      for (const message of ['No quote requests yet', 'No loads are waiting for a carrier', 'No active shipments', 'No open exceptions']) assert.match(text(), new RegExp(message));
      await view.unmount();
    });

    test('global search is validated and answered by the server', async () => {
      const view = await visit('/admin');
      const form = document.querySelector('form[role="search"]');
      await fill({ 'Search quotes': 'a' });
      await submitForm(form);
      assert.match(text(), /Enter at least 2 characters/);
      assert.equal(called('GET /admin/search').length, 0);
      await fill({ 'Search quotes': 'Acme' });
      await submitForm(form);
      assert.deepEqual(called('GET /admin/search')[0].params, { q: 'Acme' });
      assert.ok(link('Acme Freight'));
      await view.unmount();
    });

    test('partner figures come from the overview endpoint', async () => {
      const view = await visit('/admin');
      assert.match(text(), /Customers12/);
      assert.match(text(), /2 pending approval/);
      assert.match(text(), /3 pending/);
      await view.unmount();
    });
  });

  describe('quotes', () => {
    test('the list shows the specified columns and the customer price from the server', async () => {
      const view = await visit('/admin/quotes', 'super_admin', { 'GET /operations/quotes': () => ({ data: page([fx.quoteSummary({ status: 'quoted', operationsStatus: 'quoted', pricing: { customerRate: money(245000), carrierRate: money(200000), brokerMargin: money(45000), marginPercent: 18.37 } })]) }) });
      const headers = [...document.querySelectorAll('thead th')].map((th) => th.textContent);
      assert.deepEqual(headers, ['Quote #', 'Customer', 'Origin', 'Destination', 'Equipment', 'Pickup', 'Status', 'Customer price', 'Created', 'Actions']);
      assert.match(document.querySelector('tbody').textContent, /\$2,450\.00/);
      assert.match(document.querySelector('tbody').textContent, /Chicago, IL/);
      assert.ok(document.querySelector('thead th.sticky'), 'sticky header');
      assert.ok(document.querySelector('ul[aria-label="Quotes"]'), 'a stacked card list for narrow screens');
      assert.match(text(), /Quoted/);
      await view.unmount();
    });

    test('filters are sent to the server, kept in the URL, and Reset clears them', async () => {
      const view = await visit('/admin/quotes');
      assert.deepEqual(called('GET /operations/quotes')[0].params, {});
      await fill({ Search: 'machine', Status: 'quoted', 'Created from': '2026-10-01' });
      await submitForm(formNamed('Filter results'));
      assert.equal(view.path(), '/admin/quotes?q=machine&status=quoted&createdFrom=2026-10-01');
      const last = called('GET /operations/quotes').at(-1);
      assert.deepEqual(last.params, { q: 'machine', status: 'quoted', createdFrom: '2026-10-01' });
      await click(button('Reset'));
      assert.equal(view.path(), '/admin/quotes');
      assert.deepEqual(called('GET /operations/quotes').at(-1).params, {});
      await view.unmount();
    });

    test('a bookmarked filtered URL loads with the filter applied and shown', async () => {
      const view = await visit('/admin/quotes?status=reviewing&page=2&limit=50&junk=1');
      assert.deepEqual(called('GET /operations/quotes')[0].params, { status: 'reviewing', page: 2, limit: 50 });
      assert.equal(labelled('Status').value, 'reviewing');
      await view.unmount();
    });

    test('a one-character search is refused before any request is sent', async () => {
      const view = await visit('/admin/quotes');
      await fill({ Search: 'x' });
      await submitForm(formNamed('Filter results'));
      assert.match(text(), /Search needs at least 2 characters/);
      assert.equal(called('GET /operations/quotes').length, 1);
      assert.equal(labelled('Search').getAttribute('aria-invalid'), 'true');
      await view.unmount();
    });

    test('pagination and page size are server-side and reflected in the URL', async () => {
      const view = await visit('/admin/quotes', 'super_admin', { 'GET /operations/quotes': ({ params }) => ({ data: { items: [fx.quoteSummary()], pagination: { page: params.page ?? 1, limit: params.limit ?? 20, total: 45, totalPages: 3 } } }) });
      assert.match(text(), /Page 1 of 3 · 45 total/);
      await click(button('Next'));
      assert.equal(view.path(), '/admin/quotes?page=2');
      assert.equal(called('GET /operations/quotes').at(-1).params.page, 2);
      await fill({ 'Rows per page': '50' });
      assert.equal(view.path(), '/admin/quotes?page=2&limit=50'.replace('page=2&', ''));
      await view.unmount();
    });

    test('empty and filtered-empty states differ', async () => {
      const view = await visit('/admin/quotes', 'super_admin', { 'GET /operations/quotes': () => ({ data: page([]) }) });
      assert.match(text(), /No quote requests yet/);
      await view.unmount();
      const filtered = await visit('/admin/quotes?status=expired', 'super_admin', { 'GET /operations/quotes': () => ({ data: page([]) }) });
      assert.match(text(), /No results match these filters/);
      await filtered.unmount();
    });

    test('a 400 from a bad filter shows an error with Retry, not "not found"', async () => {
      const view = await visit('/admin/quotes', 'super_admin', { 'GET /operations/quotes': () => ({ status: 400, body: { message: 'Search needs at least 2 characters.' } }) });
      assert.match(text(), /Search needs at least 2 characters\./);
      assert.ok(!/was not found/.test(text()));
      await view.unmount();
    });
  });

  describe('quote detail and actions', () => {
    const actionLabels = () => [...document.querySelectorAll('[role="group"][aria-label="Available actions"] button')].map((b) => b.textContent);

    test('shows overview, customer, shipment, pricing, notes and timeline', async () => {
      const view = await visit('/admin/quotes/q1');
      for (const heading of ['Overview', 'Actions', 'Customer', 'Shipment', 'Origin', 'Destination', 'Pricing', 'Notes', 'Timeline', 'Activity log']) assert.ok([...document.querySelectorAll('h2')].some((h) => h.textContent === heading), heading);
      assert.match(text(), /Acme Freight/);
      assert.match(text(), /Machine parts/);
      assert.match(text(), /Call before sending/);
      assert.deepEqual(called('GET /admin/activity-logs')[0].params, { entityId: 'q1', limit: 25, order: 'desc' });
      await view.unmount();
    });

    test('buttons are exactly what nextStatuses allows, per status', async () => {
      const cases = [
        ['submitted', next('reviewing', 'cancelled'), ['Start review', 'Cancel quote']],
        ['under_review', next('pricing', 'cancelled'), ['Start pricing', 'Cancel quote']],
        ['pricing', next('quoted', 'cancelled'), ['Send quote to customer', 'Cancel quote']],
        ['quoted', next('customer_accepted', 'declined', 'expired', 'cancelled'), ['Expire quote', 'Cancel quote']],
        ['customer_accepted', next('converted_to_load', 'cancelled'), ['Convert to load', 'Cancel quote']],
        ['converted_to_load', [], []],
        ['cancelled', [], []],
      ];
      for (const [operationsStatus, nextStatuses, expected] of cases) {
        const view = await visit('/admin/quotes/q1', 'super_admin', { 'GET /operations/quotes/q1': () => ({ data: { quote: fx.quote({ operationsStatus, nextStatuses, pricing: { customerRate: money(245000), carrierRate: null, brokerMargin: null, marginPercent: null } }) } }) });
        assert.deepEqual(actionLabels(), expected, operationsStatus);
        await view.unmount();
      }
    });

    test('the admin cannot accept or decline for the customer: no such buttons, and an explanation', async () => {
      const view = await visit('/admin/quotes/q1', 'super_admin', { 'GET /operations/quotes/q1': () => ({ data: { quote: fx.quote({ operationsStatus: 'quoted', nextStatuses: next('customer_accepted', 'declined', 'expired') }) } }) });
      assert.ok(!buttonLike('Accept') && !buttonLike('Decline'));
      assert.match(text(), /customer accepts or declines from their own portal/);
      await view.unmount();
    });

    test('Start review calls the review endpoint once and shows a success message', async () => {
      const view = await visit('/admin/quotes/q1', 'super_admin', { 'POST /operations/quotes/q1/review': () => ({ data: { quote: fx.quote({ operationsStatus: 'under_review', nextStatuses: next('pricing') }) } }) });
      await click(button('Start review'));
      assert.equal(called('POST /operations/quotes/q1/review').length, 1);
      assert.match(document.body.textContent, /Quote moved to review\./);
      assert.equal(called('GET /operations/quotes/q1').length, 2, 'reloaded from the server');
      await view.unmount();
    });

    test('the pricing form is shown only when the server allows the quoted step, converts dollars to cents and never sends a margin', async () => {
      const priced = { 'GET /operations/quotes/q1': () => ({ data: { quote: fx.quote({ operationsStatus: 'pricing', nextStatuses: next('quoted', 'cancelled') }) } }), 'PUT /operations/quotes/q1/pricing': () => ({ data: { quote: fx.quote() } }) };
      let view = await visit('/admin/quotes/q1');
      assert.equal(formNamed('Set pricing'), undefined);
      await view.unmount();
      view = await visit('/admin/quotes/q1', 'super_admin', priced);
      assert.ok(formNamed('Set pricing'));
      assert.ok(!document.querySelector('input[name="brokerMargin"], input[name="margin"]') && !/Broker margin.*input/i.test(formNamed('Set pricing').textContent));
      await fill({ 'Customer rate': '2,450.50', 'Carrier rate (optional)': '1980' });
      await submitForm(formNamed('Set pricing'));
      assert.deepEqual(called('PUT /operations/quotes/q1/pricing')[0].body, { customerRate: 245050, carrierRate: 198000, currency: 'USD' });
      assert.match(document.body.textContent, /Pricing saved\./);
      await view.unmount();
    });

    test('pricing validation: bad amounts are refused locally, with the first invalid field focused', async () => {
      const view = await visit('/admin/quotes/q1', 'super_admin', { 'GET /operations/quotes/q1': () => ({ data: { quote: fx.quote({ operationsStatus: 'pricing', nextStatuses: next('quoted') }) } }) });
      await fill({ 'Customer rate': '12.345' });
      await submitForm(formNamed('Set pricing'));
      assert.equal(called('PUT /operations/quotes/q1/pricing').length, 0);
      assert.match(text(), /Enter the customer rate as an amount/);
      await tick(10);
      assert.equal(document.activeElement.getAttribute('aria-invalid'), 'true');
      await view.unmount();
    });

    test('a negative margin is refused by the server, and only an explicit confirmation resends it', async () => {
      let attempt = 0;
      const view = await visit('/admin/quotes/q1', 'super_admin', {
        'GET /operations/quotes/q1': () => ({ data: { quote: fx.quote({ operationsStatus: 'pricing', nextStatuses: next('quoted') }) } }),
        'PUT /operations/quotes/q1/pricing': ({ body }) => (body.allowNegativeMargin ? { data: { quote: fx.quote() } } : (attempt++, { status: 409, body: { message: 'The carrier rate is higher than the customer rate, which would sell this freight at a loss.', code: 'NEGATIVE_MARGIN' } })),
      });
      await fill({ 'Customer rate': '1000', 'Carrier rate (optional)': '1200' });
      await submitForm(formNamed('Set pricing'));
      assert.match(text(), /would sell this freight at a loss/);
      assert.equal(called('PUT /operations/quotes/q1/pricing')[0].body.allowNegativeMargin, undefined);
      await click(buttonLike('Review and accept a negative margin'));
      assert.ok(dialog());
      await click(button('Save anyway', dialog()));
      assert.equal(called('PUT /operations/quotes/q1/pricing').at(-1).body.allowNegativeMargin, true);
      assert.equal(attempt, 1);
      await view.unmount();
    });

    test('Send quote needs the customer rate, asks for confirmation, and sends the validity', async () => {
      const state = { 'GET /operations/quotes/q1': () => ({ data: { quote: fx.quote({ operationsStatus: 'pricing', nextStatuses: next('quoted'), pricing: { customerRate: money(245000), carrierRate: null, brokerMargin: null, marginPercent: null } }) } }), 'POST /operations/quotes/q1/send': () => ({ data: { quote: fx.quote() } }) };
      let view = await visit('/admin/quotes/q1', 'super_admin', { 'GET /operations/quotes/q1': () => ({ data: { quote: fx.quote({ operationsStatus: 'pricing', nextStatuses: next('quoted') }) } }) });
      assert.equal(button('Send quote to customer').disabled, true);
      assert.match(text(), /Save the customer rate before sending/);
      await view.unmount();
      view = await visit('/admin/quotes/q1', 'super_admin', state);
      await click(button('Send quote to customer'));
      assert.ok(dialog());
      assert.match(dialog().textContent, /never the carrier rate or margin/);
      assert.equal(called('POST /operations/quotes/q1/send').length, 0, 'nothing sent before confirming');
      await fill({ 'Valid for (optional)': '14' }, dialog());
      await click(button('Send quote', dialog()));
      assert.deepEqual(called('POST /operations/quotes/q1/send')[0].body, { validForDays: 14 });
      assert.equal(dialog(), null);
      await view.unmount();
    });

    test('Cancel quote requires a reason, shows a danger dialog, and sends the reason', async () => {
      const view = await visit('/admin/quotes/q1', 'super_admin', { 'POST /operations/quotes/q1/cancel': () => ({ data: { quote: fx.quote() } }) });
      await click(button('Cancel quote'));
      assert.match(dialog().textContent, /Cancel quote QT-2026-000001\?/);
      await click(button('Cancel quote', dialog()));
      assert.match(dialog().textContent, /Reason is required\./);
      assert.equal(called('POST /operations/quotes/q1/cancel').length, 0);
      await fill({ Reason: 'Customer withdrew' }, dialog());
      await click(button('Cancel quote', dialog()));
      assert.deepEqual(called('POST /operations/quotes/q1/cancel')[0].body, { reason: 'Customer withdrew' });
      await view.unmount();
    });

    test('Convert to load confirms, then opens the new load', async () => {
      const view = await visit('/admin/quotes/q1', 'super_admin', {
        'GET /operations/quotes/q1': () => ({ data: { quote: fx.quote({ operationsStatus: 'customer_accepted', nextStatuses: next('converted_to_load', 'cancelled') }) } }),
        'POST /operations/quotes/q1/convert': () => ({ data: { quote: fx.quote(), load: { id: 'l1', loadNumber: 'LD-2026-000001' } } }),
      });
      await click(button('Convert to load'));
      assert.match(dialog().textContent, /It can only be done once/);
      await click(button('Convert to load', dialog()));
      assert.equal(view.path(), '/admin/loads/l1');
      await view.unmount();
    });

    test('a 409 conflict is explained inside the dialog, which stays open with what was typed', async () => {
      const view = await visit('/admin/quotes/q1', 'super_admin', { 'POST /operations/quotes/q1/cancel': () => ({ status: 409, body: { message: 'This quote can no longer be cancelled.', code: 'INVALID_STATUS_TRANSITION' } }) });
      await click(button('Cancel quote'));
      await fill({ Reason: 'Because' }, dialog());
      await click(button('Cancel quote', dialog()));
      assert.ok(dialog());
      assert.match(dialog().textContent, /This quote can no longer be cancelled\./);
      assert.equal(labelled('Reason', dialog()).value, 'Because');
      await view.unmount();
    });

    test('double-clicking a confirm sends one request (duplicate-submit protection)', async () => {
      const view = await visit('/admin/quotes/q1', 'super_admin', { 'POST /operations/quotes/q1/cancel': () => ({ data: { quote: fx.quote() } }) });
      delayMs = 150;
      await click(button('Cancel quote'));
      await fill({ Reason: 'Duplicate test' }, dialog());
      const confirm = button('Cancel quote', dialog());
      const form = dialog().querySelector('form');
      await act(async () => {
        form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      });
      await tick(400);
      delayMs = 0;
      assert.equal(called('POST /operations/quotes/q1/cancel').length, 1);
      void confirm;
      await view.unmount();
    });

    test('dialogs: Escape closes and returns focus to the button, Tab stays inside, the page behind is locked', async () => {
      const view = await visit('/admin/quotes/q1');
      const opener = button('Cancel quote');
      opener.focus();
      await click(opener);
      const d = dialog();
      assert.equal(d.getAttribute('aria-modal'), 'true');
      assert.ok(d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby')));
      assert.equal(document.body.style.overflow, 'hidden');
      assert.ok(d.contains(document.activeElement), 'focus moved into the dialog');
      const focusable = [...d.querySelectorAll('button, textarea, input, select')].filter((e) => !e.disabled);
      focusable.at(-1).focus();
      await press('Tab', focusable.at(-1));
      assert.ok(d.contains(document.activeElement), 'Tab wraps inside the dialog');
      await press('Escape');
      assert.equal(dialog(), null);
      assert.equal(document.activeElement, opener);
      assert.notEqual(document.body.style.overflow, 'hidden');
      assert.equal(called('POST /operations/quotes/q1/cancel').length, 0, 'Escape does not confirm');
      await view.unmount();
    });

    test('internal notes save through the notes endpoint', async () => {
      const view = await visit('/admin/quotes/q1', 'super_admin', { 'PATCH /operations/quotes/q1/internal-notes': () => ({ data: { quote: fx.quote() } }) });
      await fill({ 'Internal notes': 'Waiting for the carrier' });
      await submitForm(formNamed('Internal notes'));
      assert.deepEqual(called('PATCH /operations/quotes/q1/internal-notes')[0].body, { internalNotes: 'Waiting for the carrier' });
      assert.match(document.body.textContent, /Notes saved\./);
      await view.unmount();
    });
  });

  describe('loads', () => {
    const actionLabels = () => [...document.querySelectorAll('[role="group"][aria-label="Available actions"] button')].map((b) => b.textContent);

    test('the list has the specified columns, the margin from the server, and unassigned loads say so', async () => {
      const view = await visit('/admin/loads');
      assert.deepEqual([...document.querySelectorAll('thead th')].map((th) => th.textContent), ['Load #', 'Customer', 'Origin', 'Destination', 'Equipment', 'Pickup', 'Carrier', 'Status', 'Margin', 'Created', 'Actions']);
      const row = document.querySelector('tbody').textContent;
      assert.match(row, /\$611\.11/);
      assert.match(row, /Unassigned/);
      assert.match(row, /2026-11-03 09:00/, 'pickup is shown in the stop’s own local time');
      await view.unmount();
    });

    test('every specified filter exists and is sent to the server', async () => {
      const view = await visit('/admin/loads');
      for (const label of ['Search', 'Status', 'Carrier', 'Customer', 'Assigned carrier', 'Equipment', 'Domestic or cross-border', 'Origin country', 'Destination country', 'Pickup from', 'Pickup to']) labelled(label);
      await fill({ Status: 'open', Carrier: 'true', 'Domestic or cross-border': 'true', 'Origin country': 'US', 'Pickup from': '2026-11-01' });
      await submitForm(formNamed('Filter results'));
      assert.deepEqual(called('GET /operations/loads').at(-1).params, { status: 'open', unassigned: 'true', crossBorder: 'true', originCountry: 'US', pickupFrom: '2026-11-01' });
      await view.unmount();
    });

    test('customer and carrier pickers are filled by the server', async () => {
      const view = await visit('/admin/loads');
      assert.ok(called('GET /admin/customers').length >= 1 && called('GET /admin/carriers').length >= 1);
      assert.ok([...labelled('Customer').options].some((o) => o.textContent === 'Acme Freight'));
      await view.unmount();
    });

    test('the detail page has every specified section', async () => {
      const view = await visit('/admin/loads/l1');
      for (const heading of ['Summary', 'Actions', 'Customer', 'Carrier', 'Pickup', 'Delivery', 'Equipment and commodity', 'Pricing', 'Assignment history', 'Documents', 'Activity timeline']) assert.ok([...document.querySelectorAll('h2')].some((h) => h.textContent === heading), heading);
      assert.match(text(), /File storage is not configured yet\./);
      assert.match(text(), /No carrier is assigned/);
      assert.match(text(), /\$611\.11/);
      assert.match(text(), /2026-11-03 09:00 \(America\/Chicago\)/);
      await view.unmount();
    });

    test('status buttons come only from nextStatuses (no arbitrary status changes)', async () => {
      const cases = [
        [next('open', 'cancelled'), ['Open for carriers', 'Cancel load']],
        [next('carrier_search', 'cancelled'), ['Start carrier search', 'Cancel load']],
        [next('assigned', 'cancelled'), ['Cancel load']],
        [next('picked_up'), []],
        [[], []],
      ];
      for (const [nextStatuses, expected] of cases) {
        const view = await visit('/admin/loads/l1', 'super_admin', { 'GET /operations/loads/l1': () => ({ data: { load: fx.load({ nextStatuses }) } }) });
        assert.deepEqual(actionLabels(), expected);
        assert.ok(!document.querySelector('select[name="status"]'), 'no free status selector');
        await view.unmount();
      }
    });

    test('Create shipment appears only for an assigned load without one, and confirms first', async () => {
      const assigned = fx.load({ status: 'assigned', operationsStatus: 'carrier_assigned', carrier, nextStatuses: next('dispatched', 'cancelled') });
      const view = await visit('/admin/loads/l1', 'super_admin', { 'GET /operations/loads/l1': () => ({ data: { load: assigned } }), 'POST /operations/loads/l1/shipment': () => ({ status: 201, data: { shipment: fx.shipment() } }) });
      await click(button('Create shipment'));
      assert.equal(called('POST /operations/loads/l1/shipment').length, 0);
      await click(button('Create shipment', dialog()));
      assert.equal(called('POST /operations/loads/l1/shipment').length, 1);
      await view.unmount();
      const withShipment = await visit('/admin/loads/l1', 'super_admin', { 'GET /operations/loads/l1': () => ({ data: { load: { ...assigned, shipment: { id: 's1', trackingNumber: 'HL-ABC123XYZ9', shipmentNumber: 'SH-2026-000001', status: 'booked' } } } }) });
      assert.ok(!button('Create shipment'));
      assert.ok(link('SH-2026-000001'));
      await withShipment.unmount();
    });

    test('cancelling a load needs a reason and a confirmation', async () => {
      const view = await visit('/admin/loads/l1', 'super_admin', { 'POST /operations/loads/l1/cancel': () => ({ data: { load: fx.load() } }) });
      await click(button('Cancel load'));
      await click(button('Cancel load', dialog()));
      assert.match(dialog().textContent, /Reason is required/);
      await fill({ Reason: 'Customer withdrew' }, dialog());
      await click(button('Cancel load', dialog()));
      assert.deepEqual(called('POST /operations/loads/l1/cancel')[0].body, { reason: 'Customer withdrew' });
      await view.unmount();
    });

    test('the assignment history table shows who, when and why', async () => {
      const history = [{ carrier, assignedAt: '2026-10-05T12:00:00.000Z', assignedBy: 'u0', unassignedAt: '2026-10-06T12:00:00.000Z', unassignedBy: 'u0', reason: 'Breakdown' }];
      const view = await visit('/admin/loads/l1', 'super_admin', { 'GET /operations/loads/l1': () => ({ data: { load: fx.load({ assignmentHistory: history }) } }) });
      assert.match(text(), /Alpha Trucking LLC/);
      assert.match(text(), /Breakdown/);
      await view.unmount();
    });

    test('the edit page saves details, schedule and carrier rate separately, with local times and a time zone', async () => {
      const view = await visit('/admin/loads/l1/edit', 'super_admin', {
        'PATCH /operations/loads/l1': () => ({ data: { load: fx.load() } }),
        'PUT /operations/loads/l1/schedule': () => ({ data: { load: fx.load() } }),
        'PUT /operations/loads/l1/carrier-rate': () => ({ data: { load: fx.load() } }),
      });
      await fill({ Commodity: 'Gadgets' });
      await submitForm(formNamed('Load details'));
      assert.equal(called('PATCH /operations/loads/l1')[0].body.commodity, 'Gadgets');
      await fill({ 'Pickup time zone': '' });
      await submitForm(formNamed('Schedule'));
      assert.match(text(), /Choose the time zone of the pickup location/);
      assert.equal(called('PUT /operations/loads/l1/schedule').length, 0);
      await fill({ 'Pickup time zone': 'America/Chicago' });
      await submitForm(formNamed('Schedule'));
      const body = called('PUT /operations/loads/l1/schedule')[0].body;
      assert.deepEqual(body.pickup, { earliest: '2026-11-03T09:00', timezone: 'America/Chicago' });
      await fill({ 'Carrier rate': '2,512.34' });
      await submitForm(formNamed('Carrier rate'));
      assert.deepEqual(called('PUT /operations/loads/l1/carrier-rate')[0].body, { carrierRate: 251234 });
      await view.unmount();
    });

    test('an API error on save keeps what the admin typed', async () => {
      const view = await visit('/admin/loads/l1/edit', 'super_admin', { 'PATCH /operations/loads/l1': () => ({ status: 409, body: { message: 'This load can no longer be edited.' } }) });
      await fill({ Commodity: 'Keep me' });
      await submitForm(formNamed('Load details'));
      assert.match(text(), /This load can no longer be edited\./);
      assert.equal(labelled('Commodity').value, 'Keep me');
      await view.unmount();
    });
  });

  describe('carrier matching', () => {
    test('shows what the server returned: eligible carriers with a badge, ineligible ones with the server’s reasons', async () => {
      const view = await visit('/admin/loads/l1/matching');
      assert.match(text(), /Alpha Trucking LLC/);
      assert.match(text(), /Eligible/);
      assert.match(text(), /Score 92/);
      assert.match(text(), /Charlie Suspended Co/);
      assert.match(text(), /Not eligible/);
      assert.match(text(), /This carrier is suspended\./);
      assert.match(text(), /Insurance has expired\./);
      assert.match(text(), /Evaluated 2 carriers: 1 eligible, 1 not eligible/);
      assert.equal(called('GET /operations/loads/l1/carrier-matches').length, 1);
      await view.unmount();
    });

    test('eligibility is never decided in the browser: a carrier is eligible exactly when the server says so', async () => {
      const matching = fx.matching({
        matches: [{ ...fx.matching().matches[0], companyName: 'Suspended Looking Co', status: 'suspended', complianceStatus: 'rejected', eligible: true }],
        excluded: [{ ...fx.matching().excluded[0], companyName: 'Perfect Looking Co', status: 'active', complianceStatus: 'approved', reasons: [{ code: 'OUTSIDE_SERVICE_AREA', message: 'Outside the service area.' }] }],
      });
      const view = await visit('/admin/loads/l1/matching', 'super_admin', { 'GET /operations/loads/l1/carrier-matches': () => ({ data: { matching } }) });
      const eligible = [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Eligible carriers').closest('section');
      const notEligible = [...document.querySelectorAll('h2')].find((h) => h.textContent === 'Not eligible').closest('section');
      assert.match(eligible.textContent, /Suspended Looking Co/);
      assert.match(notEligible.textContent, /Perfect Looking Co/);
      assert.match(notEligible.textContent, /Outside the service area\./);
      assert.ok(!button('Assign Perfect Looking Co'), 'no assign action on an ineligible carrier');
      await view.unmount();
    });

    test('empty results explain themselves', async () => {
      const view = await visit('/admin/loads/l1/matching', 'super_admin', { 'GET /operations/loads/l1/carrier-matches': () => ({ data: { matching: fx.matching({ matches: [], counts: { evaluated: 1, eligible: 0, excluded: 1 } }) } }) });
      assert.match(text(), /No eligible carriers/);
      await view.unmount();
    });

    test('Assign opens a confirmation naming the load, the carrier and the consequence, and nothing is sent until confirmed', async () => {
      const view = await visit('/admin/loads/l1/matching', 'super_admin', { 'POST /operations/loads/l1/assign': () => ({ data: { load: fx.load() } }) });
      await click(button('Assign Alpha Trucking LLC'));
      const d = dialog();
      assert.match(d.textContent, /Assign Alpha Trucking LLC\?/);
      assert.match(d.textContent, /LD-2026-000001/);
      assert.match(d.textContent, /The carrier is notified/);
      assert.equal(called('POST /operations/loads/l1/assign').length, 0);
      assert.equal(labelled('Carrier rate', d).value, '2512.34', 'prefilled from the server’s carrier rate');
      await fill({ Reason: 'Best fit' }, d);
      await click(button('Assign carrier', d));
      assert.deepEqual(called('POST /operations/loads/l1/assign')[0].body, { carrierId: 'k1', carrierRate: 251234, reason: 'Best fit' });
      assert.match(document.body.textContent, /Alpha Trucking LLC assigned\./);
      assert.equal(dialog(), null);
      await view.unmount();
    });

    test('a negative margin is only allowed by an explicit choice in the dialog', async () => {
      const view = await visit('/admin/loads/l1/matching', 'super_admin', { 'POST /operations/loads/l1/assign': () => ({ data: { load: fx.load() } }) });
      await click(button('Assign Alpha Trucking LLC'));
      await fill({ 'If this would sell the load at a loss': 'allow' }, dialog());
      await click(button('Assign carrier', dialog()));
      assert.equal(called('POST /operations/loads/l1/assign')[0].body.allowNegativeMargin, true);
      await view.unmount();
    });

    test('an eligibility conflict from the server (409) is shown in the dialog and the dialog stays open', async () => {
      const view = await visit('/admin/loads/l1/matching', 'super_admin', { 'POST /operations/loads/l1/assign': () => ({ status: 409, body: { message: 'This carrier is no longer eligible for this load.', code: 'CARRIER_NOT_ELIGIBLE' } }) });
      await click(button('Assign Alpha Trucking LLC'));
      await click(button('Assign carrier', dialog()));
      assert.ok(dialog());
      assert.match(dialog().textContent, /no longer eligible/);
      await view.unmount();
    });

    test('with a carrier assigned, other eligible carriers offer Reassign (reason required) and the current one can be removed', async () => {
      const second = { ...fx.matching().matches[0], carrierId: 'k3', companyName: 'Bravo Freight Inc', score: 70 };
      const assigned = fx.load({ status: 'assigned', operationsStatus: 'carrier_assigned', carrier, nextStatuses: next('dispatched', 'cancelled') });
      const view = await visit('/admin/loads/l1/matching', 'super_admin', {
        'GET /operations/loads/l1': () => ({ data: { load: assigned } }),
        'GET /operations/loads/l1/carrier-matches': () => ({ data: { matching: fx.matching({ matches: [fx.matching().matches[0], second] }) } }),
        'POST /operations/loads/l1/reassign': () => ({ data: { load: assigned } }),
        'POST /operations/loads/l1/unassign': () => ({ data: { load: assigned } }),
      });
      assert.ok(!button('Assign Bravo Freight Inc'), 'Assign is not offered while a carrier is assigned');
      assert.match(text(), /Current carrier/);
      await click(button('Replace the carrier with Bravo Freight Inc'));
      assert.match(dialog().textContent, /Alpha Trucking LLC → Bravo Freight Inc/);
      await click(button('Replace carrier', dialog()));
      assert.match(dialog().textContent, /Reason is required\./);
      assert.equal(called('POST /operations/loads/l1/reassign').length, 0);
      await fill({ Reason: 'Breakdown' }, dialog());
      await click(button('Replace carrier', dialog()));
      assert.deepEqual(called('POST /operations/loads/l1/reassign')[0].body, { carrierId: 'k3', reason: 'Breakdown', carrierRate: 251234 });

      await click(button('Remove carrier'));
      assert.match(dialog().textContent, /goes back to the carrier search/);
      await click(button('Remove carrier', dialog()));
      assert.match(dialog().textContent, /Reason is required\./);
      await fill({ Reason: 'Carrier cancelled', 'Return the load to': 'open' }, dialog());
      await click(button('Remove carrier', dialog()));
      assert.deepEqual(called('POST /operations/loads/l1/unassign')[0].body, { reason: 'Carrier cancelled', returnTo: 'open' });
      await view.unmount();
    });

    test('Escape closes the assignment dialog without assigning and returns focus', async () => {
      const view = await visit('/admin/loads/l1/matching');
      const opener = button('Assign Alpha Trucking LLC');
      opener.focus();
      await click(opener);
      await press('Escape');
      assert.equal(dialog(), null);
      assert.equal(called('POST /operations/loads/l1/assign').length, 0);
      assert.equal(document.activeElement, opener);
      await view.unmount();
    });

    test('a 404 for the load says so', async () => {
      const view = await visit('/admin/loads/l1/matching', 'super_admin', { 'GET /operations/loads/l1': () => ({ status: 404, body: { message: 'Load not found.' } }), 'GET /operations/loads/l1/carrier-matches': () => ({ status: 404, body: { message: 'Load not found.' } }) });
      assert.match(text(), /That load was not found/);
      await view.unmount();
    });
  });

  describe('shipments', () => {
    const actionLabels = () => [...document.querySelectorAll('[role="group"][aria-label="Available actions"] button')].map((b) => b.textContent);

    test('the list has the specified columns and filters', async () => {
      const view = await visit('/admin/shipments');
      assert.deepEqual([...document.querySelectorAll('thead th')].map((th) => th.textContent), ['Shipment #', 'Tracking #', 'Load #', 'Customer', 'Carrier', 'Origin', 'Destination', 'Status', 'Border status', 'Last update', 'Actions']);
      for (const label of ['Search shipment or tracking number', 'Status', 'Customer', 'Carrier', 'Domestic or cross-border', 'Exceptions', 'Created from', 'Created to']) labelled(label);
      await fill({ Exceptions: 'true', 'Domestic or cross-border': 'false' });
      await submitForm(formNamed('Filter results'));
      assert.deepEqual(called('GET /operations/shipments').at(-1).params, { crossBorder: 'false', exception: 'true' });
      await view.unmount();
    });

    test('the detail page has every specified section, and a domestic shipment has no border section', async () => {
      const view = await visit('/admin/shipments/s1');
      for (const heading of ['Summary', 'Actions', 'Tracking', 'Route', 'Customer', 'Carrier', 'Pickup', 'Delivery', 'Exceptions', 'Documents', 'Tracking timeline', 'Activity log']) assert.ok([...document.querySelectorAll('h2')].some((h) => h.textContent === heading), heading);
      assert.ok(![...document.querySelectorAll('h2')].some((h) => h.textContent === 'Border'));
      assert.match(text(), /Proof of delivery:.*not on file/);
      assert.match(text(), /Joliet, IL, US/);
      await view.unmount();
    });

    test('the current location is never invented: with none recorded it says so', async () => {
      const view = await visit('/admin/shipments/s1');
      assert.match(text(), /No location has been recorded yet\./);
      await view.unmount();
    });

    test('only valid actions appear: border steps are hidden for domestic shipments and shown for cross-border ones', async () => {
      let view = await visit('/admin/shipments/s1');
      assert.deepEqual(actionLabels(), ['Out for delivery', 'Record delivery', 'Raise exception']);
      await view.unmount();
      view = await visit('/admin/shipments/s1', 'super_admin', { 'GET /operations/shipments/s1': () => ({ data: { shipment: fx.shipment({ isCrossBorder: true, borderStatus: 'pending' }) } }) });
      assert.deepEqual(actionLabels(), ['Out for delivery', 'Record delivery', 'Arrived at border', 'Raise exception']);
      assert.ok([...document.querySelectorAll('h2')].some((h) => h.textContent === 'Border'));
      await view.unmount();
    });

    test('each workflow step follows the server’s nextStatuses', async () => {
      const steps = [['dispatched', 'Dispatch'], ['picked_up', 'Record pickup'], ['in_transit', 'Mark in transit'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Record delivery'], ['completed', 'Complete shipment']];
      for (const [status, label] of steps) {
        const view = await visit('/admin/shipments/s1', 'super_admin', { 'GET /operations/shipments/s1': () => ({ data: { shipment: fx.shipment({ nextStatuses: next(status) }) } }) });
        assert.deepEqual(actionLabels(), [label]);
        await view.unmount();
      }
    });

    test('Dispatch confirms, then calls the dispatch action with the note', async () => {
      const view = await visit('/admin/shipments/s1', 'super_admin', {
        'GET /operations/shipments/s1': () => ({ data: { shipment: fx.shipment({ status: 'booked', operationsStatus: 'scheduled', nextStatuses: next('dispatched', 'cancelled', 'exception') }) } }),
        'POST /operations/shipments/s1/dispatch': () => ({ data: { shipment: fx.shipment() } }),
      });
      assert.deepEqual(actionLabels(), ['Dispatch', 'Raise exception', 'Cancel shipment']);
      await click(button('Dispatch'));
      assert.equal(called('POST /operations/shipments/s1/dispatch').length, 0);
      await fill({ 'Note (optional)': 'Truck 12' }, dialog());
      await click(button('Dispatch', dialog()));
      assert.deepEqual(called('POST /operations/shipments/s1/dispatch')[0].body, { note: 'Truck 12' });
      assert.match(document.body.textContent, /Shipment dispatched\./);
      await view.unmount();
    });

    test('raising an exception sends a reason and note; an open exception hides the step buttons and offers Resolve', async () => {
      const view = await visit('/admin/shipments/s1', 'super_admin', { 'POST /operations/shipments/s1/exceptions': () => ({ data: { shipment: fx.shipment() } }) });
      await click(button('Raise exception'));
      await fill({ Reason: 'weather', 'Note (optional)': 'Snow on I-80' }, dialog());
      await click(button('Raise exception', dialog()));
      assert.deepEqual(called('POST /operations/shipments/s1/exceptions')[0].body, { reason: 'weather', note: 'Snow on I-80' });
      await view.unmount();

      const open = { id: 'x1', reason: 'weather', note: 'Snow', reportedAt: '2026-10-05T10:00:00.000Z', resolvedAt: null, resolutionNote: null };
      const inException = fx.shipment({ status: 'exception', operationsStatus: 'exception', nextStatuses: next('in_transit', 'cancelled'), exceptions: [open], exception: open });
      const second = await visit('/admin/shipments/s1', 'super_admin', { 'GET /operations/shipments/s1': () => ({ data: { shipment: inException } }), 'POST /operations/shipments/s1/exceptions/x1/resolve': () => ({ data: { shipment: fx.shipment() } }) });
      assert.deepEqual(actionLabels(), ['Cancel shipment']);
      assert.match(text(), /has an open exception/);
      await click(button('Resolve the Weather exception'));
      await fill({ 'Resolution note': 'Road reopened' }, dialog());
      await click(button('Resolve exception', dialog()));
      assert.deepEqual(called('POST /operations/shipments/s1/exceptions/x1/resolve')[0].body, { note: 'Road reopened' });
      await second.unmount();
    });

    test('cancelling a shipment needs a reason; completed shipments offer nothing', async () => {
      const view = await visit('/admin/shipments/s1', 'super_admin', { 'GET /operations/shipments/s1': () => ({ data: { shipment: fx.shipment({ nextStatuses: next('cancelled') }) } }), 'POST /operations/shipments/s1/cancel': () => ({ data: { shipment: fx.shipment() } }) });
      await click(button('Cancel shipment'));
      await click(button('Cancel shipment', dialog()));
      assert.match(dialog().textContent, /Reason is required/);
      await fill({ Reason: 'Customer cancelled' }, dialog());
      await click(button('Cancel shipment', dialog()));
      assert.deepEqual(called('POST /operations/shipments/s1/cancel')[0].body, { reason: 'Customer cancelled' });
      await view.unmount();
      const done = await visit('/admin/shipments/s1', 'super_admin', { 'GET /operations/shipments/s1': () => ({ data: { shipment: fx.shipment({ status: 'completed', operationsStatus: 'completed', nextStatuses: [] }) } }) });
      assert.deepEqual(actionLabels(), []);
      assert.ok(!formNamed('Record a location update'));
      await done.unmount();
    });

    test('recording a location sends only what the admin typed', async () => {
      const view = await visit('/admin/shipments/s1', 'super_admin', { 'POST /operations/shipments/s1/tracking-updates': () => ({ data: { shipment: fx.shipment() } }) });
      await submitForm(formNamed('Record a location update'));
      assert.match(text(), /Enter a city or a state\./);
      assert.equal(called('POST /operations/shipments/s1/tracking-updates').length, 0);
      await fill({ City: 'Gary', 'State or province': 'IN' });
      await submitForm(formNamed('Record a location update'));
      assert.deepEqual(called('POST /operations/shipments/s1/tracking-updates')[0].body, { location: { city: 'Gary', state: 'IN', country: 'US' } });
      await view.unmount();
    });

    test('a 409 on a workflow step is shown in the dialog', async () => {
      const view = await visit('/admin/shipments/s1', 'super_admin', { 'POST /operations/shipments/s1/deliver': () => ({ status: 409, body: { message: 'This shipment cannot move to delivered from its current status.', code: 'INVALID_STATUS_TRANSITION' } }) });
      await click(button('Record delivery'));
      await click(button('Record delivery', dialog()));
      assert.match(dialog().textContent, /cannot move to delivered/);
      await view.unmount();
    });
  });

  describe('partners', () => {
    test('customers: list, filters, detail with account and counts, links to their quotes and loads', async () => {
      let view = await visit('/admin/customers');
      assert.deepEqual([...document.querySelectorAll('thead th')].map((th) => th.textContent), ['Company', 'Contact', 'Email', 'Phone', 'Status', 'Joined', 'Actions']);
      await fill({ Search: 'acme', Status: 'active' });
      await submitForm(formNamed('Filter results'));
      assert.deepEqual(called('GET /admin/customers').at(-1).params, { q: 'acme', status: 'active' });
      await view.unmount();
      view = await visit('/admin/customers/c1');
      assert.match(text(), /casey@acme\.test/);
      assert.match(text(), /Pays on time/);
      assert.match(text(), /Quote requests4/);
      assert.ok(document.querySelector('a[href="/admin/quotes?customerId=c1"]') && document.querySelector('a[href="/admin/loads?customerId=c1"]'));
      assert.ok(!/passwordHash|token/i.test(text()));
      await view.unmount();
    });

    test('carriers: list, filters, detail with authority, insurance, equipment and loads', async () => {
      let view = await visit('/admin/carriers');
      for (const label of ['Search name, contact, email, MC or DOT', 'Status', 'Compliance', 'Equipment', 'Cross-border capability']) labelled(label);
      await view.unmount();
      view = await visit('/admin/carriers/k1');
      for (const heading of ['Profile', 'Authority and compliance', 'Insurance', 'Equipment and coverage', 'Sign-in account', 'Loads', 'Internal notes']) assert.ok([...document.querySelectorAll('h2')].some((h) => h.textContent === heading), heading);
      assert.match(text(), /Shield/);
      assert.match(text(), /Dry Van, Reefer/);
      assert.match(text(), /4\.5 of 5/);
      assert.ok(document.querySelector('a[href="/admin/loads?carrierId=k1"]'));
      await view.unmount();
    });

    test('partner pages 404 cleanly and a 403 is explained', async () => {
      let view = await visit('/admin/customers/c1', 'super_admin', { 'GET /admin/customers/c1': () => ({ status: 404, body: { message: 'Customer not found.' } }) });
      assert.match(text(), /That customer was not found/);
      await view.unmount();
      view = await visit('/admin/carriers', 'super_admin', { 'GET /admin/carriers': () => ({ status: 403, body: { message: 'Forbidden' } }) });
      assert.match(text(), /You do not have permission/);
      await view.unmount();
    });

    test('carrier applications: a pending one offers review decisions and says what a decision does and does not do', async () => {
      let view = await visit('/admin/carrier-applications');
      assert.match(text(), /Applicant Haulage/);
      await view.unmount();
      view = await visit('/admin/carrier-applications/a1');
      assert.ok(buttonLike('Approve application') && buttonLike('Reject application') && buttonLike('Mark under review'));
      assert.match(text(), /does not create a sign-in account/);
      assert.match(text(), /Not reviewed yet/);
      await view.unmount();
    });

    test('website guest quotes: labelled in the list, guest contact on the detail page, send and convert disabled with the reason', async () => {
      const guest = { customer: null, isGuest: true, source: 'public', guestName: 'Pat Goods' };
      let view = await visit('/admin/quotes', 'super_admin', { 'GET /operations/quotes': () => ({ data: page([fx.quoteSummary(guest)]) }) });
      assert.match(text(), /Guest: Pat Goods/);
      assert.ok([...document.querySelectorAll('label')].some((label) => label.textContent.startsWith('Source')), 'a Source filter exists');
      await view.unmount();

      const detail = fx.quote({ ...guest, status: 'pricing', operationsStatus: 'pricing', nextStatuses: next('quoted', 'cancelled'), pricing: { customerRate: money(245000), carrierRate: money(200000), brokerMargin: money(45000), marginPercent: 18.37 }, contactInformation: { name: 'Pat Shipper', company: 'Pat Goods', email: 'pat@example.com', phone: '555 123 4567' } });
      view = await visit('/admin/quotes/q1', 'super_admin', { 'GET /operations/quotes/q1': () => ({ data: { quote: detail } }) });
      assert.match(text(), /Website guest/);
      assert.match(text(), /pat@example\.com/);
      assert.match(text(), /Website guest \(no account\)/);
      assert.ok(buttonLike('Send quote to customer').disabled, 'send is disabled for a guest quote');
      assert.match(text(), /guest request from the website with no customer account/);
      assert.ok(!buttonLike('Cancel quote').disabled, 'cancelling stays available');
      await view.unmount();
    });

    test('carrier application detail shows the applicant\'s own notes apart from internal notes', async () => {
      const view = await visit('/admin/carrier-applications/a1', 'super_admin', { 'GET /admin/carrier-applications/a1': () => ({ data: { application: { ...fx.application(), applicantNotes: 'Two trucks weekly.' } } }) });
      assert.match(text(), /Notes from the applicant/);
      assert.match(text(), /Two trucks weekly\./);
      await view.unmount();
    });

    test('contact messages inbox: listed, opened, marked handled; the message is shown as plain text', async () => {
      const row = { id: 'm1', name: 'Alex Visitor', company: 'Visitor Inc', email: 'alex@visitor.test', phone: null, interest: 'shipping', subject: 'Weekly lane', status: 'new', createdAt: '2026-10-09T10:00:00.000Z', handledAt: null };
      const full = { ...row, message: '<b>Do you</b> cover this lane?', handledBy: null, updatedAt: row.createdAt };
      let view = await visit('/admin/contact-messages', 'super_admin', { 'GET /admin/contact-messages': () => ({ data: page([row]) }) });
      assert.match(text(), /Weekly lane/);
      assert.match(text(), /Alex Visitor · Visitor Inc/);
      assert.ok(link('Contact messages'), 'the inbox is in the admin navigation');
      await view.unmount();

      view = await visit('/admin/contact-messages/m1', 'super_admin', {
        'GET /admin/contact-messages/m1': () => ({ data: { message: full } }),
        'POST /admin/contact-messages/m1/handled': () => ({ data: { message: { ...full, status: 'handled', handledAt: '2026-10-09T11:00:00.000Z' } } }),
      });
      assert.match(text(), /<b>Do you<\/b> cover this lane\?/, 'shown as text, not rendered as HTML');
      assert.equal(document.querySelector('main b'), null);
      assert.match(text(), /No reply is sent from here/);
      await act(async () => buttonLike('Mark handled').click());
      await tick(60);
      assert.equal(called('POST /admin/contact-messages/m1/handled').length, 1);
      await view.unmount();
    });
  });

  describe('documents, payments, notifications', () => {
    test('documents: honest about storage, no download links or buttons while storage is not configured', async () => {
      let view = await visit('/admin/documents');
      assert.match(text(), /File storage is not configured yet\./);
      assert.match(text(), /Bill of lading\.pdf/);
      assert.ok(buttonLike('Upload document').disabled, 'uploads are disabled without storage');
      assert.ok(!document.querySelector('a[download], a[href*="http"]') && !buttonLike('Download') && !buttonLike('Preview'));
      await view.unmount();
      view = await visit('/admin/documents/d1');
      assert.match(text(), /Document storage is not configured yet\./);
      assert.ok(!buttonLike('Download') && !link('Download') && !buttonLike('Preview') && !document.querySelector('main a[href^="http"]'));
      await view.unmount();
      view = await visit('/admin/documents', 'super_admin', { 'GET /admin/documents': () => ({ data: page([]) }) });
      assert.match(text(), /File storage is not configured yet\./);
      await view.unmount();
    });

    test('payments: only ledger fields, and no processor, transaction or invoice number is invented', async () => {
      let view = await visit('/admin/payments');
      assert.deepEqual([...document.querySelectorAll('thead th')].map((th) => th.textContent), ['Reference', 'Type', 'Amount', 'Status', 'Load', 'Customer', 'Carrier', 'Payment date', 'Created', 'Actions']);
      assert.match(text(), /\$1,250\.00/);
      assert.match(text(), /No payment processor is connected/);
      await fill({ Status: 'paid', Type: 'carrier_payment' });
      await submitForm(formNamed('Filter results'));
      assert.deepEqual(called('GET /admin/payments').at(-1).params, { status: 'paid', paymentType: 'carrier_payment' });
      await view.unmount();
      view = await visit('/admin/payments/p1');
      assert.match(text(), /Net 30/);
      assert.ok(!/transaction id|invoice number|stripe|paypal/i.test(text()));
      await view.unmount();
    });

    test('notifications: unread filter, mark as read, and a link to the related record', async () => {
      let read = false;
      const view = await visit('/admin/notifications', 'super_admin', {
        'GET /admin/notifications': () => ({ data: page([fx.notification({ isRead: read })], { unreadCount: read ? 0 : 1 }) }),
        'GET /admin/notification-preferences': () => ({ data: { preferences: { emailNotifications: true, smsNotifications: false, quoteNotifications: true, shipmentNotifications: true, documentNotifications: true }, channels: { emailAvailable: false, smsAvailable: false, smsPhoneOnFile: false }, securityEmailsAlwaysSent: true } }),
        'POST /admin/notifications/n1/read': () => { read = true; return { data: { notification: fx.notification({ isRead: true }) } }; },
      });
      assert.match(text(), /New quote request/);
      assert.match(text(), /1 unread/);
      assert.ok(document.querySelector('a[href="/admin/quotes/q1"]'));
      // Phase 11: email/text copies exist now, controlled by the settings panel. With no provider the page says so plainly.
      assert.match(text(), /Email and text copies follow the settings at the bottom of this page/);
      assert.match(text(), /Email delivery is not set up on this system yet, so no emails are sent\./);
      await click(button('Mark as read: New quote request'));
      assert.equal(called('POST /admin/notifications/n1/read').length, 1);
      assert.match(text(), /0 unread/);
      await click(button('Unread only'));
      assert.deepEqual(called('GET /admin/notifications').at(-1).params, { unread: 'true' });
      await view.unmount();
    });

    test('notifications: empty state', async () => {
      const view = await visit('/admin/notifications', 'super_admin', { 'GET /admin/notifications': () => ({ data: page([], { unreadCount: 0 }) }) });
      assert.match(text(), /No notifications yet/);
      await view.unmount();
    });
  });

  describe('activity logs, security and settings', () => {
    test('activity logs: specified columns, filters sent to the server, metadata shown safely', async () => {
      const entry = fx.activity({ metadata: { validForDays: 7, password: 'hunter2', apiToken: 'abc', nested: { ok: 1 } } });
      const view = await visit('/admin/activity-logs', 'super_admin', { 'GET /admin/activity-logs': () => ({ data: page([entry, fx.activity({ id: 'g3', actor: null, action: 'auth.login.failed', module: 'auth', entityId: null, result: 'failure', description: null, metadata: null })]) }) });
      assert.deepEqual([...document.querySelectorAll('thead th')].map((th) => th.textContent), ['Time', 'Actor', 'Action', 'Entity', 'Entity ID', 'Result']);
      assert.match(text(), /Root Admin/);
      assert.match(text(), /Valid for days: 7/);
      assert.ok(!/hunter2|apiToken|Api token|abc/.test(text()), 'secret-looking metadata is never rendered');
      assert.match(text(), /Failure/);
      assert.match(text(), /System or signed-out/);
      for (const label of ['Action contains', 'Entity', 'Actor', 'Result', 'From', 'To']) labelled(label);
      await fill({ Entity: 'quotes', Actor: 'super_admin', Result: 'success', From: '2026-10-01' });
      await submitForm(formNamed('Filter results'));
      assert.deepEqual(called('GET /admin/activity-logs').at(-1).params, { module: 'quotes', actorType: 'super_admin', result: 'success', from: '2026-10-01' });
      await view.unmount();
    });

    test('security: real figures, unavailable items labelled, and no secrets', async () => {
      const view = await visit('/admin/security');
      assert.match(text(), /Failed sign-ins, 24 hours2/);
      assert.match(text(), /Two-factor authentication: unavailable/);
      assert.match(text(), /Active session list: unavailable/);
      assert.match(text(), /HttpOnly cookie/);
      assert.match(text(), /20 attempts per 15 minutes/);
      assert.ok(!/password|jwt|token|reset link|cookie value|secret/i.test(text().replace(/Passwords? (resets|changes)[^A-Z]*/g, '').replace(/HttpOnly cookie \(not readable by page scripts\)/, '').replace(/Secure cookie/, '').replace(/Password resets, 7 days|Password changes, 7 days/g, '')), 'no secret material is displayed');
      await view.unmount();
    });

    test('settings: one editable page backed by the CMS settings API; empty state when nothing is saved', async () => {
      let view = await visit('/admin/settings');
      assert.equal(labelled('Email').value, 'hello@hashimi.test');
      assert.equal(labelled('Phone').value, '312-555-0000');
      await fill({ 'Company name': '' });
      await submitForm(formNamed('Website settings'));
      assert.match(text(), /Enter the company name/);
      assert.equal(called('PATCH /admin/cms/settings').length, 0, 'an invalid form is never sent');
      await fill({ 'Company name': 'Changed Co' });
      await submitForm(formNamed('Website settings'));
      const sent = called('PATCH /admin/cms/settings');
      assert.equal(sent.length, 1);
      assert.equal(sent[0].body.companyName, 'Changed Co');
      for (const forbidden of ['role', 'accountType', 'status', 'id', 'userId']) assert.ok(!(forbidden in sent[0].body), `${forbidden} is never sent`);
      await view.unmount();
      view = await visit('/admin/settings', 'super_admin', { 'GET /admin/cms/settings': () => ({ data: { exists: false } }) });
      assert.match(text(), /No website settings have been saved yet/);
      await view.unmount();
    });
  });

  describe('static guarantees about the admin source', () => {
    const walk = (dir) => readdirSync(`${ROOT}${dir}`, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
    const adminFiles = [...walk('src/pages/admin'), ...walk('src/components/admin'), 'src/services/adminService.js', 'src/layouts/AdminLayout.jsx', 'src/hooks/useAdminAction.js', 'src/hooks/useListParams.js'];
    const source = (file) => readFileSync(`${ROOT}${file}`, 'utf8');

    test('no alert(), confirm(), prompt(), raw fetch/axios, browser storage, debug leftovers or dangerouslySetInnerHTML', () => {
      for (const file of adminFiles) {
        const code = source(file);
        assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(code.replace(/\bconfirmLabel|\bonConfirm\b/g, '')), `${file} uses a native dialog`);
        assert.ok(!/\b(?:fetch|axios)\s*[.(]/.test(code), `${file} must use the shared apiClient through adminService`);
        assert.ok(!/localStorage|sessionStorage|indexedDB/.test(code), `${file} touches browser storage`);
        assert.ok(!/console\.(log|debug)|debugger|TODO|FIXME/.test(code), `${file} has debug leftovers`);
        assert.ok(!/dangerouslySetInnerHTML/.test(code), `${file} injects HTML`);
      }
    });

    test('pages reach the API only through adminService', () => {
      for (const file of adminFiles.filter((f) => f.startsWith('src/pages/admin') || f.startsWith('src/components/admin'))) {
        assert.ok(!/from '\.\.\/\.\.\/services\/apiClient'|apiClient\./.test(source(file)), `${file} bypasses adminService`);
      }
    });

    test('every adminService endpoint is a real /operations or /admin route', () => {
      const urls = [...source('src/services/adminService.js').matchAll(/['`]\/((?:operations|admin)\/[^'`]*)['`]/g)].map((m) => m[1]);
      assert.ok(urls.length > 40);
      for (const url of urls) assert.match(url, /^(operations|admin)\//);
      assert.ok(!/\/loads\/new|post\(\s*['`]\/operations\/loads['`]|createLoad/.test(source('src/services/adminService.js')), 'no direct load creation');
    });

    test('text is never smaller than 16px: no text-xs / text-sm / arbitrary small sizes', () => {
      for (const file of adminFiles) {
        const code = source(file);
        assert.ok(!/\btext-(xs|sm)\b|text-\[(?:[0-9]|1[0-5])(?:\.\d+)?px\]/.test(code), `${file} uses text smaller than 16px`);
        assert.ok(!/\bh-(?:[1-9])\b(?!\d)[^"]*\bbutton/.test(code), `${file}`);
      }
    });

    test('there is no frontend pricing, eligibility or margin logic', () => {
      for (const file of adminFiles.filter((f) => !/adminStatuses|money\.js/.test(f))) {
        const code = source(file);
        assert.ok(!/customerRate\s*[-*/]\s*carrierRate|carrierRate\s*[-*/]\s*customerRate|\.amount\s*[-*/]\s*[\w.]*\.amount/.test(code), `${file} computes a margin`);
        assert.ok(!/complianceStatus\s*===|authorityStatus\s*===|insurance.*expir.*<\s*new Date/.test(code.replace(/\.expired/g, '')), `${file} decides eligibility`);
      }
    });

    test('no status is ever sent from a form: no free status field and no status in any request body', () => {
      const service = source('src/services/adminService.js');
      assert.ok(!/\bstatus\s*[:,]/.test(service.replace(/\/\/.*$/gm, '')), 'adminService never passes a status');
    });
  });

  describe('website navbar appearance (Website CMS -> Navbar appearance)', () => {
    let DEFAULTS;
    const appearanceRoute = (appearance, extra = {}) => ({ data: { appearance, defaults: DEFAULTS, isDefault: JSON.stringify(appearance) === JSON.stringify(DEFAULTS), updatedAt: null, ...extra } });
    const byLabel = (label) => {
      const node = [...document.querySelectorAll('main label')].find((item) => item.textContent.trim() === label);
      assert.ok(node, `a field labelled "${label}" exists`);
      return document.getElementById(node.htmlFor);
    };
    const setValue = async (input, value) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
    };
    const previews = () => [...document.querySelectorAll('main figure')];
    const previewVar = (index, name) => previews()[index].querySelector('[style]').style.getPropertyValue(name);

    before(async () => {
      ({ DEFAULT_NAVBAR_APPEARANCE: DEFAULTS } = await vite.ssrLoadModule('/src/config/navbarAppearance.js'));
    });

    test('the frontend defaults and limits are identical to the API\'s', async () => {
      const frontend = await vite.ssrLoadModule('/src/config/navbarAppearance.js');
      const backend = await import(pathToFileURL(`${ROOT}../backend/src/cms/navbarAppearance.js`).href);
      assert.deepEqual(JSON.parse(JSON.stringify(frontend.NAVBAR_APPEARANCE_SPEC)), JSON.parse(JSON.stringify(backend.NAVBAR_APPEARANCE_SPEC)));
      assert.equal(String(frontend.HEX_COLOR), String(backend.HEX_COLOR));
    });

    test('shows the two preview states and the four sections; editing only changes the local preview, never the server', async () => {
      const view = await visit('/admin/cms/navbar', 'super_admin', { 'GET /admin/cms/settings/navbar-appearance': () => appearanceRoute(DEFAULTS) });
      assert.equal(h1(), 'Navbar appearance');
      assert.deepEqual(previews().map((figure) => figure.querySelector('figcaption').textContent), ['1. Over the hero (transparent glass)', '2. After scrolling (solid)']);
      for (const heading of ['Preview', 'Hero state', 'Scrolled state', 'Navigation links', 'Action buttons']) assert.ok([...document.querySelectorAll('main h2')].some((h) => h.textContent === heading), heading);
      assert.equal(previewVar(0, '--nav-bg'), '#22252A', 'transparent glass is off by default, so the hero preview is solid too');
      assert.equal(previewVar(1, '--nav-bg'), '#22252A');
      assert.match(text(), /Transparent glass is off, so the navbar is solid over the hero too/);
      assert.ok(button('Save changes').disabled, 'nothing to save yet');
      assert.ok(previews()[0].querySelector('[inert]'), 'the preview cannot be clicked or focused');

      await setValue(document.getElementById('navbar-scrolled-backgroundColor-hex'), '#303030');
      assert.equal(previewVar(0, '--nav-bg'), '#303030');
      assert.equal(previewVar(1, '--nav-bg'), '#303030');
      assert.match(text(), /You have unsaved changes/);
      assert.ok(!button('Save changes').disabled);
      assert.equal(called('PUT /admin/cms/settings/navbar-appearance').length, 0, 'the preview never saves');

      await act(async () => button('Revert unsaved changes').click());
      assert.equal(previewVar(0, '--nav-bg'), '#22252A');
      assert.ok(button('Save changes').disabled);
      await view.unmount();
    });

    test('an invalid colour blocks the save; a valid draft is saved as the complete set', async () => {
      let sent = null;
      const view = await visit('/admin/cms/navbar', 'super_admin', {
        'GET /admin/cms/settings/navbar-appearance': () => appearanceRoute(DEFAULTS),
        'PUT /admin/cms/settings/navbar-appearance': ({ body }) => {
          sent = body;
          return appearanceRoute(body);
        },
      });
      const hex = document.getElementById('navbar-hero-backgroundColor-hex');
      await setValue(hex, 'blue');
      await act(async () => button('Save changes').click());
      await tick(60);
      assert.match(text(), /Use a 6-digit hex colour/);
      assert.equal(sent, null, 'nothing is sent while a value is invalid');

      await setValue(hex, '#222222');
      await setValue(byLabel('Glass opacity'), '60');
      await setValue(byLabel('Scroll distance before it turns solid'), '120');
      await act(async () => button('Save changes').click());
      await tick(80);
      const expected = JSON.parse(JSON.stringify(DEFAULTS));
      expected.hero.backgroundColor = '#222222';
      expected.hero.backgroundOpacity = 60;
      expected.scrolled.scrollThreshold = 120;
      assert.deepEqual(sent, expected);
      await view.unmount();
    });

    test('a server validation error is shown and nothing is reported as saved', async () => {
      const view = await visit('/admin/cms/navbar', 'super_admin', {
        'GET /admin/cms/settings/navbar-appearance': () => appearanceRoute(DEFAULTS),
        'PUT /admin/cms/settings/navbar-appearance': () => ({ status: 422, body: { message: 'Please correct the highlighted fields.', errors: [{ field: 'hero.blur', message: 'Use 20 or less.' }] } }),
      });
      await setValue(byLabel('Background blur'), '12');
      await act(async () => button('Save changes').click());
      await tick(80);
      assert.match(text(), /Please correct the highlighted fields/);
      assert.match(text(), /Use 20 or less/);
      assert.match(text(), /You have unsaved changes/);
      await view.unmount();
    });

    test('Reset to defaults asks first, then restores the defaults on the server', async () => {
      const saved = JSON.parse(JSON.stringify(DEFAULTS));
      saved.scrolled.backgroundColor = '#303030';
      const view = await visit('/admin/cms/navbar', 'super_admin', {
        'GET /admin/cms/settings/navbar-appearance': () => appearanceRoute(saved),
        'POST /admin/cms/settings/navbar-appearance/reset': () => appearanceRoute(DEFAULTS),
      });
      assert.equal(previewVar(0, '--nav-bg'), '#303030');
      await act(async () => button('Reset to defaults').click());
      assert.equal(called('POST /admin/cms/settings/navbar-appearance/reset').length, 0, 'nothing happens before confirming');
      const dialog = document.querySelector('[role="dialog"], [role="alertdialog"], dialog');
      assert.ok(dialog);
      assert.match(dialog.textContent, /Other website settings are not changed/);
      await act(async () => button('Reset to defaults', dialog).click());
      await tick(80);
      assert.equal(called('POST /admin/cms/settings/navbar-appearance/reset').length, 1);
      await view.unmount();
    });

    test('customers and carriers cannot open the page, and the admin API is never called for them', async () => {
      for (const [role, home] of [['customer', '/customer'], ['carrier', '/carrier']]) {
        const view = await visit('/admin/cms/navbar', role);
        assert.equal(view.path(), home);
        assert.ok(!calls.some((call) => call.key.includes('navbar-appearance')));
        await view.unmount();
      }
    });
  });

  describe('website theme (Website CMS -> Website theme)', () => {
    let THEME_DEFAULTS;
    const themeRoute = (theme) => ({ data: { theme, defaults: THEME_DEFAULTS, isDefault: JSON.stringify(theme) === JSON.stringify(THEME_DEFAULTS), updatedAt: null } });
    const setInput = async (input, value) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
    };
    const preview = () => document.querySelector('main [inert][style]');

    before(async () => {
      ({ DEFAULT_THEME_APPEARANCE: THEME_DEFAULTS } = await vite.ssrLoadModule('/src/config/themeAppearance.js'));
    });

    test('the preview shows the draft only; nothing is saved until Save changes, and an invalid colour blocks the save', async () => {
      let sent = null;
      const view = await visit('/admin/cms/theme', 'super_admin', {
        'GET /admin/cms/settings/theme-appearance': () => themeRoute(THEME_DEFAULTS),
        'PUT /admin/cms/settings/theme-appearance': ({ body }) => {
          sent = body;
          return themeRoute(body);
        },
      });
      assert.equal(h1(), 'Website theme');
      assert.equal(preview().style.getPropertyValue('--color-signal-400'), '#D8AD54');
      assert.ok(button('Save changes').disabled);

      const accent = document.getElementById('theme-colors-accentColor-hex');
      await setInput(accent, '#C9A045');
      assert.equal(preview().style.getPropertyValue('--color-signal-400'), '#C9A045', 'the preview follows the draft');
      assert.equal(called('PUT /admin/cms/settings/theme-appearance').length, 0, 'the preview never saves');

      const surface = document.getElementById('theme-colors-surfaceColor-hex');
      await setInput(surface, '#1A1A1A');
      assert.match(text(), /Some text may be hard to read/, 'a readability warning appears for dark text on a dark page');
      await setInput(surface, '#FFFFFF');

      await setInput(accent, 'gold');
      await act(async () => button('Save changes').click());
      await tick(60);
      assert.match(text(), /Use a 6-digit hex colour/);
      assert.equal(sent, null);

      await setInput(accent, '#C9A045');
      await act(async () => [...document.querySelectorAll('main input[type="radio"]')].find((input) => input.value === 'rounded').click());
      await act(async () => button('Save changes').click());
      await tick(80);
      const expected = JSON.parse(JSON.stringify(THEME_DEFAULTS));
      expected.colors.accentColor = '#C9A045';
      expected.layout.cornerRadius = 'rounded';
      assert.deepEqual(sent, expected, 'the complete set is sent');
      await view.unmount();
    });

    test('Reset to defaults asks first, then resets on the server', async () => {
      const saved = JSON.parse(JSON.stringify(THEME_DEFAULTS));
      saved.motion.preset = 'off';
      const view = await visit('/admin/cms/theme', 'super_admin', {
        'GET /admin/cms/settings/theme-appearance': () => themeRoute(saved),
        'POST /admin/cms/settings/theme-appearance/reset': () => themeRoute(THEME_DEFAULTS),
      });
      await act(async () => button('Reset to defaults').click());
      assert.equal(called('POST /admin/cms/settings/theme-appearance/reset').length, 0);
      const dialog = document.querySelector('[role="dialog"], [role="alertdialog"], dialog');
      assert.match(dialog.textContent, /navbar, homepage content and other settings are not changed/);
      await act(async () => button('Reset to defaults', dialog).click());
      await tick(80);
      assert.equal(called('POST /admin/cms/settings/theme-appearance/reset').length, 1);
      await view.unmount();
    });

    test('customers and carriers cannot open the page', async () => {
      for (const [role, home] of [['customer', '/customer'], ['carrier', '/carrier']]) {
        const view = await visit('/admin/cms/theme', role);
        assert.equal(view.path(), home);
        assert.ok(!calls.some((call) => call.key.includes('theme-appearance')));
        await view.unmount();
      }
    });
  });

  test('no React errors or warnings were logged during the whole run', () => {
    assert.deepEqual(errors, []);
  });
});
