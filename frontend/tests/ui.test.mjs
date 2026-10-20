/**
 * Frontend routing, route guards, and authentication flows, rendered in jsdom against a mocked API.
 * No browser and no backend are needed. Run with: npm test
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
});
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
  customer: { id: 'c1', firstName: 'Casey', lastName: 'Customer', fullName: 'Casey Customer', email: 'c@example.com', role: 'customer' },
  carrier: { id: 'k1', firstName: 'Kai', lastName: 'Carrier', fullName: 'Kai Carrier', email: 'k@example.com', role: 'carrier' },
  super_admin: { id: 'a1', firstName: 'Ada', lastName: 'Admin', fullName: 'Ada Admin', email: 'a@example.com', role: 'super_admin' },
};

describe('frontend routing, guards, and authentication', () => {
  let vite;
  let appRoutes;
  let AuthProvider;
  let apiClient;
  let clearContentCache;
  let session = null;
  let loginResult = null;
  const api = { handler: null };
  let calls = [];
  const errors = [];
  const originalConsoleError = console.error;

  const tick = (ms = 30) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

  before(async () => {
    vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
    ({ appRoutes } = await vite.ssrLoadModule('/src/routes/appRoutes.jsx'));
    ({ AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
    ({ apiClient } = await vite.ssrLoadModule('/src/services/apiClient.js'));
    ({ clearContentCache } = await vite.ssrLoadModule('/src/services/contentService.js'));

    apiClient.defaults.adapter = async (config) => {
      const { url, method } = config;
      const isJson = typeof config.data === 'string';
      const body = isJson ? JSON.parse(config.data) : undefined;
      calls.push({ key: `${method.toUpperCase()} ${url}`, body, form: !isJson && config.data ? config.data : undefined, params: config.params });
      const ok = (data, status = 200) => ({ data, status, statusText: 'OK', headers: {}, config });
      const fail = (status, data) => {
        const error = new Error('request failed');
        error.response = { status, data };
        throw error;
      };
      const me = () => (session ? ok({ success: true, data: { user: USERS[session], profile: null } }) : fail(401, { success: false, message: 'Authentication required.', errors: [] }));

      if (url === '/health') return ok({ success: true, data: { status: 'ok', environment: 'development', timestamp: new Date().toISOString(), database: 'connected' } });
      if (url === '/auth/me') return me();
      if (url === '/auth/login' || url === '/auth/admin/login') {
        if (loginResult === 'invalid') return fail(401, { success: false, message: 'Invalid email or password.', errors: [] });
        if (loginResult === 'deactivated') return fail(403, { success: false, message: 'This account has been deactivated. Please contact support.', errors: [] });
        if (loginResult === 'fields') return fail(422, { success: false, message: 'Please correct the highlighted fields.', errors: [{ field: 'email', message: 'Enter a valid email address.' }] });
        session = loginResult;
        return ok({ success: true, data: { user: USERS[loginResult], profile: null } });
      }
      if (url.startsWith('/auth/register/')) {
        if (loginResult === 'fields') return fail(422, { success: false, message: 'Please correct the highlighted fields.', errors: [{ field: 'passwordConfirmation', message: 'Passwords do not match.' }] });
        session = url.endsWith('carrier') ? 'carrier' : 'customer';
        return ok({ success: true, data: { user: USERS[session], profile: null } }, 201);
      }
      if (url === '/auth/logout') {
        session = null;
        return ok({ success: true, data: {}, message: 'Signed out' });
      }
      if (url === '/auth/forgot-password') return ok({ success: true, data: { emailDeliveryAvailable: false }, message: 'Password reset email is not available yet because email delivery is not configured. No email was sent.' });
      if (url === '/auth/reset-password') {
        if (body.token === 'expired') return fail(400, { success: false, message: 'This reset link is invalid or has expired.', errors: [] });
        return ok({ success: true, data: {}, message: 'Your password has been changed. Please sign in with your new password.' });
      }
      if (url === '/auth/verify-email') {
        if (body.token === 'expired') return fail(400, { success: false, message: 'This verification link is invalid or has expired.', errors: [] });
        return ok({ success: true, data: {}, message: 'Your email address has been confirmed.' });
      }
      if (url === '/auth/resend-verification') return ok({ success: true, data: { delivered: false }, message: 'Email delivery is not configured yet, so no confirmation email was sent.' });
      if (api.handler) {
        const handled = api.handler({ url, method, ok, fail, params: config.params });
        if (handled) return handled;
      }
      // Content/tracking endpoints are not built yet: the real API answers 404.
      if (url.startsWith('/content/') || url.startsWith('/tracking/')) return fail(404, { success: false, message: 'Not found.', errors: [] });
      if (['/quotes', '/contact', '/carrier-applications'].includes(url)) return fail(404, { success: false, message: 'Not found.', errors: [] });
      throw new Error(`unmocked request: ${method} ${url}`);
    };

    console.error = (...args) => errors.push(args.map(String).join(' '));
  });

  after(async () => {
    console.error = originalConsoleError;
    await vite.close();
  });

  async function visit(path, asUser = null) {
    session = asUser;
    calls = [];
    clearContentCache();
    document.body.innerHTML = '<div id="root"></div>';
    const router = RR.createMemoryRouter(appRoutes, { initialEntries: [path] });
    const root = createRoot(document.getElementById('root'));
    await act(async () => {
      root.render(React.createElement(AuthProvider, null, React.createElement(RR.RouterProvider, { router })));
    });
    await tick();
    for (let attempt = 0; attempt < 60 && !document.querySelector('h1'); attempt += 1) await tick(50);
    return {
      router,
      h1: () => document.querySelector('h1')?.textContent ?? '',
      path: () => router.state.location.pathname,
      unmount: () => act(() => root.unmount()),
    };
  }

  const labelled = (label) => {
    const element = [...document.querySelectorAll('label')].find((item) => item.textContent.startsWith(label));
    assert.ok(element, `a field labelled "${label}" exists`);
    return document.getElementById(element.htmlFor);
  };

  async function fillAndSubmit(fields) {
    for (const [label, value] of Object.entries(fields)) {
      const input = labelled(label);
      await act(async () => {
        const prototype = input.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
        input.dispatchEvent(new dom.window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      });
    }
    await act(async () => {
      document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });
    await tick(60);
  }

  const clickButton = async (text) => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent.includes(text));
    assert.ok(button, `a "${text}" button exists`);
    await act(async () => button.click());
    await tick(60);
  };
  const lastCall = (key) => [...calls].reverse().find((call) => call.key === key);

  describe('every route in the specification renders inside its layout', () => {
    const publicPages = {
      '/': 'HASHIMI LOGISTICS INC.', '/about': 'Moving Freight. Building Trust.', '/services': 'Freight Services', '/services/ltl': 'Less-Than-Truckload (LTL)', '/industries': 'Freight Expertise Across Industries',
      '/industries/retail': 'Retail Freight', '/service-areas': 'Coverage Across North America', '/for-shippers': 'Your Freight. Our Coordination.', '/for-carriers': 'Grow With Hashimi Logistics',
      '/how-it-works': 'How It Works', '/track-shipment': 'Track Your Shipment', '/request-quote': 'Request a Freight Quote', '/become-a-carrier': 'Become a Carrier',
      '/carrier-resources': 'Carrier Resources', '/resources': 'Freight Resources', '/resources/x': 'Article not found', '/faq': 'Frequently Asked Questions',
      '/contact': 'Let’s Talk About Your Freight', '/privacy-policy': 'Privacy Policy', '/terms': 'Terms and Conditions', '/login': 'Sign in', '/register': 'Create your account',
      '/forgot-password': 'Reset your password', '/reset-password?token=abc': 'Choose a new password', '/verify-email?token=abc': 'Confirm your email address',
      '/admin/login': 'Super Admin sign in', '/does-not-exist': 'Page not found', '/services/nope': 'Service not found', '/industries/nope': 'Industry not found',
    };
    const portals = {
      customer: ['/customer', '/customer/quotes', '/customer/quotes/9', '/customer/shipments', '/customer/shipments/9', '/customer/documents', '/customer/invoices', '/customer/messages', '/customer/notifications', '/customer/profile'],
      carrier: ['/carrier', '/carrier/loads', '/carrier/loads/9', '/carrier/my-loads', '/carrier/shipments', '/carrier/shipments/9', '/carrier/documents', '/carrier/pod', '/carrier/payments', '/carrier/messages', '/carrier/notifications', '/carrier/profile'],
      super_admin: ['/admin', '/admin/quotes', '/admin/quotes/9', '/admin/loads', '/admin/loads/9', '/admin/loads/9/edit', '/admin/loads/9/matching', '/admin/shipments', '/admin/shipments/9', '/admin/customers', '/admin/customers/9', '/admin/carriers', '/admin/carriers/9', '/admin/carrier-applications', '/admin/carrier-applications/9', '/admin/documents', '/admin/payments', '/admin/payments/9', '/admin/documents/9', '/admin/dashboard', '/admin/cms', '/admin/cms/homepage', '/admin/cms/pages', '/admin/cms/pages/new', '/admin/cms/pages/9', '/admin/cms/services', '/admin/cms/services/new', '/admin/cms/services/9', '/admin/cms/industries', '/admin/cms/industries/new', '/admin/cms/service-areas', '/admin/cms/service-areas/new', '/admin/cms/blog', '/admin/cms/blog/new', '/admin/cms/blog/9', '/admin/cms/faqs', '/admin/cms/faqs/new', '/admin/cms/testimonials', '/admin/cms/testimonials/new', '/admin/cms/media', '/admin/cms/seo', '/admin/forms', '/admin/notifications', '/admin/activity-logs', '/admin/security', '/admin/settings'],
    };

    test(`public and authentication routes (${Object.keys(publicPages).length}) stay reachable without signing in`, async () => {
      for (const [path, title] of Object.entries(publicPages)) {
        const page = await visit(path);
        assert.equal(page.h1(), title, path);
        await page.unmount();
      }
    });

    for (const [role, paths] of Object.entries(portals)) {
      test(`${role}: all ${paths.length} portal routes render`, async () => {
        for (const path of paths) {
          const page = await visit(path, role);
          assert.equal(page.path(), path, `${path} was not redirected`);
          assert.ok(page.h1(), `${path} has a heading`);
          assert.ok(document.querySelector('main#main-content') && document.querySelector('nav'), `${path} sits in a layout`);
          await page.unmount();
        }
      });
    }
  });

  describe('route guards (the frontend half; the backend enforces the real rules)', () => {
    const cases = [
      ['guest', null, '/admin', '/admin/login'],
      ['guest', null, '/admin/settings', '/admin/login'],
      ['guest', null, '/customer/quotes', '/login'],
      ['guest', null, '/carrier', '/login'],
      ['customer', 'customer', '/admin', '/customer'],
      ['customer', 'customer', '/admin/cms/blog', '/customer'],
      ['customer', 'customer', '/carrier', '/customer'],
      ['carrier', 'carrier', '/customer', '/carrier'],
      ['carrier', 'carrier', '/admin/settings', '/carrier'],
      ['super admin', 'super_admin', '/customer', '/admin'],
      ['super admin', 'super_admin', '/carrier', '/admin'],
      ['signed-in customer', 'customer', '/login', '/customer'],
      ['signed-in carrier', 'carrier', '/register', '/carrier'],
      ['signed-in admin', 'super_admin', '/admin/login', '/admin'],
    ];
    for (const [who, role, from, expected] of cases) {
      test(`${who} opening ${from} ends up at ${expected}`, async () => {
        const page = await visit(from, role);
        assert.equal(page.path(), expected);
        await page.unmount();
      });
    }

    test('public pages are never gated, signed in or not', async () => {
      for (const role of [null, 'customer', 'carrier', 'super_admin']) {
        for (const path of ['/', '/services', '/contact', '/track-shipment']) {
          const page = await visit(path, role);
          assert.equal(page.path(), path);
          await page.unmount();
        }
      }
    });
  });

  describe('sign in sends each account type to its own portal', () => {
    for (const [role, destination, portal] of [['customer', '/customer', '/login'], ['carrier', '/carrier', '/login'], ['super_admin', '/admin', '/admin/login']]) {
      test(`${role} signs in at ${portal} and lands on ${destination}`, async () => {
        loginResult = role;
        const page = await visit(portal);
        await fillAndSubmit({ 'Email address': 'person@example.com', Password: 'a-long-enough-pass-1' });
        assert.equal(page.path(), destination);
        assert.ok(calls.some((call) => call.key === (portal === '/admin/login' ? 'POST /auth/admin/login' : 'POST /auth/login')), 'the matching endpoint was used');
        await page.unmount();
      });
    }

    test('a deep link survives sign-in: the person returns to the page they asked for', async () => {
      loginResult = 'customer';
      const page = await visit('/customer/quotes');
      assert.equal(page.path(), '/login');
      await fillAndSubmit({ 'Email address': 'c@example.com', Password: 'a-long-enough-pass-1' });
      assert.equal(page.path(), '/customer/quotes');
      assert.equal(page.h1(), 'My quotes');
      await page.unmount();
    });

    test('a link to a portal the person may not use falls back to their own portal after sign-in', async () => {
      loginResult = 'customer';
      const page = await visit('/admin');
      assert.equal(page.path(), '/admin/login');
      await fillAndSubmit({ 'Email address': 'c@example.com', Password: 'a-long-enough-pass-1' });
      assert.equal(page.path(), '/customer');
      await page.unmount();
    });

    test('wrong credentials and a deactivated account show the server message and stay on the page', async () => {
      loginResult = 'invalid';
      let page = await visit('/login');
      await fillAndSubmit({ 'Email address': 'a@b.co', Password: 'wrongwrongwrong' });
      assert.match(document.querySelector('[role="alert"]').textContent, /Invalid email or password\./);
      assert.equal(page.path(), '/login');
      await page.unmount();

      loginResult = 'deactivated';
      page = await visit('/login');
      await fillAndSubmit({ 'Email address': 'a@b.co', Password: 'a-long-enough-pass-1' });
      assert.match(document.querySelector('[role="alert"]').textContent, /deactivated/i);
      assert.equal(page.path(), '/login');
      assert.equal(session, null, 'no session was created');
      await page.unmount();
    });

    test('field errors are shown next to the field with proper accessibility wiring', async () => {
      loginResult = 'fields';
      const page = await visit('/login');
      await fillAndSubmit({ 'Email address': 'bad', Password: 'x' });
      const input = document.querySelector('input[name="email"]');
      assert.equal(input.getAttribute('aria-invalid'), 'true');
      assert.match(document.getElementById(input.getAttribute('aria-describedby')).textContent, /valid email/);
      await page.unmount();
    });

    test('signing out ends the session and returns to the right sign-in page', async () => {
      let page = await visit('/customer', 'customer');
      await clickButton('Sign out');
      assert.equal(page.path(), '/login');
      assert.equal(session, null);
      assert.ok(calls.some((call) => call.key === 'POST /auth/logout'));
      await page.unmount();

      page = await visit('/admin', 'super_admin');
      await clickButton('Sign out');
      assert.equal(page.path(), '/admin/login');
      await page.unmount();
    });
  });

  describe('registration', () => {
    test('a carrier registers through /auth/register/carrier with company name and confirmation, and the account type is NOT sent in the body', async () => {
      loginResult = 'customer';
      const page = await visit('/register');
      await fillAndSubmit({ 'Account type': 'carrier', 'First name': 'Kai', 'Last name': 'Hauler', 'Company name': 'Hauler Trucking', 'Email address': 'k@example.com', Password: 'a-long-enough-pass-1', 'Confirm password': 'a-long-enough-pass-1' });
      const request = lastCall('POST /auth/register/carrier');
      assert.ok(request, 'the carrier endpoint was called');
      assert.deepEqual(request.body, { firstName: 'Kai', lastName: 'Hauler', companyName: 'Hauler Trucking', email: 'k@example.com', password: 'a-long-enough-pass-1', passwordConfirmation: 'a-long-enough-pass-1' });
      assert.equal('accountType' in request.body || 'role' in request.body, false, 'the client never sends a role');
      assert.equal(page.path(), '/carrier');
      await page.unmount();
    });

    test('a customer registers through /auth/register/customer, and an optional phone is only sent when filled in', async () => {
      const page = await visit('/register');
      await fillAndSubmit({ 'First name': 'Casey', 'Last name': 'Shipper', 'Company name': 'Shipper Co', 'Email address': 'c@example.com', 'Phone number (optional)': '+1 555 010 0000', Password: 'a-long-enough-pass-1', 'Confirm password': 'a-long-enough-pass-1' });
      const request = lastCall('POST /auth/register/customer');
      assert.equal(request.body.phone, '+1 555 010 0000');
      assert.equal(page.path(), '/customer');
      await page.unmount();
    });

    test('the form has no role, admin, or verification controls, and labels every field', async () => {
      const page = await visit('/register');
      const names = [...document.querySelectorAll('input,select')].map((element) => element.name);
      assert.deepEqual(names.sort(), ['accountType', 'companyName', 'email', 'firstName', 'lastName', 'password', 'passwordConfirmation', 'phone']);
      const options = [...document.querySelectorAll('select[name="accountType"] option')].map((option) => option.value);
      assert.deepEqual(options, ['customer', 'carrier'], 'super_admin is not offered');
      for (const element of document.querySelectorAll('input,select')) {
        assert.ok(document.querySelector(`label[for="${element.id}"]`), `${element.name} has a label`);
      }
      await page.unmount();
    });

    test('a server-side mismatch error appears on the confirmation field', async () => {
      loginResult = 'fields';
      const page = await visit('/register');
      await fillAndSubmit({ 'First name': 'A', 'Last name': 'B', 'Company name': 'C', 'Email address': 'a@b.co', Password: 'a-long-enough-pass-1', 'Confirm password': 'different' });
      assert.match(document.body.textContent, /Passwords do not match\./);
      assert.equal(document.querySelector('input[name="passwordConfirmation"]').getAttribute('aria-invalid'), 'true');
      await page.unmount();
    });
  });

  describe('password reset and email verification screens', () => {
    test('forgot-password shows the server\'s honest message and no inbox promise', async () => {
      const page = await visit('/forgot-password');
      await fillAndSubmit({ 'Email address': 'a@b.co' });
      assert.match(document.body.textContent, /No email was sent/);
      await page.unmount();
    });

    test('reset-password sends the token, password, and confirmation, and reports success', async () => {
      const page = await visit('/reset-password?token=abc123');
      await fillAndSubmit({ 'New password': 'a-long-enough-pass-1', 'Confirm new password': 'a-long-enough-pass-1' });
      assert.deepEqual(lastCall('POST /auth/reset-password').body, { token: 'abc123', password: 'a-long-enough-pass-1', passwordConfirmation: 'a-long-enough-pass-1' });
      assert.match(document.body.textContent, /Your password has been changed/);
      await page.unmount();
    });

    test('an expired reset link shows the server error; a link without a token shows a clear notice', async () => {
      let page = await visit('/reset-password?token=expired');
      await fillAndSubmit({ 'New password': 'a-long-enough-pass-1', 'Confirm new password': 'a-long-enough-pass-1' });
      assert.match(document.querySelector('[role="alert"]').textContent, /invalid or has expired/);
      await page.unmount();

      page = await visit('/reset-password');
      assert.match(document.querySelector('[role="alert"]').textContent, /incomplete/);
      await page.unmount();
    });

    test('verify-email does nothing until the person clicks, then confirms once', async () => {
      const page = await visit('/verify-email?token=goodtoken');
      assert.equal(calls.some((call) => call.key === 'POST /auth/verify-email'), false, 'merely opening the link consumes nothing');
      await clickButton('Confirm email address');
      assert.deepEqual(lastCall('POST /auth/verify-email').body, { token: 'goodtoken' });
      assert.match(document.body.textContent, /Your email address has been confirmed/);
      await page.unmount();
    });

    test('verify-email shows expiry errors, an incomplete-link notice, and offers resend only when signed in', async () => {
      let page = await visit('/verify-email?token=expired');
      await clickButton('Confirm email address');
      assert.match(document.querySelector('[role="alert"]').textContent, /invalid or has expired/);
      assert.ok(![...document.querySelectorAll('button')].some((button) => /new confirmation email/.test(button.textContent)), 'no resend button for signed-out visitors');
      await page.unmount();

      page = await visit('/verify-email', null);
      assert.match(document.querySelector('[role="alert"]').textContent, /incomplete/);
      await page.unmount();

      page = await visit('/verify-email?token=expired', 'customer');
      await clickButton('Send me a new confirmation email');
      assert.ok(lastCall('POST /auth/resend-verification'));
      assert.match(document.body.textContent, /no confirmation email was sent/);
      await page.unmount();
    });
  });

  describe('tokens stay out of reach of page scripts', () => {
    test('nothing is written to localStorage or sessionStorage through any sign-in, registration, or reset flow', async () => {
      loginResult = 'customer';
      const page = await visit('/login');
      await fillAndSubmit({ 'Email address': 'c@example.com', Password: 'a-long-enough-pass-1' });
      await page.unmount();
      assert.equal(window.localStorage.length, 0);
      assert.equal(window.sessionStorage.length, 0);
      assert.equal(document.cookie, '', 'no cookie is readable by scripts (the session cookie is HttpOnly and set by the server)');
    });

    test('the source never touches browser storage or an Authorization header', async () => {
      const { readdirSync, readFileSync } = await import('node:fs');
      const files = readdirSync(`${ROOT}src`, { recursive: true }).filter((file) => /\.(js|jsx)$/.test(file));
      for (const file of files) {
        const text = readFileSync(`${ROOT}src/${file}`, 'utf8');
        assert.ok(!/localStorage|sessionStorage|indexedDB/.test(text), `${file} uses browser storage`);
        assert.ok(!/Authorization|Bearer /.test(text), `${file} sets an Authorization header`);
      }
    });

    test('the API client sends cookies and no hard-coded URL', async () => {
      assert.equal(apiClient.defaults.withCredentials, true);
      assert.ok(!/^https?:\/\/(?!localhost)/.test(apiClient.defaults.baseURL), apiClient.defaults.baseURL);
    });
  });

  describe('public chrome and accessibility', () => {
    test('the homepage keeps both calls to action and the skip link', async () => {
      const page = await visit('/');
      assert.equal(document.querySelector('main a[href="/request-quote"]')?.textContent, 'Request a Quote');
      assert.equal(document.querySelector('main a[href="/become-a-carrier"]')?.textContent, 'Become a Carrier');
      assert.ok(document.querySelector('a[href="#main-content"]'));
      await page.unmount();
    });

    test('the mobile menu toggles and closes with Escape', async () => {
      const page = await visit('/');
      const button = document.querySelector('button[aria-controls="mobile-menu"]');
      assert.equal(button.getAttribute('aria-expanded'), 'false');
      await act(async () => button.click());
      assert.ok(document.getElementById('mobile-menu'));
      await act(async () => {
        document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
      });
      assert.equal(document.getElementById('mobile-menu'), null);
      await page.unmount();
    });

    test('no React errors or warnings were logged during the whole run', () => {
      const real = errors.filter((message) => !/not wrapped in act|ScrollRestoration|scrollTo/.test(message));
      assert.deepEqual(real, []);
    });
  });
});
