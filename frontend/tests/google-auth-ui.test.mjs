/**
 * Customer / carrier sign-in and registration pages, including Google Sign-In. Rendered in jsdom through the real router, auth
 * provider and axios client; only the transport is mocked. The Google Identity Services script is MOCKED (window.google), so
 * these tests prove the page wiring and what is sent to the API, not a real Google round trip. Run with: npm test
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { act, createHarness, dom, USERS } from './cms-harness.mjs';

describe('Customer and carrier authentication pages', () => {
  let h;
  let gsi;
  const { window } = dom;

  const googleConfig = (enabled) => ({ 'GET /auth/google/config': () => ({ data: { enabled, clientId: enabled ? 'test.apps.googleusercontent.com' : null } }) });
  const signedIn = (role) => () => {
    h.state.session = role;
    return { data: { user: USERS[role], profile: null } };
  };
  const refusal = (status, message, code) => () => ({ status, body: { message, ...(code ? { code } : {}) } });
  const visit = (path, { as = null, routes = {} } = {}) => h.visit(path, { as, routes: { ...googleConfig(false), ...routes } });
  // Dashboards are lazy routes; on a cold module cache the first one takes longer than the harness settle time.
  const arrive = async (view, path) => {
    for (let attempt = 0; attempt < 60 && view.path() !== path; attempt += 1) await h.tick(50);
    assert.equal(view.path(), path);
  };
  const arriveUnder = async (view, home) => {
    for (let attempt = 0; attempt < 60 && !view.path().startsWith(home); attempt += 1) await h.tick(50);
    assert.ok(view.path().startsWith(home), view.path());
  };
  const submitLogin = async (email = 'person@example.com') => {
    await h.fill({ 'Email address': email, Password: 'a-long-enough-pass-1' });
    await h.submit(document.querySelector('form'));
  };
  const withGoogleScript = () => {
    gsi = { config: null, rendered: [] };
    window.google = {
      accounts: {
        id: {
          initialize: (config) => { gsi.config = config; },
          renderButton: (element, options) => { gsi.rendered.push(options); element.innerHTML = '<div role="button" aria-label="Google button">Google</div>'; },
        },
      },
    };
  };

  before(async () => { h = await createHarness(); });
  after(async () => { delete window.google; await h.close(); });
  beforeEach(() => { delete window.google; });

  describe('the two portals', () => {
    for (const [portal, title, registerHref, dashboard, role] of [
      ['carrier', 'Carrier sign in', '/register?type=carrier', '/carrier', 'carrier'],
      ['customer', 'Customer sign in', '/register?type=customer', '/customer', 'customer'],
    ]) {
      test(`${portal}: its own heading and registration link, password sign-in sends the portal, and the account's role picks the dashboard`, async () => {
        const view = await visit(`/login?portal=${portal}`, { routes: { 'POST /auth/login': signedIn(role) } });
        assert.equal(h.h1(), title);
        assert.equal(h.link(portal === 'carrier' ? 'Register as a Carrier' : 'Create a Customer Account').getAttribute('href'), registerHref);
        await submitLogin();
        assert.deepEqual(h.called('POST /auth/login')[0].body, { email: 'person@example.com', password: 'a-long-enough-pass-1', portal });
        await arrive(view, dashboard);
        await view.unmount();
      });
    }

    test('the other portal is one link away, and an unknown portal value falls back to the neutral chooser', async () => {
      let view = await visit('/login?portal=carrier');
      assert.equal(h.link('Customer Login').getAttribute('href'), '/login?portal=customer');
      await view.unmount();
      for (const bogus of ['super_admin', 'admin', '__proto__', '']) {
        view = await visit(`/login?portal=${bogus}`);
        assert.equal(h.h1(), 'Sign in', bogus);
        assert.ok(h.link('Customer Login') && h.link('Carrier Login'));
        assert.ok(!document.body.textContent.includes('Continue with Google'), 'no Google flow without a real portal');
        await view.unmount();
      }
    });

    test('a failed sign-in shows a safe, generic message and points to the right portal without leaking which part was wrong', async () => {
      const view = await visit('/login?portal=customer', { routes: { 'POST /auth/login': refusal(401, 'Invalid email or password.') } });
      await submitLogin();
      assert.equal(view.path(), '/login?portal=customer');
      const alert = document.querySelector('[role="alert"]');
      assert.match(alert.textContent, /Invalid email or password\./);
      assert.match(alert.textContent, /Customer Login/);
      assert.doesNotMatch(alert.textContent, /no account|not registered|wrong password/i);
      await view.unmount();
    });

    test('a deactivated account sees the server message and no session is started', async () => {
      const view = await visit('/login?portal=carrier', { routes: { 'POST /auth/login': refusal(403, 'This account has been deactivated. Please contact support.') } });
      await submitLogin();
      assert.match(document.querySelector('[role="alert"]').textContent, /deactivated/);
      assert.equal(view.path(), '/login?portal=carrier');
      await view.unmount();
    });
  });

  describe('the portal in the address is never proof of a role', () => {
    const quiet = { 'GET /customer/notifications': () => ({ data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 }, unreadCount: 0 } }) };
    for (const [as, home] of [['customer', '/customer'], ['carrier', '/carrier'], ['super_admin', '/admin']]) {
      for (const portal of ['customer', 'carrier']) {
        const sameAccount = as === portal;
        test(sameAccount ? `${as} opening /login?portal=${portal} is sent to their own home, ${home}` : `${as} opening /login?portal=${portal} gets the sign-in form, not sent to ${home}`, async () => {
          const view = await h.visit(`/login?portal=${portal}`, { as, routes: { ...googleConfig(false), ...quiet }, wait: false });
          if (sameAccount) await arriveUnder(view, home);
          else {
            for (let attempt = 0; attempt < 40 && !document.querySelector('h1'); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 25));
            assert.equal(document.querySelector('h1')?.textContent, `${portal === 'customer' ? 'Customer' : 'Carrier'} sign in`);
            assert.ok(document.querySelector('form'), 'the sign-in form is shown');
            assert.ok(!view.path().startsWith(home), 'the dashboard of the signed-in account is not opened');
          }
          await view.unmount();
        });
      }
    }

    for (const [as, path, home] of [
      ['customer', '/carrier', '/customer'], ['carrier', '/customer', '/carrier'],
      ['customer', '/admin', '/customer'], ['carrier', '/admin', '/carrier'],
      ['customer', '/admin/cms/settings', '/customer'], ['carrier', '/admin/finance', '/carrier'],
    ]) {
      test(`${as} cannot open ${path}; they are redirected to ${home}`, async () => {
        const view = await h.visit(`${path}?portal=${as === 'customer' ? 'carrier' : 'customer'}`, { as, routes: { ...googleConfig(false), ...quiet }, wait: false });
        await arriveUnder(view, home);
        await view.unmount();
      });
    }

    test('a signed-out visitor to a dashboard is sent to the shared sign-in page', async () => {
      for (const path of ['/customer', '/carrier', '/admin']) {
        const view = await visit(path);
        assert.equal(view.path(), path === '/admin' ? '/admin/login' : '/login', path);
        await view.unmount();
      }
    });
  });

  describe('Google Sign-In on the portals', () => {
    test('while Google is not configured the button is a disabled placeholder with an honest explanation and no script is loaded', async () => {
      const view = await visit('/login?portal=carrier');
      const button = h.button('Continue with Google');
      assert.ok(button?.disabled);
      assert.match(document.body.textContent, /Google sign-in is not available yet/);
      assert.ok(!document.head.querySelector('script[src*="accounts.google.com"]'));
      await view.unmount();
    });

    for (const [portal, role, dashboard] of [['carrier', 'carrier', '/carrier'], ['customer', 'customer', '/customer']]) {
      test(`${portal}: when configured, Google's button is shown and its credential goes to the server with the portal`, async () => {
        withGoogleScript();
        const view = await visit(`/login?portal=${portal}`, { routes: { ...googleConfig(true), 'POST /auth/google/login': signedIn(role) } });
        await h.tick(60);
        assert.equal(gsi.config.client_id, 'test.apps.googleusercontent.com');
        assert.ok(document.querySelector('[aria-label="Google button"]'));
        assert.equal(gsi.rendered.at(-1).text, 'continue_with');
        await act(async () => gsi.config.callback({ credential: 'signed-google-id-token' }));
        await h.tick(60);
        assert.deepEqual(h.called('POST /auth/google/login')[0].body, { credential: 'signed-google-id-token', portal });
        await arrive(view, dashboard);
        await view.unmount();
      });
    }

    test('an unregistered Google user is told to register, with a link to the matching registration page', async () => {
      withGoogleScript();
      const view = await visit('/login?portal=carrier', { routes: { ...googleConfig(true), 'POST /auth/google/login': refusal(404, 'There is no account for this Google email yet. Please register first.', 'ACCOUNT_NOT_FOUND') } });
      await h.tick(60);
      await act(async () => gsi.config.callback({ credential: 'tok' }));
      await h.tick(60);
      assert.equal(view.path(), '/login?portal=carrier');
      const alert = [...document.querySelectorAll('[role="alert"]')].find((node) => /register first/.test(node.textContent));
      assert.ok(alert, 'the message is shown');
      assert.equal(alert.querySelector('a').getAttribute('href'), '/register?type=carrier');
      await view.unmount();
    });

    test('a role mismatch from the server (customer Google account at the carrier portal) is shown and nothing signs in', async () => {
      withGoogleScript();
      const view = await visit('/login?portal=carrier', { routes: { ...googleConfig(true), 'POST /auth/google/login': refusal(403, 'This Google account is registered as a customer. Please use the Customer Login instead.', 'WRONG_PORTAL') } });
      await h.tick(60);
      await act(async () => gsi.config.callback({ credential: 'tok' }));
      await h.tick(60);
      assert.match(document.querySelector('[role="alert"]').textContent, /Customer Login/);
      assert.equal(view.path(), '/login?portal=carrier');
      await view.unmount();
    });

    test('Google sign-in is not offered on the Super Admin sign-in page', async () => {
      withGoogleScript();
      const view = await visit('/admin/login', { routes: googleConfig(true) });
      assert.ok(!document.body.textContent.includes('Continue with Google'));
      assert.equal(document.querySelector('[aria-label="Google button"]'), null);
      await view.unmount();
    });
  });

  describe('registration pages', () => {
    test('the type in the address only preselects customer or carrier; anything else falls back to customer and no privileged type is offered', async () => {
      const expectations = [['carrier', 'carrier', 'Register as a Carrier'], ['customer', 'customer', 'Create a Customer Account'], ['super_admin', 'customer', 'Create your account'], ['', 'customer', 'Create your account']];
      for (const [type, selected, title] of expectations) {
        const view = await visit(`/register${type ? `?type=${type}` : ''}`);
        assert.equal(h.h1(), title, type);
        const select = h.labelled('Account type');
        assert.equal(select.value, selected, type);
        assert.deepEqual([...select.options].map((option) => option.value), ['customer', 'carrier']);
        await view.unmount();
      }
    });

    test('password registration never sends a role or account type in the body', async () => {
      const view = await visit('/register?type=carrier', { routes: { 'POST /auth/register/carrier': signedIn('carrier') } });
      await h.fill({ 'First name': 'Kai', 'Last name': 'Hauler', 'Company name': 'Kai Trucking', 'Email address': 'kai@example.com', Password: 'a-long-enough-pass-1', 'Confirm password': 'a-long-enough-pass-1' });
      await h.submit(document.querySelector('form'));
      const [request] = h.called('POST /auth/register/carrier');
      assert.ok(!('role' in request.body) && !('accountType' in request.body));
      await arrive(view, '/carrier');
      await view.unmount();
    });

    test('sign up with Google needs a company name first, then posts the credential to the matching endpoint without any role', async () => {
      withGoogleScript();
      const view = await visit('/register?type=carrier', { routes: { ...googleConfig(true), 'POST /auth/google/register/carrier': signedIn('carrier') } });
      assert.match(document.body.textContent, /Enter your company name above to sign up with Google/);
      assert.equal(document.querySelector('[aria-label="Google button"]'), null);
      await h.fill({ 'Company name': 'Kai Trucking' });
      await h.tick(60);
      assert.equal(gsi.rendered.at(-1).text, 'signup_with');
      await act(async () => gsi.config.callback({ credential: 'signed-google-id-token' }));
      await h.tick(60);
      const [request] = h.called('POST /auth/google/register/carrier');
      assert.deepEqual(request.body, { credential: 'signed-google-id-token', companyName: 'Kai Trucking' });
      await arrive(view, '/carrier');
      await view.unmount();
    });

    test('a Google sign-up for an email that already has an account shows the conflict and creates no session', async () => {
      withGoogleScript();
      const view = await visit('/register', { routes: { ...googleConfig(true), 'POST /auth/google/register/customer': refusal(409, 'An account with this email address already exists.') } });
      await h.fill({ 'Company name': 'Acme' });
      await h.tick(60);
      await act(async () => gsi.config.callback({ credential: 'tok' }));
      await h.tick(60);
      assert.match(document.querySelector('[role="alert"]').textContent, /already exists/);
      assert.equal(view.path(), '/register');
      await view.unmount();
    });
  });
});
