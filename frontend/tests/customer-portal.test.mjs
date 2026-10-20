/**
 * Phase 5 customer portal, rendered in jsdom against a mocked API (the mocks live only in this file).
 * Covers routing and guards, navigation and the mobile drawer, and every customer page's loading / data / empty / error
 * states, the quote request, tracking, notifications and profile flows. Run with: npm test
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
  carrier: { id: 'u2', firstName: 'Kai', lastName: 'Carrier', fullName: 'Kai Carrier', email: 'k@example.com', role: 'carrier' },
};

const origin = { city: 'Chicago', state: 'IL', zipCode: '60601', country: 'US' };
const destination = { city: 'Toronto', state: 'ON', country: 'CA' };
const fx = {
  profile: () => ({
    account: { firstName: 'Casey', lastName: 'Customer', email: 'casey@example.com', phone: '312-555-0100', isEmailVerified: false, lastLogin: '2026-10-01T12:00:00.000Z', memberSince: '2026-09-01T12:00:00.000Z' },
    company: { companyName: 'Acme Freight', contactPerson: 'Dispatch', businessEmail: null, phone: null, address: null, billing: null, status: 'active' },
  }),
  quote: (extra = {}) => ({ id: 'q1', quoteNumber: 'QT-2026-000001', status: 'quoted', origin, destination, pickupDate: '2026-12-01T00:00:00.000Z', deliveryDate: null, equipmentType: 'Dry Van', shipmentType: 'FTL', commodity: 'Machine parts', isCrossBorder: true, rate: { amount: 245000, currency: 'USD' }, createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-02T12:00:00.000Z', weight: { value: 12000, unit: 'lb' }, quantity: 4, pallets: 2, dimensions: null, temperatureRequirements: null, customsStatus: 'not_started', borderCrossing: null, specialInstructions: 'Dock appointment required', contactInformation: { name: 'Casey', email: 'casey@example.com', phone: '312-555-0100' }, shipment: null, ...extra }),
  shipment: (extra = {}) => ({ id: 's1', trackingNumber: 'HL-ABC123XYZ9', status: 'in_transit', loadNumber: 'LD-2026-000001', origin, destination, equipmentType: 'Dry Van', commodity: 'Machine parts', isCrossBorder: true, estimatedPickup: null, estimatedDelivery: '2026-12-05T12:00:00.000Z', actualDelivery: null, currentLocation: { city: 'Detroit', state: 'MI', country: 'US' }, createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-02T12:00:00.000Z', ...extra }),
  shipmentDetail: () => ({ ...fx.shipment(), weight: { value: 12000, unit: 'lb' }, pickupWindow: null, deliveryWindow: null, pickupAppointment: null, deliveryAppointment: null, specialInstructions: null, actualPickup: null, borderStatus: 'pending', exception: null, charge: { amount: 245000, currency: 'USD' }, events: [{ status: 'booked', timestamp: '2026-10-01T10:00:00.000Z', location: '' }, { status: 'in_transit', timestamp: '2026-10-02T10:00:00.000Z', location: 'Detroit, MI, US' }], documents: [{ id: 'd1', name: 'bol.pdf', type: 'BOL', createdAt: '2026-10-02T10:00:00.000Z' }], payments: [{ id: 'p1', reference: 'REF-1', amount: 245000, currency: 'USD', status: 'pending', paidAt: null, recordedAt: '2026-10-02T10:00:00.000Z' }] }),
  document: (extra = {}) => ({ id: 'd1', name: 'bol.pdf', type: 'BOL', mimeType: 'application/pdf', fileSize: 20480, relatedEntityType: 'shipment', relatedEntityId: 's1', relatedLabel: 'HL-ABC123XYZ9', createdAt: '2026-10-02T10:00:00.000Z', ...extra }),
  invoice: (extra = {}) => ({ id: 'p1', reference: 'REF-1', loadNumber: 'LD-2026-000001', amount: 245000, currency: 'USD', status: 'pending', paidAt: null, recordedAt: '2026-10-02T10:00:00.000Z', ...extra }),
  notification: (extra = {}) => ({ id: 'n1', type: 'shipment', title: 'Shipment picked up', message: 'Your freight is on its way.', isRead: false, relatedEntity: { entityType: 'shipment', entityId: 's1' }, createdAt: '2026-10-02T10:00:00.000Z', ...extra }),
  page: (items, extra = {}) => ({ items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 }, ...extra }),
  dashboard: () => ({
    stats: { activeShipments: 3, pendingQuotes: 2, inTransit: 1, delivered: 7, outstandingInvoices: { count: 1, totals: [{ currency: 'USD', amount: 245000 }] }, unreadNotifications: 4 },
    recentQuotes: [fx.quote()], recentShipments: [fx.shipment()], recentNotifications: [fx.notification()],
    recentActivity: [{ kind: 'quote', title: 'Quote request QT-2026-000001 is quoted', entityId: 'q1', at: '2026-10-02T12:00:00.000Z' }],
  }),
  emptyDashboard: () => ({ stats: { activeShipments: 0, pendingQuotes: 0, inTransit: 0, delivered: 0, outstandingInvoices: { count: 0, totals: [] }, unreadNotifications: 0 }, recentQuotes: [], recentShipments: [], recentNotifications: [], recentActivity: [] }),
};

describe('Phase 5 customer portal', () => {
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
    'GET /customer/profile': () => ({ data: fx.profile() }),
    'GET /customer/dashboard': () => ({ data: fx.dashboard() }),
    'GET /customer/quotes': () => ({ data: fx.page([fx.quote()]) }),
    'GET /customer/quotes/q1': () => ({ data: { quote: fx.quote() } }),
    'GET /customer/shipments': () => ({ data: fx.page([fx.shipment()]) }),
    'GET /customer/shipments/s1': () => ({ data: { shipment: fx.shipmentDetail() } }),
    'GET /customer/documents': () => ({ data: fx.page([fx.document()], { capabilities: { download: false, upload: false } }) }),
    'GET /customer/invoices': () => ({ data: fx.page([fx.invoice()], { summary: { outstandingCount: 1, outstandingTotals: [{ currency: 'USD', amount: 245000 }] } }) }),
    'GET /customer/notifications': () => ({ data: fx.page([fx.notification()], { unreadCount: 1 }) }),
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

  async function visit(path, asUser = 'customer', overrides = {}) {
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
      '/customer': 'Dashboard', '/customer/dashboard': 'Dashboard', '/customer/quotes': 'My quotes', '/customer/quotes/new': 'Request a quote', '/customer/quotes/q1': 'Quote QT-2026-000001',
      '/customer/shipments': 'My shipments', '/customer/shipments/s1': 'Shipment HL-ABC123XYZ9', '/customer/tracking': 'Tracking', '/customer/documents': 'Documents', '/customer/invoices': 'Invoices',
      '/customer/messages': 'Messages', '/customer/notifications': 'Notifications', '/customer/profile': 'My profile', '/customer/nope': 'Page not found',
    };

    for (const [path, title] of Object.entries(pages)) {
      test(`${path} renders "${title}" inside the portal layout`, async () => {
        const page = await visit(path);
        assert.equal(h1(), title);
        assert.ok(document.querySelector('nav[aria-label="Customer portal"]') && main());
        await page.unmount();
      });
    }

    test('/customer/dashboard is the same dashboard as /customer, stays put, is guarded, and highlights Dashboard', async () => {
      let page = await visit('/customer/dashboard');
      assert.equal(page.path(), '/customer/dashboard');
      assert.equal(h1(), 'Dashboard');
      assert.match(text(), /Active shipments/);
      assert.equal(called('GET /customer/dashboard').length, 1);
      assert.equal(document.querySelector('nav [aria-current="page"]').textContent, 'Dashboard');
      assert.deepEqual([...document.querySelectorAll('nav a')].filter((a) => a.textContent === 'Dashboard').length, 1, 'no second nav item');
      await page.unmount();
      page = await visit('/customer/dashboard', null);
      assert.equal(page.path(), '/login');
      await page.unmount();
      page = await visit('/customer/dashboard', 'carrier');
      assert.equal(page.path(), '/carrier');
      await page.unmount();
    });

    test('guests are sent to sign in, and other roles to their own portal', async () => {
      for (const path of ['/customer', '/customer/quotes/new', '/customer/shipments/s1', '/customer/profile']) {
        const page = await visit(path, null);
        assert.equal(page.path(), '/login', path);
        await page.unmount();
      }
      const page = await visit('/customer/invoices', 'carrier');
      assert.equal(page.path(), '/carrier');
      await page.unmount();
    });

    test('the portal never asks the API for another customer: no request carries a customer id', async () => {
      const page = await visit('/customer/quotes/q1');
      for (const call of calls) {
        assert.ok(!/customerId/i.test(JSON.stringify(call.params ?? {}) + JSON.stringify(call.body ?? {}) + call.key), call.key);
      }
      await page.unmount();
    });
  });

  describe('navigation', () => {
    test('the sidebar has the specified groups and links, marks the current page, and shows the business', async () => {
      const page = await visit('/customer/shipments');
      const nav = document.querySelector('nav[aria-label="Customer portal"]');
      assert.deepEqual([...nav.querySelectorAll('h2')].map((node) => node.textContent), ['Main', 'Documents & Billing', 'Communication', 'Account']);
      assert.deepEqual([...nav.querySelectorAll('a')].map((node) => node.textContent), ['Dashboard', 'Request a Quote', 'My Quotes', 'My Shipments', 'Tracking', 'Documents', 'Billing', 'Invoices', 'Messages', 'Notifications', 'Profile']);
      assert.equal(nav.querySelector('[aria-current="page"]').textContent, 'My Shipments');
      assert.equal(nav.querySelectorAll('[aria-current="page"]').length, 1);
      assert.match(document.querySelector('aside').textContent, /Acme Freight/);
      assert.match(document.querySelector('header').textContent, /Casey Customer/);
      await page.unmount();
    });

    test('"My Quotes" is not current on the Request a Quote page, but is on a quote detail page', async () => {
      let page = await visit('/customer/quotes/new');
      assert.equal(document.querySelector('nav [aria-current="page"]').textContent, 'Request a Quote');
      await page.unmount();
      page = await visit('/customer/quotes/q1');
      assert.equal(document.querySelector('nav [aria-current="page"]').textContent, 'My Quotes');
      await page.unmount();
    });

    test('signing out ends the session and returns to sign in', async () => {
      const page = await visit('/customer');
      await click(button('Sign out'));
      assert.equal(page.path(), '/login');
      assert.equal(called('POST /auth/logout').length, 1);
      await page.unmount();
    });

    test('the mobile drawer opens as a dialog, Escape closes it, and focus returns to the menu button', async () => {
      const page = await visit('/customer');
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
      assert.equal(document.activeElement, opener, 'focus returned to the button that opened it');
      await page.unmount();
    });

    test('following a link in the drawer closes it and moves focus to the page content', async () => {
      const page = await visit('/customer');
      await click(document.querySelector('button[aria-label="Open navigation"]'));
      const link = [...document.querySelector('[role="dialog"]').querySelectorAll('a')].find((node) => node.textContent === 'Invoices');
      await click(link);
      await tick();
      assert.equal(page.path(), '/customer/invoices');
      assert.equal(document.querySelector('[role="dialog"]'), null);
      assert.equal(document.activeElement, main());
      await page.unmount();
    });
  });

  describe('dashboard', () => {
    test('shows the real numbers and recent records', async () => {
      const page = await visit('/customer');
      const stats = Object.fromEntries([...document.querySelectorAll('section[aria-label="Summary"] a')].map((card) => [card.querySelector('p').textContent, card.querySelectorAll('p')[1].textContent]));
      assert.deepEqual(stats, { 'Active shipments': '3', 'Pending quotes': '2', 'In transit': '1', Delivered: '7', 'Outstanding invoices': '1', 'Unread notifications': '4' });
      assert.match(text(), /\$2,450\.00/);
      assert.match(text(), /QT-2026-000001/);
      assert.match(text(), /HL-ABC123XYZ9/);
      assert.match(text(), /Shipment picked up/);
      assert.equal(called('GET /customer/dashboard').length, 1, 'one request');
      assert.equal(called('GET /customer/profile').length, 1, 'profile is fetched once and shared');
      await page.unmount();
    });

    test('a customer with nothing yet sees honest empty states and zeros', async () => {
      const page = await visit('/customer', 'customer', { 'GET /customer/dashboard': () => ({ data: fx.emptyDashboard() }) });
      for (const phrase of ['No active shipments yet.', 'No quote requests yet.', 'No invoices available.', 'You’re all caught up.']) assert.ok(text().includes(phrase), phrase);
      assert.ok(!/QT-\d/.test(text()));
      await page.unmount();
    });

    test('a failed load shows a safe message with a working Try again, never raw details', async () => {
      let attempts = 0;
      const page = await visit('/customer', 'customer', { 'GET /customer/dashboard': () => (++attempts === 1 ? { status: 500, body: { message: 'Something went wrong on our side. Please try again later.' } } : { data: fx.dashboard() }) });
      assert.match(document.querySelector('[role="alert"]').textContent, /Something went wrong on our side/);
      assert.ok(!/stack|mongo|ECONN/i.test(text()));
      await click(button('Try again'));
      assert.match(text(), /Active shipments/);
      assert.equal(attempts, 2);
      await page.unmount();
    });

    test('a network failure shows the generic message', async () => {
      const page = await visit('/customer', 'customer', { 'GET /customer/dashboard': () => { throw new Error('socket hang up at node:net:123'); } });
      assert.ok(!/socket|node:net/.test(text()));
      assert.ok(document.querySelector('[role="alert"]'));
      await page.unmount();
    });
  });

  describe('quotes', () => {
    test('lists own quotes with the real status, route and rate', async () => {
      const page = await visit('/customer/quotes');
      const row = document.querySelector('table tbody tr');
      assert.match(row.textContent, /QT-2026-000001/);
      assert.match(row.textContent, /Chicago, IL · US → Toronto, ON · CA/);
      assert.match(row.textContent, /Quoted/);
      assert.match(row.textContent, /\$2,450\.00/);
      assert.match(row.textContent, /Dry Van/);
      assert.ok(document.querySelector('table caption'));
      assert.ok([...document.querySelectorAll('table th')].every((th) => th.getAttribute('scope')));
      await page.unmount();
    });

    test('filtering by status sends the real enum value; an invalid status in the URL is ignored', async () => {
      let page = await visit('/customer/quotes');
      await click([...document.querySelectorAll('button[aria-pressed]')].find((node) => node.textContent === 'Quoted'));
      assert.equal(called('GET /customer/quotes').at(-1).params.status, 'quoted');
      await page.unmount();
      page = await visit('/customer/quotes?status=hacked');
      assert.equal(called('GET /customer/quotes')[0].params.status, undefined);
      await page.unmount();
    });

    test('empty list explains what to do next', async () => {
      const page = await visit('/customer/quotes', 'customer', { 'GET /customer/quotes': () => ({ data: fx.page([]) }) });
      assert.match(text(), /No quote requests yet/);
      assert.ok([...main().querySelectorAll('a')].some((a) => a.getAttribute('href') === '/customer/quotes/new'));
      await page.unmount();
    });

    test('detail shows customer-safe fields only and offers contact, not a fake accept button', async () => {
      const page = await visit('/customer/quotes/q1');
      for (const phrase of ['Quoted rate', '$2,450.00', 'Machine parts', '12,000 lb', 'Dock appointment required']) assert.ok(text().includes(phrase), phrase);
      for (const forbidden of [/carrier/i, /margin/i, /internal/i, /estimated rate/i, /rating/i]) assert.ok(!forbidden.test(text()), String(forbidden));
      assert.ok(!button('Accept') && !button('Decline'));
      assert.ok(text().includes('Contact our team about this quote'));
      await page.unmount();
    });

    test('a sent quote can be accepted: one request with no body fields, then the page reloads the server state', async () => {
      let accepted = false;
      const page = await visit('/customer/quotes/q1', 'customer', {
        'GET /customer/quotes/q1': () => ({ data: { quote: fx.quote(accepted ? { status: 'customer_accepted', canRespond: false, acceptedAt: '2026-10-03T12:00:00.000Z' } : { canRespond: true, quoteExpiresAt: '2026-10-09T12:00:00.000Z' }) } }),
        'POST /customer/quotes/q1/accept': () => { accepted = true; return { data: { quote: fx.quote({ status: 'customer_accepted' }) } }; },
      });
      assert.ok(button('Accept this quote') && button('Decline'));
      assert.ok(text().includes('Valid until'));
      await click(button('Accept this quote'));
      assert.equal(called('POST /customer/quotes/q1/accept').length, 1);
      assert.deepEqual(called('POST /customer/quotes/q1/accept')[0].body, {});
      assert.ok(!button('Accept this quote'), 'the buttons are gone once the server says accepted');
      assert.match(text(), /You accepted this quote/);
      await page.unmount();
    });

    test('declining asks for confirmation first and sends nothing until confirmed', async () => {
      const page = await visit('/customer/quotes/q1', 'customer', {
        'GET /customer/quotes/q1': () => ({ data: { quote: fx.quote({ canRespond: true }) } }),
        'POST /customer/quotes/q1/decline': () => ({ data: { quote: fx.quote({ status: 'declined', canRespond: false }) } }),
      });
      await click(button('Decline'));
      assert.match(text(), /Decline this quote\?/);
      assert.equal(called('POST /customer/quotes/q1/decline').length, 0);
      await click(button('Keep this quote'));
      assert.ok(button('Accept this quote'));
      assert.equal(called('POST /customer/quotes/q1/decline').length, 0);
      await click(button('Decline'));
      await click(button('Yes, decline'));
      assert.equal(called('POST /customer/quotes/q1/decline').length, 1);
      await page.unmount();
    });

    test('a refused answer (for example an expired quote) shows the server message', async () => {
      const page = await visit('/customer/quotes/q1', 'customer', {
        'GET /customer/quotes/q1': () => ({ data: { quote: fx.quote({ canRespond: true }) } }),
        'POST /customer/quotes/q1/accept': () => ({ status: 409, body: { message: 'This quote has expired. Please request a new quote.', code: 'QUOTE_EXPIRED' } }),
      });
      await click(button('Accept this quote'));
      assert.match(document.querySelector('[role="alert"]')?.textContent ?? '', /has expired/);
      await page.unmount();
    });

    test('quotes still being priced show no rate, and every Phase 7 status has a label and plain-language help', async () => {
      for (const [status, label, help] of [['pricing', 'Pricing', /preparing your rate/], ['customer_accepted', 'Accepted', /arranging your freight/], ['converted_to_load', 'Being arranged', /being arranged/], ['expired', 'Expired', /expired/]]) {
        const page = await visit('/customer/quotes/q1', 'customer', { 'GET /customer/quotes/q1': () => ({ data: { quote: fx.quote({ status, rate: status === 'pricing' ? null : fx.quote().rate }) } }) });
        assert.ok(text().includes(label), label);
        assert.match(text(), help);
        if (status === 'pricing') assert.match(text(), /Not quoted yet/);
        assert.ok(!button('Accept this quote'));
        await page.unmount();
      }
    });

    test('a completed shipment reads "Completed" and finishes the Delivered step', async () => {
      const page = await visit('/customer/shipments/s1', 'customer', { 'GET /customer/shipments/s1': () => ({ data: { shipment: { ...fx.shipmentDetail(), status: 'completed' } } }) });
      assert.match(text(), /Completed/);
      assert.equal(document.querySelector('[aria-label="Shipment progress"] [aria-current="step"]')?.textContent.replace(/\s*\(current\)/, '').trim().replace(/^\d+/, ''), 'Delivered');
      await page.unmount();
    });

    test('a quote that is not yours looks like any missing quote', async () => {
      const page = await visit('/customer/quotes/other', 'customer', { 'GET /customer/quotes/other': () => ({ status: 404, body: { message: 'The requested resource was not found.' } }) });
      assert.match(text(), /Quote not found/);
      assert.ok(!/QT-/.test(text()));
      await page.unmount();
    });

    describe('request a quote', () => {
      const fillValid = {
        City: 'Chicago', 'Pickup date': '2099-01-10', Commodity: 'Packaged goods', Weight: '8000', 'Equipment type': 'Dry Van',
      };

      test('contact details start from the profile', async () => {
        const page = await visit('/customer/quotes/new');
        assert.equal(labelled('Name').value, 'Casey Customer');
        assert.equal(labelled('Email').value, 'casey@example.com');
        assert.equal(labelled('Phone').value, '312-555-0100');
        await page.unmount();
      });

      test('required fields are validated, linked to their messages, and nothing is sent', async () => {
        const page = await visit('/customer/quotes/new');
        await submit('Request a quote');
        assert.equal(called('POST /customer/quotes').length, 0);
        const invalid = [...document.querySelectorAll('[aria-invalid="true"]')];
        assert.ok(invalid.length >= 5);
        for (const field of invalid) {
          const ids = field.getAttribute('aria-describedby').split(' ');
          assert.ok(document.getElementById(ids.at(-1)).textContent.length > 0, 'the last described-by id is the error message');
        }
        assert.equal(document.activeElement, invalid[0], 'focus moves to the first invalid field');
        await page.unmount();
      });

      test('submits structured freight details and never a customer id, role or status', async () => {
        const page = await visit('/customer/quotes/new', 'customer', {
          'POST /customer/quotes': () => ({ status: 201, data: { quote: fx.quote({ id: 'q9', quoteNumber: 'QT-2026-000042', status: 'new' }) } }),
        });
        const cities = [...document.querySelectorAll('input[name$=".city"]')];
        const set = async (input, value) => act(async () => {
          Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
          input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        });
        await set(cities[0], 'Chicago');
        await set(cities[1], 'Dallas');
        await fill({ 'Pickup date': '2099-01-10', Commodity: 'Packaged goods', Weight: '8000', 'Equipment type': 'Dry Van' });
        await submit('Request a quote');
        const request = called('POST /customer/quotes')[0];
        assert.ok(request, 'the quote was sent');
        assert.equal(request.body.origin.city, 'Chicago');
        assert.equal(request.body.destination.city, 'Dallas');
        assert.deepEqual(request.body.weight, { value: 8000, unit: 'lb' });
        assert.equal(request.body.equipmentType, 'Dry Van');
        assert.deepEqual(request.body.contactInformation, { name: 'Casey Customer', email: 'casey@example.com', phone: '312-555-0100' });
        assert.deepEqual(Object.keys(request.body).filter((key) => /customer|role|status|rate|notes/i.test(key)), []);
        assert.match(text(), /QT-2026-000042/);
        assert.ok([...main().querySelectorAll('a')].some((a) => a.getAttribute('href') === '/customer/quotes/q9'));
        await page.unmount();
      });

      test('a server field error appears next to its field and the form stays editable', async () => {
        const page = await visit('/customer/quotes/new', 'customer', {
          'POST /customer/quotes': () => ({ status: 422, body: { message: 'Please correct the highlighted fields.', errors: [{ field: 'pickupDate', message: 'Pickup date cannot be in the past.' }] } }),
        });
        const cities = [...document.querySelectorAll('input[name$=".city"]')];
        for (const [input, value] of [[cities[0], 'Chicago'], [cities[1], 'Dallas']]) {
          await act(async () => {
            Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
            input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
          });
        }
        await fill({ 'Pickup date': '2099-01-10', Commodity: 'Goods', Weight: '10', 'Equipment type': 'Dry Van' });
        await submit('Request a quote');
        const field = document.querySelector('input[name="pickupDate"]');
        assert.equal(field.getAttribute('aria-invalid'), 'true');
        assert.match(document.getElementById(field.getAttribute('aria-describedby').split(' ').at(-1)).textContent, /cannot be in the past/);
        await page.unmount();
      });

      test('Canada to Mexico is refused before sending', async () => {
        const page = await visit('/customer/quotes/new');
        await fill({ ...fillValid, City: 'x' });
        const countries = [...document.querySelectorAll('select[name$=".country"]')];
        for (const [select, value] of [[countries[0], 'CA'], [countries[1], 'MX']]) {
          await act(async () => {
            Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set.call(select, value);
            select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
          });
        }
        await submit('Request a quote');
        assert.match(text(), /between the US and Canada, or the US and Mexico/);
        assert.equal(called('POST /customer/quotes').length, 0);
        await page.unmount();
      });
    });
  });

  describe('shipments and tracking', () => {
    test('lists own shipments; the empty state is honest', async () => {
      let page = await visit('/customer/shipments');
      const row = document.querySelector('table tbody tr');
      assert.match(row.textContent, /HL-ABC123XYZ9/);
      assert.match(row.textContent, /In Transit/);
      assert.match(row.textContent, /Chicago, IL · US/);
      await page.unmount();
      page = await visit('/customer/shipments', 'customer', { 'GET /customer/shipments': () => ({ data: fx.page([]) }) });
      assert.match(text(), /No shipments yet/);
      await page.unmount();
    });

    test('detail has overview, a real timeline, documents and charges, and nothing about carriers', async () => {
      const page = await visit('/customer/shipments/s1');
      for (const phrase of ['LD-2026-000001', 'Tracking timeline', 'History', 'Detroit, MI, US', 'bol.pdf', '$2,450.00', 'REF-1']) assert.ok(text().includes(phrase), phrase);
      for (const forbidden of [/carrier(?! )/i, /margin/i, /internal/i]) assert.ok(!forbidden.test(text().replace(/Carrier portal/g, '')), String(forbidden));
      await page.unmount();
    });

    test('tracking: found, not found, unavailable and error states use the customer lookup', async () => {
      const found = { trackingNumber: 'HL-ABC123XYZ9', status: 'in_transit', isCrossBorder: false, events: [{ status: 'booked', timestamp: '2026-10-01T10:00:00.000Z', location: '' }] };
      let page = await visit('/customer/tracking', 'customer', { 'GET /customer/tracking/HL-ABC123XYZ9': () => ({ data: found }) });
      await fill({ 'Tracking number': 'HL-ABC123XYZ9' });
      await submit('Track a shipment');
      assert.equal(called('GET /customer/tracking/HL-ABC123XYZ9').length, 1);
      assert.match(text(), /Current status:\s*In Transit/);
      await page.unmount();

      page = await visit('/customer/tracking', 'customer', { 'GET /customer/tracking/HL-NOPE': () => ({ status: 404, body: { message: 'No shipment was found for that tracking number.', code: 'SHIPMENT_NOT_FOUND' } }) });
      await fill({ 'Tracking number': 'HL-NOPE' });
      await submit('Track a shipment');
      assert.match(text(), /No shipment found/);
      await page.unmount();

      page = await visit('/customer/tracking', 'customer', { 'GET /customer/tracking/HL-X': () => ({ status: 404, body: { message: 'The requested endpoint does not exist.' } }) });
      await fill({ 'Tracking number': 'HL-X' });
      await submit('Track a shipment');
      assert.match(text(), /Online tracking is not available yet/);
      assert.ok(!/No shipment found/.test(text()), 'a missing API is not reported as a missing shipment');
      await page.unmount();

      page = await visit('/customer/tracking', 'customer', { 'GET /customer/tracking/HL-E': () => ({ status: 500, body: { message: 'Something went wrong on our side. Please try again later.' } }) });
      await fill({ 'Tracking number': 'HL-E' });
      await submit('Track a shipment');
      assert.match(document.querySelector('[role="alert"]').textContent, /Something went wrong/);
      await page.unmount();
    });

    test('tracking asks for a number and offers the customer’s own shipments', async () => {
      const page = await visit('/customer/tracking');
      await submit('Track a shipment');
      assert.match(text(), /Enter a tracking number\./);
      assert.ok(button('HL-ABC123XYZ9'));
      await page.unmount();
    });
  });

  describe('documents, invoices and messages', () => {
    test('documents: list, no storage details, and an honest note while downloads are unavailable', async () => {
      const page = await visit('/customer/documents');
      assert.match(text(), /bol\.pdf/);
      assert.match(text(), /Bill of lading/);
      assert.match(text(), /Secure document download is not available yet/);
      assert.ok(!button('Download'), 'no download button while the server reports it unavailable');
      assert.ok(![...main().querySelectorAll('a')].some((a) => /^https?:/.test(a.getAttribute('href') ?? '')), 'no direct file links');
      await page.unmount();
    });

    test('documents: with downloads available the button asks the server, which re-checks ownership', async () => {
      const page = await visit('/customer/documents', 'customer', {
        'GET /customer/documents': () => ({ data: fx.page([fx.document()], { capabilities: { download: true, upload: false } }) }),
        'GET /customer/documents/d1/download': () => ({ data: {} }),
      });
      await click(button('Download'));
      assert.equal(called('GET /customer/documents/d1/download').length, 1);
      await page.unmount();
    });

    test('documents: empty and unauthorized states', async () => {
      let page = await visit('/customer/documents', 'customer', { 'GET /customer/documents': () => ({ data: fx.page([], { capabilities: { download: false, upload: false } }) }) });
      assert.match(text(), /No documents yet/);
      await page.unmount();
      page = await visit('/customer/documents', 'customer', { 'GET /customer/documents': () => ({ status: 403, body: { message: 'You do not have permission to perform this action.' } }) });
      assert.match(document.querySelector('[role="alert"]').textContent, /do not have permission/);
      await page.unmount();
    });

    test('invoices: list with real amounts and statuses, no invented invoice fields, empty state', async () => {
      let page = await visit('/customer/invoices');
      assert.match(text(), /REF-1/);
      assert.match(text(), /\$2,450\.00/);
      assert.match(text(), /Pending/);
      assert.ok(!/Due date|Invoice #|Issued/i.test(text()));
      assert.match(text(), /Online payment is not available yet/);
      await page.unmount();
      page = await visit('/customer/invoices', 'customer', { 'GET /customer/invoices': () => ({ data: fx.page([], { summary: { outstandingCount: 0, outstandingTotals: [] } }) }) });
      assert.match(text(), /No invoices available/);
      await page.unmount();
    });

    test('messages: an honest state, with no composer and no fake threads', async () => {
      const page = await visit('/customer/messages');
      assert.match(text(), /Messaging will be available when your shipment is being coordinated\./);
      assert.equal(main().querySelectorAll('textarea, input[type="text"]').length, 0);
      await page.unmount();
    });
  });

  describe('notifications', () => {
    test('shows read and unread state, a related link, and marks one as read through the API', async () => {
      let unread = true;
      const page = await visit('/customer/notifications', 'customer', {
        'GET /customer/notifications': () => ({ data: fx.page([fx.notification({ isRead: !unread }), fx.notification({ id: 'n2', title: 'Quote ready', isRead: true, relatedEntity: null })], { unreadCount: unread ? 1 : 0 }) }),
        'PATCH /customer/notifications/n1/read': () => { unread = false; return { data: { notification: fx.notification({ isRead: true }) } }; },
      });
      assert.match(text(), /1 unread/);
      assert.ok([...main().querySelectorAll('a')].some((a) => a.getAttribute('href') === '/customer/shipments/s1'));
      await click(button('Mark as read'));
      assert.equal(called('PATCH /customer/notifications/n1/read').length, 1);
      assert.match(text(), /You’re all caught up\./);
      assert.ok(!button('Mark as read'));
      await page.unmount();
    });

    test('the unread filter is sent to the API, and the empty state is friendly', async () => {
      const page = await visit('/customer/notifications', 'customer', { 'GET /customer/notifications': ({ params }) => ({ data: fx.page(params?.unread ? [] : [fx.notification()], { unreadCount: 1 }) }) });
      await click([...document.querySelectorAll('button[aria-pressed]')].find((node) => node.textContent === 'Unread only'));
      assert.equal(called('GET /customer/notifications').at(-1).params.unread, 'true');
      assert.match(text(), /No unread notifications/);
      await page.unmount();
    });
  });

  describe('profile', () => {
    test('shows the account, the sign-in email as read-only text, and no protected controls', async () => {
      const page = await visit('/customer/profile');
      assert.equal(labelled('First name').value, 'Casey');
      assert.equal(labelled('Company name').value, 'Acme Freight');
      assert.match(text(), /casey@example\.com/);
      assert.ok(!document.querySelector('input[type="email"][value="casey@example.com"]'), 'the sign-in email is not an input');
      const names = [...main().querySelectorAll('input, select, textarea')].map((node) => node.name);
      for (const protectedName of ['role', 'accountType', 'status', 'customerId', 'userId', 'isActive', 'isEmailVerified', 'tokenVersion', 'email']) assert.ok(!names.includes(protectedName), protectedName);
      await page.unmount();
    });

    test('saving sends only allowed profile fields and updates the shared name', async () => {
      const page = await visit('/customer/profile', 'customer', {
        'PATCH /customer/profile': ({ body }) => ({ data: { ...fx.profile(), account: { ...fx.profile().account, firstName: body.firstName } } }),
      });
      await fill({ 'First name': 'Cassidy', 'Company name': 'Acme Freight Ltd' });
      await submit('Profile details');
      const request = called('PATCH /customer/profile')[0];
      assert.equal(request.body.firstName, 'Cassidy');
      assert.equal(request.body.companyName, 'Acme Freight Ltd');
      const allowed = ['firstName', 'lastName', 'phone', 'companyName', 'contactPerson', 'businessEmail', 'address', 'billing'];
      assert.deepEqual(Object.keys(request.body).filter((key) => !allowed.includes(key)), []);
      assert.match(text(), /Your profile was updated\./);
      assert.match(document.querySelector('header').textContent, /Cassidy Customer/);
      await page.unmount();
    });

    test('validation blocks an empty name; a server field error is shown next to its field', async () => {
      let page = await visit('/customer/profile');
      await fill({ 'First name': '   ' });
      await submit('Profile details');
      assert.equal(called('PATCH /customer/profile').length, 0);
      assert.equal(labelled('First name').getAttribute('aria-invalid'), 'true');
      await page.unmount();

      page = await visit('/customer/profile', 'customer', { 'PATCH /customer/profile': () => ({ status: 422, body: { message: 'Please correct the highlighted fields.', errors: [{ field: 'phone', message: 'Enter a valid phone number.' }] } }) });
      await submit('Profile details');
      assert.equal(labelled('Phone').getAttribute('aria-invalid'), 'true');
      await page.unmount();
    });

    test('change password: checks the confirmation locally, then posts the three fields and clears them', async () => {
      const page = await visit('/customer/profile', 'customer', { 'POST /customer/profile/password': () => ({ message: 'Your password was changed. Other devices have been signed out.', data: {} }) });
      await fill({ 'Current password': 'old-pass-phrase-1', 'New password': 'brand-new-pass-phrase-4', 'Confirm new password': 'mismatch-pass-phrase-5' });
      await submit('Change password');
      assert.equal(called('POST /customer/profile/password').length, 0);
      assert.match(text(), /Passwords do not match\./);
      await fill({ 'Confirm new password': 'brand-new-pass-phrase-4' });
      await submit('Change password');
      assert.deepEqual(called('POST /customer/profile/password')[0].body, { currentPassword: 'old-pass-phrase-1', password: 'brand-new-pass-phrase-4', passwordConfirmation: 'brand-new-pass-phrase-4' });
      assert.match(text(), /Other devices have been signed out/);
      assert.equal(labelled('Current password').value, '');
      await page.unmount();
    });

    test('change password: a wrong current password is reported on that field', async () => {
      const page = await visit('/customer/profile', 'customer', { 'POST /customer/profile/password': () => ({ status: 422, body: { message: 'Please correct the highlighted fields.', errors: [{ field: 'currentPassword', message: 'Your current password is incorrect.' }] } }) });
      await fill({ 'Current password': 'wrong-pass-phrase-1', 'New password': 'brand-new-pass-phrase-4', 'Confirm new password': 'brand-new-pass-phrase-4' });
      await submit('Change password');
      assert.equal(labelled('Current password').getAttribute('aria-invalid'), 'true');
      assert.match(text(), /current password is incorrect/);
      await page.unmount();
    });

    test('an unconfirmed email offers the existing resend flow and reports the server’s honest answer', async () => {
      const page = await visit('/customer/profile');
      await click(button('Resend confirmation email'));
      assert.match(text(), /Email delivery is not configured yet/);
      await page.unmount();
    });
  });

  describe('security hygiene', () => {
    test('no token or session data is written to browser storage', async () => {
      const page = await visit('/customer/profile');
      assert.equal(window.localStorage.length + window.sessionStorage.length, 0);
      await page.unmount();
    });

    test('customer sources never send or read a customer id, and never touch storage or Authorization', () => {
      const files = ['src/services/customerService.js', 'src/components/forms/CustomerQuoteForm.jsx', 'src/components/forms/CustomerProfileForm.jsx', 'src/components/forms/ChangePasswordForm.jsx',
        ...readdirSync(`${ROOT}src/pages/customer`).map((name) => `src/pages/customer/${name}`)];
      for (const file of files) {
        const source = readFileSync(`${ROOT}${file}`, 'utf8');
        assert.ok(!/customerId/.test(source), `${file} mentions customerId`);
        assert.ok(!/localStorage|sessionStorage|Authorization|dangerouslySetInnerHTML/.test(source), `${file} touches storage, Authorization or raw HTML`);
      }
    });

    test('no React errors or warnings were logged during the whole run', () => {
      assert.deepEqual(errors, []);
    });
  });
});
