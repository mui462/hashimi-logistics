/**
 * Phase 6 carrier portal, rendered in jsdom against a mocked API (the mocks live only in this file).
 * Covers routing and guards, navigation and the mobile drawer, and every carrier page's loading / data / empty / error
 * states, tracking, documents, notifications, profile and password flows. Run with: npm test
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
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
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
  customer: { id: 'u1', firstName: 'Casey', lastName: 'Customer', fullName: 'Casey Customer', email: 'casey@example.com', role: 'customer' },
  super_admin: { id: 'u3', firstName: 'Root', lastName: 'Admin', fullName: 'Root Admin', email: 'root@example.com', role: 'super_admin' },
  carrier: { id: 'u2', firstName: 'Kai', lastName: 'Carrier', fullName: 'Kai Carrier', email: 'k@example.com', role: 'carrier' },
};

const place = { city: 'Chicago', state: 'IL', country: 'US' };
const dest = { city: 'Toronto', state: 'ON', country: 'CA' };
const full = (p, extra = {}) => ({ facilityName: 'North Dock', street: '1 Main St', zipCode: '60601', ...p, ...extra });
const fx = {
  profile: () => ({
    account: { firstName: 'Kai', lastName: 'Carrier', email: 'k@example.com', phone: '312-555-0100', isEmailVerified: true, lastLogin: '2026-10-01T12:00:00.000Z', memberSince: '2026-09-01T12:00:00.000Z' },
    company: { companyName: 'Hauler Trucking', contactPerson: 'Dispatch', businessEmail: null, phone: '312-555-0100', address: null, equipmentTypes: ['Dry Van'], operatingRegions: ['Midwest'], crossBorderCapability: true, mcNumber: 'MC-1234', dotNumber: 'DOT-5678', authorityStatus: 'active', complianceStatus: 'approved', status: 'active' },
  }),
  openLoad: (extra = {}) => ({ id: 'l1', loadNumber: 'LD-2026-000009', status: 'open', origin: place, destination: dest, pickupWindow: { earliest: '2026-12-01T09:00:00.000Z', latest: null }, deliveryWindow: null, equipmentType: 'Dry Van', commodity: 'Machine parts', weight: { value: 12000, unit: 'lb' }, isCrossBorder: true, pay: { amount: 180000, currency: 'USD' }, postedAt: '2026-10-01T12:00:00.000Z', ...extra }),
  myLoad: (extra = {}) => ({ id: 'm1', loadNumber: 'LD-2026-000001', status: 'in_transit', origin: full(place), destination: full(dest), pickupWindow: null, deliveryWindow: null, equipmentType: 'Dry Van', commodity: 'Machine parts', weight: { value: 12000, unit: 'lb' }, isCrossBorder: true, pay: { amount: 180000, currency: 'USD' }, updatedAt: '2026-10-02T12:00:00.000Z', ...extra }),
  myLoadDetail: () => ({ ...fx.myLoad(), pickupAppointment: '2026-12-01T09:00:00.000Z', deliveryAppointment: null, specialInstructions: 'Check in at gate 3', ownedByYou: true, shipment: { id: 's1', trackingNumber: 'HL-ABC123XYZ9', status: 'in_transit' }, documents: [{ id: 'd1', name: 'ratecon.pdf', type: 'Rate Confirmation', createdAt: '2026-10-02T10:00:00.000Z' }] }),
  shipment: (extra = {}) => ({ id: 's1', trackingNumber: 'HL-ABC123XYZ9', status: 'in_transit', borderStatus: 'pending', isCrossBorder: true, loadId: 'm1', loadNumber: 'LD-2026-000001', origin: full(place), destination: full(dest), equipmentType: 'Dry Van', commodity: 'Machine parts', estimatedPickup: null, estimatedDelivery: '2026-12-05T12:00:00.000Z', actualPickup: null, actualDelivery: null, currentLocation: { city: 'Detroit', state: 'MI', country: 'US' }, updatedAt: '2026-10-02T12:00:00.000Z', ...extra }),
  shipmentDetail: () => ({ ...fx.shipment(), pickupWindow: null, deliveryWindow: null, weight: { value: 12000, unit: 'lb' }, pay: { amount: 180000, currency: 'USD' }, exception: null, events: [{ status: 'booked', timestamp: '2026-10-01T10:00:00.000Z', location: '' }, { status: 'in_transit', timestamp: '2026-10-02T10:00:00.000Z', location: 'Detroit, MI, US' }], borderEvents: [{ event: 'at_border', timestamp: '2026-10-03T10:00:00.000Z', location: 'Windsor, ON, CA' }], documents: [{ id: 'd1', name: 'ratecon.pdf', type: 'Rate Confirmation', createdAt: '2026-10-02T10:00:00.000Z' }], payments: [{ id: 'p1', reference: 'REF-1', loadId: 'm1', loadNumber: 'LD-2026-000001', amount: 180000, currency: 'USD', status: 'pending', paidAt: null, recordedAt: '2026-10-02T10:00:00.000Z' }] }),
  document: (extra = {}) => ({ id: 'd1', name: 'ratecon.pdf', type: 'Rate Confirmation', mimeType: 'application/pdf', fileSize: 20480, relatedEntityType: 'shipment', relatedEntityId: 's1', relatedLabel: 'HL-ABC123XYZ9', createdAt: '2026-10-02T10:00:00.000Z', ...extra }),
  payment: (extra = {}) => ({ id: 'p1', reference: 'REF-1', loadId: 'm1', loadNumber: 'LD-2026-000001', amount: 180000, currency: 'USD', status: 'pending', paidAt: null, recordedAt: '2026-10-02T10:00:00.000Z', ...extra }),
  notification: (extra = {}) => ({ id: 'n1', type: 'load', title: 'Load assigned', message: 'A load was assigned to you.', isRead: false, relatedEntity: { entityType: 'load', entityId: 'm1' }, createdAt: '2026-10-02T10:00:00.000Z', ...extra }),
  page: (items, extra = {}) => ({ items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 }, ...extra }),
  dashboard: () => ({
    loadBoard: { eligible: true, reason: null },
    stats: { availableLoads: 5, myActiveLoads: 2, activeShipments: 3, inTransit: 1, delivered: 7, pendingPayments: { count: 1, totals: [{ currency: 'USD', amount: 180000 }] }, unreadNotifications: 4 },
    recentLoads: [fx.myLoad()], recentShipments: [fx.shipment()], recentNotifications: [fx.notification()],
    recentActivity: [{ kind: 'shipment', title: 'Shipment HL-ABC123XYZ9: in transit', entityId: 's1', at: '2026-10-02T12:00:00.000Z' }],
  }),
  emptyDashboard: (eligible = true) => ({ loadBoard: { eligible, reason: eligible ? null : 'Available loads are shown once your carrier account, authority and compliance have been approved.' }, stats: { availableLoads: 0, myActiveLoads: 0, activeShipments: 0, inTransit: 0, delivered: 0, pendingPayments: { count: 0, totals: [] }, unreadNotifications: 0 }, recentLoads: [], recentShipments: [], recentNotifications: [], recentActivity: [] }),
};

describe('Phase 6 carrier portal', () => {
  let vite;
  let appRoutes;
  let AuthProvider;
  let apiClient;
  let session = null;
  let calls = [];
  let routes = {};
  const errors = [];
  const originalConsoleError = console.error;
  const tick = (ms = 30) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

  const defaults = () => ({
    'GET /carrier/profile': () => ({ data: fx.profile() }),
    'GET /carrier/dashboard': () => ({ data: fx.dashboard() }),
    'GET /carrier/loads': () => ({ data: fx.page([fx.openLoad()], { eligibility: { eligible: true, reason: null } }) }),
    'GET /carrier/loads/l1': () => ({ data: { load: fx.openLoad({ ownedByYou: false }) } }),
    'GET /carrier/my-loads': () => ({ data: fx.page([fx.myLoad()]) }),
    'GET /carrier/my-loads/m1': () => ({ data: { load: fx.myLoadDetail() } }),
    'GET /carrier/shipments': () => ({ data: fx.page([fx.shipment()]) }),
    'GET /carrier/shipments/s1': () => ({ data: { shipment: fx.shipmentDetail() } }),
    'GET /carrier/documents': () => ({ data: fx.page([fx.document()], { capabilities: { download: false, upload: false } }) }),
    'GET /carrier/documents/d1': () => ({ data: { document: { ...fx.document(), capabilities: { download: false } } } }),
    'GET /carrier/documents/d1/download': () => ({ status: 501, body: { message: 'Secure document download is not available yet.', code: 'DOWNLOAD_UNAVAILABLE' } }),
    'GET /carrier/payments': () => ({ data: fx.page([fx.payment()], { summary: { pendingCount: 1, pendingTotals: [{ currency: 'USD', amount: 180000 }] } }) }),
    'GET /carrier/notifications': () => ({ data: fx.page([fx.notification()], { unreadCount: 1 }) }),
  });

  before(async () => {
    vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
    ({ appRoutes } = await vite.ssrLoadModule('/src/routes/appRoutes.jsx'));
    ({ AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
    ({ apiClient } = await vite.ssrLoadModule('/src/services/apiClient.js'));

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
      if (url === '/auth/resend-verification') return ok({ data: { delivered: false }, message: 'Email delivery is not configured yet, so no confirmation email was sent.' });
      const handler = routes[key];
      if (handler) {
        const result = handler({ body, params: config.params });
        if (result.status && result.status >= 400) return fail(result.status, result.body);
        return ok(result, result.status ?? 200);
      }
      throw new Error(`unmocked request: ${key}`);
    };
    console.error = (...args) => errors.push(args.map(String).join(' '));
  });

  after(async () => {
    console.error = originalConsoleError;
    await vite.close();
  });

  async function visit(path, asUser = 'carrier', overrides = {}) {
    session = asUser;
    calls = [];
    routes = { ...defaults(), ...overrides };
    document.body.innerHTML = '<div id="root"></div>';
    const router = RR.createMemoryRouter(appRoutes, { initialEntries: [path] });
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
  const button = (label) => [...document.querySelectorAll('button')].find((item) => item.textContent.includes(label));
  const click = async (element) => {
    assert.ok(element, 'element to click exists');
    await act(async () => element.click());
    await tick(60);
  };
  const called = (key) => calls.filter((call) => call.key === key);
  const labelled = (label) => {
    const element = [...document.querySelectorAll('label')].find((item) => item.textContent.startsWith(label));
    assert.ok(element, `a field labelled "${label}" exists`);
    return document.getElementById(element.htmlFor);
  };
  async function fill(fields) {
    for (const [label, value] of Object.entries(fields)) {
      const input = labelled(label);
      await act(async () => {
        const prototype = input.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
        input.dispatchEvent(new dom.window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      });
    }
  }
  const submit = async (formLabel) => {
    const form = [...document.querySelectorAll('form')].find((item) => item.getAttribute('aria-label') === formLabel);
    assert.ok(form, `form "${formLabel}" exists`);
    await act(async () => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    await tick(80);
  };

  describe('routing and guards', () => {
    const pages = {
      '/carrier': 'Dashboard', '/carrier/dashboard': 'Dashboard', '/carrier/loads': 'Available loads', '/carrier/loads/l1': 'Load LD-2026-000009', '/carrier/my-loads': 'My loads',
      '/carrier/my-loads/m1': 'Load LD-2026-000001', '/carrier/shipments': 'Shipments', '/carrier/shipments/s1': 'Shipment HL-ABC123XYZ9', '/carrier/tracking': 'Tracking',
      '/carrier/documents': 'Documents', '/carrier/documents/d1': 'ratecon.pdf', '/carrier/documents/d1/download': 'Download document', '/carrier/payments': 'Payments',
      '/carrier/messages': 'Messages', '/carrier/notifications': 'Notifications', '/carrier/profile': 'My profile', '/carrier/nope': 'Page not found', '/carrier/pod': 'Page not found',
    };

    for (const [path, title] of Object.entries(pages)) {
      test(`${path} renders "${title}" inside the portal layout`, async () => {
        const page = await visit(path);
        assert.equal(h1(), title);
        assert.ok(document.querySelector('nav[aria-label="Carrier portal"]') && main());
        await page.unmount();
      });
    }

    test('every page has unique section headings (no duplicated landmarks)', async () => {
      for (const path of Object.keys(pages)) {
        const page = await visit(path);
        const headings = [...main().querySelectorAll('h2')].map((node) => node.textContent);
        assert.equal(new Set(headings).size, headings.length, `${path} repeats a heading: ${headings.join(' | ')}`);
        await page.unmount();
      }
    });

    test('/carrier/dashboard is the same dashboard as /carrier, stays put, is guarded, and highlights Dashboard', async () => {
      let page = await visit('/carrier/dashboard');
      assert.equal(page.path(), '/carrier/dashboard');
      assert.equal(h1(), 'Dashboard');
      assert.match(text(), /Available loads/);
      assert.equal(called('GET /carrier/dashboard').length, 1);
      assert.equal(document.querySelector('nav [aria-current="page"]').textContent, 'Dashboard');
      assert.equal([...document.querySelectorAll('nav a')].filter((a) => a.textContent === 'Dashboard').length, 1, 'no second nav item');
      await page.unmount();
      page = await visit('/carrier/dashboard', null);
      assert.equal(page.path(), '/login');
      await page.unmount();
      page = await visit('/carrier/dashboard', 'customer');
      assert.equal(page.path(), '/customer');
      await page.unmount();
    });

    test('guests are sent to sign in; customers go to their own portal; the super admin does not use the carrier portal', async () => {
      for (const path of ['/carrier', '/carrier/loads', '/carrier/my-loads/m1', '/carrier/documents/d1/download', '/carrier/profile']) {
        const page = await visit(path, null);
        assert.equal(page.path(), '/login', path);
        await page.unmount();
      }
      let page = await visit('/carrier/payments', 'customer');
      assert.equal(page.path(), '/customer');
      await page.unmount();
      page = await visit('/carrier/loads', 'super_admin');
      assert.equal(page.path(), '/admin');
      await page.unmount();
    });

    test('a carrier cannot open the customer portal', async () => {
      const page = await visit('/customer/shipments', 'carrier');
      assert.equal(page.path(), '/carrier');
      await page.unmount();
    });

    test('the portal never asks the API for another carrier: no request carries a carrier, user or owner id', async () => {
      const page = await visit('/carrier/my-loads/m1');
      for (const call of calls) {
        assert.ok(!/carrierId|userId|ownerId/i.test(JSON.stringify(call.params ?? {}) + JSON.stringify(call.body ?? {}) + call.key), call.key);
      }
      await page.unmount();
    });
  });

  describe('navigation', () => {
    test('the sidebar has the specified links, marks the current page, and shows the business', async () => {
      const page = await visit('/carrier/shipments');
      const nav = document.querySelector('nav[aria-label="Carrier portal"]');
      assert.deepEqual([...nav.querySelectorAll('a')].map((node) => node.textContent), ['Dashboard', 'Available Loads', 'My Loads', 'Shipments', 'Tracking', 'Documents', 'Payables', 'Payments', 'Messages', 'Notifications', 'Profile']);
      assert.equal(nav.querySelector('[aria-current="page"]').textContent, 'Shipments');
      assert.equal(nav.querySelectorAll('[aria-current="page"]').length, 1);
      assert.match(document.querySelector('aside').textContent, /Hauler Trucking/);
      assert.match(document.querySelector('header').textContent, /Kai Carrier/);
      await page.unmount();
    });

    test('detail pages keep their list highlighted (Available Loads vs My Loads stay distinct)', async () => {
      let page = await visit('/carrier/my-loads/m1');
      assert.equal(document.querySelector('nav [aria-current="page"]').textContent, 'My Loads');
      await page.unmount();
      page = await visit('/carrier/loads/l1');
      assert.equal(document.querySelector('nav [aria-current="page"]').textContent, 'Available Loads');
      await page.unmount();
    });

    test('signing out ends the session and returns to sign in', async () => {
      const page = await visit('/carrier');
      await click(button('Sign out'));
      assert.equal(page.path(), '/login');
      assert.equal(called('POST /auth/logout').length, 1);
      await page.unmount();
    });

    test('the mobile drawer opens as a dialog, Escape closes it, and focus returns to the menu button', async () => {
      const page = await visit('/carrier');
      const opener = document.querySelector('button[aria-label="Open navigation"]');
      assert.equal(opener.getAttribute('aria-expanded'), 'false');
      await click(opener);
      const dialog = document.querySelector('[role="dialog"]');
      assert.ok(dialog && dialog.getAttribute('aria-modal') === 'true');
      assert.equal(opener.getAttribute('aria-expanded'), 'true');
      assert.ok(dialog.contains(document.activeElement), 'focus moved into the drawer');
      await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      await tick();
      assert.equal(document.querySelector('[role="dialog"]'), null);
      assert.equal(document.activeElement, opener);
      await page.unmount();
    });

    test('following a link in the drawer closes it and moves focus to the page content', async () => {
      const page = await visit('/carrier');
      await click(document.querySelector('button[aria-label="Open navigation"]'));
      const link = [...document.querySelector('[role="dialog"]').querySelectorAll('a')].find((node) => node.textContent === 'Payments');
      await click(link);
      await tick();
      assert.equal(page.path(), '/carrier/payments');
      assert.equal(document.querySelector('[role="dialog"]'), null);
      assert.equal(document.activeElement, main());
      await page.unmount();
    });
  });

  describe('dashboard', () => {
    test('shows the real numbers and recent records', async () => {
      const page = await visit('/carrier');
      const stats = Object.fromEntries([...document.querySelectorAll('section[aria-label="Summary"] a')].map((card) => [card.querySelector('p').textContent, card.querySelectorAll('p')[1].textContent]));
      assert.deepEqual(stats, { 'Available loads': '5', 'My active loads': '2', 'Active shipments': '3', 'In transit': '1', Delivered: '7', 'Pending payments': '1', 'Unread notifications': '4' });
      assert.match(text(), /\$1,800\.00/);
      assert.match(text(), /LD-2026-000001/);
      assert.match(text(), /HL-ABC123XYZ9/);
      assert.match(text(), /Load assigned/);
      assert.equal(called('GET /carrier/dashboard').length, 1, 'one request');
      assert.equal(called('GET /carrier/profile').length, 1, 'profile is fetched once and shared');
      await page.unmount();
    });

    test('a carrier with nothing yet sees honest empty states and zeros', async () => {
      const page = await visit('/carrier', 'carrier', { 'GET /carrier/dashboard': () => ({ data: fx.emptyDashboard() }) });
      for (const phrase of ['No loads assigned to you yet.', 'No shipments yet.', 'No payments waiting.', 'You’re all caught up.', 'No open loads right now.']) assert.ok(text().includes(phrase), phrase);
      assert.ok(!/LD-\d/.test(text()));
      await page.unmount();
    });

    test('a carrier who is not cleared yet is told why there are no available loads', async () => {
      const page = await visit('/carrier', 'carrier', { 'GET /carrier/dashboard': () => ({ data: fx.emptyDashboard(false) }) });
      assert.match(text(), /approved/);
      await page.unmount();
    });

    test('a failed load shows a safe message with a working Try again, never raw details', async () => {
      let attempts = 0;
      const page = await visit('/carrier', 'carrier', { 'GET /carrier/dashboard': () => (++attempts === 1 ? { status: 500, body: { message: 'Something went wrong on our side. Please try again later.' } } : { data: fx.dashboard() }) });
      assert.match(document.querySelector('[role="alert"]').textContent, /Something went wrong on our side/);
      assert.ok(!/stack|mongo|ECONN/i.test(text()));
      await click(button('Try again'));
      assert.match(text(), /Available loads/);
      assert.equal(attempts, 2);
      await page.unmount();
    });

    test('a network failure shows the generic message', async () => {
      const page = await visit('/carrier', 'carrier', { 'GET /carrier/dashboard': () => { throw new Error('socket hang up at node:net:123'); } });
      assert.ok(!/socket|node:net/.test(text()));
      assert.ok(document.querySelector('[role="alert"]'));
      await page.unmount();
    });
  });

  describe('available loads', () => {
    test('lists open loads with city-level places and carrier pay only', async () => {
      const page = await visit('/carrier/loads');
      const row = document.querySelector('table tbody tr');
      assert.match(row.textContent, /LD-2026-000009/);
      assert.match(row.textContent, /Chicago, IL · US/);
      assert.match(row.textContent, /\$1,800\.00/);
      assert.ok(!/1 Main St|North Dock/.test(text()));
      await page.unmount();
    });

    test('the equipment filter sends the real enum value; an invalid value in the URL is ignored', async () => {
      let page = await visit('/carrier/loads');
      await click([...document.querySelectorAll('button[aria-pressed]')].find((node) => node.textContent === 'Reefer'));
      assert.equal(called('GET /carrier/loads').at(-1).params.equipmentType, 'Reefer');
      await page.unmount();
      page = await visit('/carrier/loads?equipmentType=hacked');
      assert.equal(called('GET /carrier/loads')[0].params.equipmentType, undefined);
      await page.unmount();
    });

    test('empty and not-yet-approved states are honest', async () => {
      let page = await visit('/carrier/loads', 'carrier', { 'GET /carrier/loads': () => ({ data: fx.page([], { eligibility: { eligible: true, reason: null } }) }) });
      assert.match(text(), /No open loads right now/);
      await page.unmount();
      page = await visit('/carrier/loads', 'carrier', { 'GET /carrier/loads': () => ({ data: fx.page([], { eligibility: { eligible: false, reason: 'Available loads are shown once your carrier account, authority and compliance have been approved.' } }) }) });
      assert.match(text(), /Available loads aren’t shown yet/);
      assert.match(text(), /have been approved/);
      await page.unmount();
    });

    test('an approved carrier with no equipment or regions is told why the board is empty', async () => {
      const hint = 'Add your equipment types and operating regions in your profile to see loads that match you.';
      const page = await visit('/carrier/loads', 'carrier', { 'GET /carrier/loads': () => ({ data: fx.page([], { eligibility: { eligible: true, reason: null, profileComplete: false, hint } }) }) });
      assert.match(text(), /Add your equipment types and operating regions/);
      await page.unmount();
    });

    test('Phase 7 load statuses (draft, carrier search, completed) read as words', async () => {
      const { LOAD_STATUS, LOAD_FILTERS } = await vite.ssrLoadModule('/src/config/customerStatuses.js');
      assert.equal(LOAD_STATUS.completed.label, 'Completed');
      assert.equal(LOAD_STATUS.carrier_search.label, 'Finding a carrier');
      assert.equal(LOAD_STATUS.draft.label, 'Draft');
      assert.ok(LOAD_FILTERS.includes('completed'));
    });

    test('detail has no street address, no book button, and says how to proceed', async () => {
      const page = await visit('/carrier/loads/l1');
      for (const phrase of ['Carrier pay', '$1,800.00', 'Machine parts', '12,000 lb']) assert.ok(text().includes(phrase), phrase);
      assert.ok(!button('Book') && !button('Accept'));
      assert.ok(!/1 Main St|North Dock/.test(text()));
      assert.match(text(), /Booking loads online is not available yet/);
      for (const forbidden of [/customer/i, /margin/i, /internal/i, /rating/i]) assert.ok(!forbidden.test(text()), String(forbidden));
      await page.unmount();
    });

    test('a load that is already yours is shown under My Loads', async () => {
      const page = await visit('/carrier/loads/m1', 'carrier', { 'GET /carrier/loads/m1': () => ({ data: { load: { ...fx.myLoadDetail(), ownedByYou: true } } }) });
      assert.equal(page.path(), '/carrier/my-loads/m1');
      await page.unmount();
    });

    test('a load you cannot see looks like any missing load', async () => {
      const page = await visit('/carrier/loads/other', 'carrier', { 'GET /carrier/loads/other': () => ({ status: 404, body: { message: 'The requested resource was not found.' } }) });
      assert.match(text(), /Load not found/);
      await page.unmount();
    });
  });

  describe('my loads', () => {
    test('lists own loads with route, status and pay; the status filter sends the real enum value', async () => {
      let page = await visit('/carrier/my-loads');
      const row = document.querySelector('table tbody tr');
      assert.match(row.textContent, /LD-2026-000001/);
      assert.match(row.textContent, /In transit/);
      assert.match(row.textContent, /Toronto, ON · CA/);
      await click([...document.querySelectorAll('button[aria-pressed]')].find((node) => node.textContent === 'Delivered'));
      assert.equal(called('GET /carrier/my-loads').at(-1).params.status, 'delivered');
      await page.unmount();
      page = await visit('/carrier/my-loads?status=hacked');
      assert.equal(called('GET /carrier/my-loads')[0].params.status, undefined);
      await page.unmount();
    });

    test('empty list explains what to do next', async () => {
      const page = await visit('/carrier/my-loads', 'carrier', { 'GET /carrier/my-loads': () => ({ data: fx.page([]) }) });
      assert.match(text(), /No loads assigned yet/);
      assert.ok([...main().querySelectorAll('a')].some((a) => a.getAttribute('href') === '/carrier/loads'));
      await page.unmount();
    });

    test('detail shows the full route, the linked shipment and authorized documents, and no customer or margin data', async () => {
      const page = await visit('/carrier/my-loads/m1');
      for (const phrase of ['1 Main St', 'Check in at gate 3', 'HL-ABC123XYZ9', 'ratecon.pdf', '$1,800.00']) assert.ok(text().includes(phrase), phrase);
      assert.ok([...main().querySelectorAll('a')].some((a) => a.getAttribute('href') === '/carrier/shipments/s1'));
      for (const forbidden of [/customer/i, /margin/i, /internal/i, /rating/i]) assert.ok(!forbidden.test(text()), String(forbidden));
      await page.unmount();
    });

    test('a load that is not yours is shown as not found', async () => {
      const page = await visit('/carrier/my-loads/other', 'carrier', { 'GET /carrier/my-loads/other': () => ({ status: 404, body: { message: 'The requested resource was not found.' } }) });
      assert.match(text(), /Load not found/);
      assert.ok(!/LD-/.test(text()));
      await page.unmount();
    });
  });

  describe('shipments and tracking', () => {
    test('lists own shipments; the empty state is honest', async () => {
      let page = await visit('/carrier/shipments');
      const row = document.querySelector('table tbody tr');
      assert.match(row.textContent, /HL-ABC123XYZ9/);
      assert.match(row.textContent, /In Transit/);
      assert.match(row.textContent, /LD-2026-000001/);
      await page.unmount();
      page = await visit('/carrier/shipments', 'carrier', { 'GET /carrier/shipments': () => ({ data: fx.page([]) }) });
      assert.match(text(), /No shipments yet/);
      await page.unmount();
    });

    test('detail has overview, border status, timeline, documents and your pay, and nothing about customers', async () => {
      const page = await visit('/carrier/shipments/s1');
      for (const phrase of ['LD-2026-000001', 'Border status', 'Pending', 'Tracking timeline', 'Detroit, MI, US', 'Border events', 'ratecon.pdf', '$1,800.00', 'REF-1', 'Windsor, ON, CA']) assert.ok(text().includes(phrase), phrase);
      for (const forbidden of [/customer/i, /margin/i, /internal/i]) assert.ok(!forbidden.test(text()), String(forbidden));
      await page.unmount();
    });

    test('tracking: found, not found, unavailable and error states use the carrier lookup', async () => {
      const found = { trackingNumber: 'HL-ABC123XYZ9', status: 'in_transit', borderStatus: 'not_applicable', isCrossBorder: false, events: [{ status: 'booked', timestamp: '2026-10-01T10:00:00.000Z', location: '' }] };
      let page = await visit('/carrier/tracking', 'carrier', { 'GET /carrier/tracking/HL-ABC123XYZ9': () => ({ data: found }) });
      await fill({ 'Tracking number': 'HL-ABC123XYZ9' });
      await submit('Track a shipment');
      assert.equal(called('GET /carrier/tracking/HL-ABC123XYZ9').length, 1);
      assert.match(text(), /Current status:\s*In Transit/);
      await page.unmount();

      page = await visit('/carrier/tracking', 'carrier', { 'GET /carrier/tracking/HL-NOPE': () => ({ status: 404, body: { message: 'No shipment was found for that tracking number.', code: 'SHIPMENT_NOT_FOUND' } }) });
      await fill({ 'Tracking number': 'HL-NOPE' });
      await submit('Track a shipment');
      assert.match(text(), /No shipment found/);
      await page.unmount();

      page = await visit('/carrier/tracking', 'carrier', { 'GET /carrier/tracking/HL-X': () => ({ status: 404, body: { message: 'The requested endpoint does not exist.' } }) });
      await fill({ 'Tracking number': 'HL-X' });
      await submit('Track a shipment');
      assert.match(text(), /Online tracking is not available yet/);
      assert.ok(!/No shipment found/.test(text()), 'a missing API is not reported as a missing shipment');
      await page.unmount();

      page = await visit('/carrier/tracking', 'carrier', { 'GET /carrier/tracking/HL-E': () => ({ status: 500, body: { message: 'Something went wrong on our side. Please try again later.' } }) });
      await fill({ 'Tracking number': 'HL-E' });
      await submit('Track a shipment');
      assert.match(document.querySelector('[role="alert"]').textContent, /Something went wrong/);
      await page.unmount();
    });

    test('tracking asks for a number and offers the carrier’s own shipments', async () => {
      const page = await visit('/carrier/tracking');
      await submit('Track a shipment');
      assert.match(text(), /Enter a tracking number\./);
      assert.ok(button('HL-ABC123XYZ9'));
      await page.unmount();
    });
  });

  describe('documents', () => {
    test('lists authorized documents, with honest notes that download and proof-of-delivery upload are unavailable', async () => {
      const page = await visit('/carrier/documents');
      assert.match(document.querySelector('table tbody tr').textContent, /ratecon\.pdf/);
      assert.match(text(), /Secure document download is not available yet/);
      assert.match(text(), /File storage is not configured yet\. Proof of delivery upload is not available/);
      assert.equal(main().querySelectorAll('input[type="file"]').length, 0, 'no upload control that pretends to work');
      assert.ok(![...main().querySelectorAll('a')].some((a) => /\/download$/.test(a.getAttribute('href') ?? '')), 'no download link while downloads are off');
      await page.unmount();
    });

    test('the empty state still explains the upload situation', async () => {
      const page = await visit('/carrier/documents', 'carrier', { 'GET /carrier/documents': () => ({ data: fx.page([], { capabilities: { download: false, upload: false } }) }) });
      assert.match(text(), /No documents yet/);
      assert.match(text(), /File storage is not configured yet\. Proof of delivery upload is not available/);
      await page.unmount();
    });

    test('detail shows metadata only, never a storage URL', async () => {
      const page = await visit('/carrier/documents/d1');
      for (const phrase of ['ratecon.pdf', 'Rate confirmation', 'application/pdf', '20 KB']) assert.ok(text().includes(phrase), phrase);
      assert.ok(!/https?:\/\//.test(text()));
      await page.unmount();
    });

    test('the download page reports "not available yet" when the server does, and "not found" for a foreign id', async () => {
      let page = await visit('/carrier/documents/d1/download');
      assert.equal(called('GET /carrier/documents/d1/download').length, 1);
      assert.match(text(), /Download is not available yet/);
      assert.ok(!/ready/i.test(text()));
      await page.unmount();
      page = await visit('/carrier/documents/zz/download', 'carrier', { 'GET /carrier/documents/zz/download': () => ({ status: 404, body: { message: 'The requested resource was not found.' } }) });
      assert.match(text(), /Document not found/);
      await page.unmount();
    });
  });

  describe('payments', () => {
    test('shows carrier payment records and a real pending summary, with no invoice or processing features', async () => {
      const page = await visit('/carrier/payments');
      const row = document.querySelector('table tbody tr');
      assert.match(row.textContent, /REF-1/);
      assert.match(row.textContent, /\$1,800\.00/);
      assert.match(row.textContent, /Pending/);
      assert.match(text(), /Amount pending/);
      assert.match(text(), /Online payment processing is not available yet/);
      assert.ok(!button('Pay') && !/invoice number|due date/i.test(text()));
      await page.unmount();
    });

    test('the status filter sends the real enum value; an empty ledger is honest', async () => {
      let page = await visit('/carrier/payments');
      await click([...document.querySelectorAll('button[aria-pressed]')].find((node) => node.textContent === 'Paid'));
      assert.equal(called('GET /carrier/payments').at(-1).params.status, 'paid');
      await page.unmount();
      page = await visit('/carrier/payments', 'carrier', { 'GET /carrier/payments': () => ({ data: fx.page([], { summary: { pendingCount: 0, pendingTotals: [] } }) }) });
      assert.match(text(), /No payments yet/);
      await page.unmount();
    });
  });

  describe('messages', () => {
    test('is an honest placeholder: no conversations, no counts, no composer, no request', async () => {
      const page = await visit('/carrier/messages');
      assert.match(text(), /Messaging isn’t available yet/);
      assert.equal(main().querySelectorAll('textarea, form').length, 0);
      assert.equal(called('GET /carrier/messages').length, 0);
      assert.ok(!/\d+ (new|unread)/i.test(text()));
      await page.unmount();
    });
  });

  describe('notifications', () => {
    test('shows read and unread state, a related link, and marks one as read through the API', async () => {
      let unread = true;
      const page = await visit('/carrier/notifications', 'carrier', {
        'GET /carrier/notifications': () => ({ data: fx.page([fx.notification({ isRead: !unread }), fx.notification({ id: 'n2', title: 'Payment sent', type: 'payment', isRead: true, relatedEntity: null })], { unreadCount: unread ? 1 : 0 }) }),
        'PATCH /carrier/notifications/n1/read': () => { unread = false; return { data: { notification: fx.notification({ isRead: true }) } }; },
      });
      assert.match(text(), /1 unread/);
      assert.ok([...main().querySelectorAll('a')].some((a) => a.getAttribute('href') === '/carrier/my-loads/m1'));
      await click(button('Mark as read'));
      assert.equal(called('PATCH /carrier/notifications/n1/read').length, 1);
      assert.match(text(), /You’re all caught up\./);
      assert.ok(!button('Mark as read'));
      await page.unmount();
    });

    test('the unread filter is sent to the API, and the empty state is friendly', async () => {
      const page = await visit('/carrier/notifications', 'carrier', { 'GET /carrier/notifications': ({ params }) => ({ data: fx.page(params?.unread ? [] : [fx.notification()], { unreadCount: 1 }) }) });
      await click([...document.querySelectorAll('button[aria-pressed]')].find((node) => node.textContent === 'Unread only'));
      assert.equal(called('GET /carrier/notifications').at(-1).params.unread, 'true');
      assert.match(text(), /No unread notifications/);
      await page.unmount();
    });

    test('a failed mark-as-read is reported and the notification stays unread', async () => {
      const page = await visit('/carrier/notifications', 'carrier', { 'PATCH /carrier/notifications/n1/read': () => ({ status: 500, body: { message: 'Something went wrong.' } }) });
      await click(button('Mark as read'));
      assert.match(text(), /could not mark that notification/);
      assert.ok(button('Mark as read'));
      await page.unmount();
    });
  });

  describe('profile', () => {
    test('shows the account, read-only authority and sign-in email, and no protected controls', async () => {
      const page = await visit('/carrier/profile');
      assert.equal(labelled('First name').value, 'Kai');
      assert.equal(labelled('Company name').value, 'Hauler Trucking');
      for (const phrase of ['MC-1234', 'DOT-5678', 'Operating authority', 'Compliance', 'k@example.com']) assert.ok(text().includes(phrase), phrase);
      const names = [...main().querySelectorAll('input, select, textarea')].map((node) => node.name);
      for (const protectedName of ['role', 'accountType', 'status', 'carrierId', 'userId', 'MCNumber', 'DOTNumber', 'mcNumber', 'dotNumber', 'authorityStatus', 'complianceStatus', 'rating', 'notes', 'isEmailVerified', 'tokenVersion', 'email']) assert.ok(!names.includes(protectedName), protectedName);
      assert.ok(!document.querySelector('input[type="email"][value="k@example.com"]'), 'the sign-in email is not an input');
      await page.unmount();
    });

    test('saving sends only allowed profile fields and updates the shared name', async () => {
      const page = await visit('/carrier/profile', 'carrier', {
        'PATCH /carrier/profile': ({ body }) => ({ data: { ...fx.profile(), account: { ...fx.profile().account, firstName: body.firstName } } }),
      });
      await fill({ 'First name': 'Rowan', 'Company name': 'Hauler Haulage Ltd', 'Operating regions': 'Midwest, Ontario' });
      await submit('Profile details');
      const request = called('PATCH /carrier/profile')[0];
      assert.equal(request.body.firstName, 'Rowan');
      assert.equal(request.body.companyName, 'Hauler Haulage Ltd');
      assert.deepEqual(request.body.operatingRegions, ['Midwest', 'Ontario']);
      assert.deepEqual(request.body.equipmentTypes, ['Dry Van']);
      assert.equal(request.body.crossBorderCapability, true);
      const allowed = ['firstName', 'lastName', 'phone', 'companyName', 'contactPerson', 'businessEmail', 'address', 'equipmentTypes', 'operatingRegions', 'crossBorderCapability'];
      assert.deepEqual(Object.keys(request.body).filter((key) => !allowed.includes(key)), []);
      assert.match(text(), /Your profile was updated\./);
      assert.match(document.querySelector('header').textContent, /Rowan Carrier/);
      await page.unmount();
    });

    test('validation blocks an empty name; a server field error is shown next to its field', async () => {
      let page = await visit('/carrier/profile');
      await fill({ 'First name': '   ' });
      await submit('Profile details');
      assert.equal(called('PATCH /carrier/profile').length, 0);
      assert.equal(labelled('First name').getAttribute('aria-invalid'), 'true');
      await page.unmount();

      page = await visit('/carrier/profile', 'carrier', { 'PATCH /carrier/profile': () => ({ status: 422, body: { message: 'Please correct the highlighted fields.', errors: [{ field: 'phone', message: 'Enter a valid phone number.' }] } }) });
      await submit('Profile details');
      assert.equal(labelled('Phone').getAttribute('aria-invalid'), 'true');
      await page.unmount();
    });

    test('change password: checks the confirmation locally, then posts to the carrier endpoint and clears the fields', async () => {
      const page = await visit('/carrier/profile', 'carrier', { 'POST /carrier/profile/password': () => ({ message: 'Your password was changed. Other devices have been signed out.', data: {} }) });
      await fill({ 'Current password': 'old-pass-phrase-1', 'New password': 'brand-new-pass-phrase-4', 'Confirm new password': 'mismatch-pass-phrase-5' });
      await submit('Change password');
      assert.equal(called('POST /carrier/profile/password').length, 0);
      assert.match(text(), /Passwords do not match\./);
      await fill({ 'Confirm new password': 'brand-new-pass-phrase-4' });
      await submit('Change password');
      assert.deepEqual(called('POST /carrier/profile/password')[0].body, { currentPassword: 'old-pass-phrase-1', password: 'brand-new-pass-phrase-4', passwordConfirmation: 'brand-new-pass-phrase-4' });
      assert.equal(called('POST /customer/profile/password').length, 0, 'the customer endpoint is never used');
      assert.match(text(), /Other devices have been signed out/);
      assert.equal(labelled('Current password').value, '');
      await page.unmount();
    });

    test('change password: a wrong current password is reported on that field', async () => {
      const page = await visit('/carrier/profile', 'carrier', { 'POST /carrier/profile/password': () => ({ status: 422, body: { message: 'Please correct the highlighted fields.', errors: [{ field: 'currentPassword', message: 'Your current password is incorrect.' }] } }) });
      await fill({ 'Current password': 'wrong-pass-phrase-1', 'New password': 'brand-new-pass-phrase-4', 'Confirm new password': 'brand-new-pass-phrase-4' });
      await submit('Change password');
      assert.equal(labelled('Current password').getAttribute('aria-invalid'), 'true');
      assert.match(text(), /current password is incorrect/);
      await page.unmount();
    });
  });

  describe('security hygiene', () => {
    test('no token or session data is written to browser storage', async () => {
      const page = await visit('/carrier/profile');
      assert.equal(window.localStorage.length + window.sessionStorage.length, 0);
      await page.unmount();
    });

    test('carrier sources never send or read a carrier id, and never touch storage or Authorization', () => {
      const files = ['src/services/carrierService.js', 'src/components/forms/CarrierProfileForm.jsx', 'src/components/carrier/CarrierProfileContext.jsx', 'src/layouts/CarrierLayout.jsx',
        ...readdirSync(`${ROOT}src/pages/carrier`).map((name) => `src/pages/carrier/${name}`)];
      for (const file of files) {
        const source = readFileSync(`${ROOT}${file}`, 'utf8');
        assert.ok(!/carrierId|brokerMargin|customerRate|internalNotes/.test(source), `${file} mentions an ownership or internal field`);
        assert.ok(!/localStorage|sessionStorage|Authorization|dangerouslySetInnerHTML/.test(source), `${file} touches storage, Authorization or raw HTML`);
      }
    });

    test('no React errors or warnings were logged during the whole run', () => {
      assert.deepEqual(errors, []);
    });
  });
});
