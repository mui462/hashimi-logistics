/**
 * Cookie consent: the saved choice (expiry, version, Global Privacy Control, blocked storage), the banner and its
 * settings panel, and that optional scripts only load while the visitor allows them. jsdom, no network.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'localStorage', 'sessionStorage', 'location']) {
  try {
    globalThis[key] = dom.window[key];
  } catch {
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(`${ROOT}package.json`);
const React = require('react');
const { createRoot } = require('react-dom/client');
const RR = await import(pathToFileURL(require.resolve('react-router-dom')).href);
const { act } = React;
const h = React.createElement;

const KEY = 'hashimi_cookie_consent';
const DAY = 24 * 60 * 60 * 1000;

describe('cookie consent', () => {
  let vite;
  let store;
  let Provider;
  let useConsent;
  let CookieBanner;
  let AnalyticsLoader;
  let apiClient;
  let ApiRequestError;
  const realStorage = dom.window.localStorage;

  before(async () => {
    vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
    store = await vite.ssrLoadModule('/src/utils/consentStore.js');
    ({ ConsentProvider: Provider, useConsent } = await vite.ssrLoadModule('/src/context/ConsentContext.jsx'));
    ({ default: CookieBanner } = await vite.ssrLoadModule('/src/components/consent/CookieBanner.jsx'));
    ({ default: AnalyticsLoader } = await vite.ssrLoadModule('/src/components/consent/AnalyticsLoader.jsx'));
    ({ apiClient } = await vite.ssrLoadModule('/src/services/apiClient.js'));
    ({ ApiRequestError } = await vite.ssrLoadModule('/src/utils/apiRequestError.js'));
  });
  after(async () => { await vite.close(); });

  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: realStorage, configurable: true });
    delete dom.window.navigator.globalPrivacyControl;
    realStorage.clear();
    dom.window.sessionStorage.clear();
    store.clearConsent();
    document.body.innerHTML = '<div id="root"></div>';
    document.head.innerHTML = '';
  });

  const put = (record) => { realStorage.setItem(KEY, JSON.stringify(record)); window.dispatchEvent(new dom.window.StorageEvent('storage', { key: KEY })); };

  describe('saved choice', () => {
    test('nothing is allowed until the visitor chooses', () => {
      const state = store.getConsentSnapshot();
      assert.equal(state.status, 'unset');
      assert.deepEqual(state.choices, { analytics: false, marketing: false });
      assert.equal(store.hasConsent('analytics'), false);
    });

    test('accept all and reject all are saved in the browser and survive a reload', () => {
      store.acceptAll();
      assert.equal(store.getConsentSnapshot().status, 'saved');
      assert.equal(store.hasConsent('analytics'), true);
      const stored = JSON.parse(realStorage.getItem(KEY));
      assert.equal(stored.version, 1);
      assert.deepEqual(stored.choices, { analytics: true, marketing: true });
      store.rejectAll();
      assert.deepEqual(store.getConsentSnapshot().choices, { analytics: false, marketing: false });
    });

    test('only a literal true allows a category; unknown or malformed values do not', () => {
      store.saveConsent({ analytics: 'yes', marketing: 1, other: true });
      assert.deepEqual(store.getConsentSnapshot().choices, { analytics: false, marketing: false });
    });

    test('the snapshot object is stable until the choice changes (needed by React)', () => {
      const first = store.getConsentSnapshot();
      assert.equal(store.getConsentSnapshot(), first);
      store.acceptAll();
      assert.notEqual(store.getConsentSnapshot(), first);
    });

    test('a choice older than a year, from another version, or corrupt is ignored and the visitor is asked again', () => {
      put({ version: 1, savedAt: Date.now() - 366 * DAY, choices: { analytics: true, marketing: true } });
      assert.equal(store.getConsentSnapshot().status, 'unset');
      put({ version: 99, savedAt: Date.now(), choices: { analytics: true, marketing: true } });
      assert.equal(store.getConsentSnapshot().status, 'unset');
      realStorage.setItem(KEY, '{not json');
      window.dispatchEvent(new dom.window.StorageEvent('storage', { key: KEY }));
      assert.equal(store.getConsentSnapshot().status, 'unset');
      put({ version: 1, savedAt: Date.now() - DAY, choices: { analytics: true, marketing: false } });
      assert.equal(store.getConsentSnapshot().status, 'saved');
      assert.equal(store.hasConsent('analytics'), true);
    });

    test('a choice made in another tab is picked up', () => {
      put({ version: 1, savedAt: Date.now(), choices: { analytics: true, marketing: false } });
      assert.equal(store.hasConsent('analytics'), true);
      assert.equal(store.hasConsent('marketing'), false);
    });

    test('Global Privacy Control keeps optional categories off without asking, and an explicit choice still wins', () => {
      Object.defineProperty(dom.window.navigator, 'globalPrivacyControl', { value: true, configurable: true });
      store.clearConsent();
      assert.equal(store.getConsentSnapshot().status, 'gpc');
      assert.equal(store.hasConsent('analytics'), false);
      store.acceptAll();
      assert.equal(store.getConsentSnapshot().status, 'saved');
      assert.equal(store.hasConsent('analytics'), true);
    });

    test('blocked storage does not break anything; the choice applies for the current session', () => {
      Object.defineProperty(globalThis, 'localStorage', { value: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } }, configurable: true });
      assert.doesNotThrow(() => store.acceptAll());
      assert.equal(store.hasConsent('analytics'), true);
    });
  });

  describe('banner', () => {
    async function mount(...children) {
      const root = createRoot(document.getElementById('root'));
      await act(async () => root.render(h(RR.MemoryRouter, null, h(Provider, null, ...children))));
      return { unmount: () => act(() => root.unmount()) };
    }
    const button = (label) => [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === label);
    const click = (element) => act(async () => { element.click(); });
    const dialog = () => document.querySelector('[role="dialog"]');

    test('is shown to a first-time visitor with reject and accept given equal weight', async () => {
      const view = await mount(h(CookieBanner));
      assert.ok(dialog(), 'the banner is shown');
      assert.ok(button('Reject all') && button('Accept all') && button('Customize'));
      for (const token of ['min-h-11', 'px-5', 'flex-1', 'rounded-full', 'font-bold']) {
        assert.ok(button('Reject all').className.includes(token) && button('Accept all').className.includes(token), `reject and accept share "${token}"`);
      }
      assert.ok(!dialog().className.includes('inset-0') && !dialog().className.includes('w-full'), 'a corner card, not a full-screen overlay');
      assert.ok(document.querySelector('a[href="/privacy-policy"]'), 'links to the privacy policy');
      assert.equal(store.getConsentSnapshot().status, 'unset', 'showing it saves nothing');
      await view.unmount();
    });

    test('Reject all saves "no" and closes the banner', async () => {
      const view = await mount(h(CookieBanner));
      await click(button('Reject all'));
      assert.equal(dialog(), null);
      assert.deepEqual(JSON.parse(realStorage.getItem(KEY)).choices, { analytics: false, marketing: false });
      await view.unmount();
    });

    test('Accept all saves "yes" and closes the banner', async () => {
      const view = await mount(h(CookieBanner));
      await click(button('Accept all'));
      assert.equal(dialog(), null);
      assert.deepEqual(JSON.parse(realStorage.getItem(KEY)).choices, { analytics: true, marketing: true });
      await view.unmount();
    });

    test('Customize: necessary is on and locked, optional ones start off, and Save stores exactly what was ticked', async () => {
      const view = await mount(h(CookieBanner));
      await click(button('Customize'));
      const necessary = document.getElementById('cookie-necessary');
      assert.ok(necessary.checked && necessary.disabled);
      assert.equal(document.getElementById('cookie-analytics').checked, false);
      assert.equal(document.getElementById('cookie-marketing').checked, false);
      await click(document.getElementById('cookie-analytics'));
      await click(button('Save choices'));
      assert.equal(dialog(), null);
      assert.deepEqual(JSON.parse(realStorage.getItem(KEY)).choices, { analytics: true, marketing: false });
      await view.unmount();
    });

    test('is not shown again once the visitor has chosen', async () => {
      store.rejectAll();
      const view = await mount(h(CookieBanner));
      assert.equal(dialog(), null);
      await view.unmount();
    });

    test('is not shown outside the public website (no provider)', async () => {
      const root = createRoot(document.getElementById('root'));
      await act(async () => root.render(h(RR.MemoryRouter, null, h(CookieBanner))));
      assert.equal(dialog(), null);
      await act(() => root.unmount());
    });

    const closeButton = () => document.querySelector('button[aria-label="Close cookie banner"]');

    test('the X closes the banner without choosing: nothing is saved and optional cookies stay off', async () => {
      const view = await mount(h(CookieBanner));
      assert.ok(closeButton(), 'there is a close button');
      await click(closeButton());
      assert.equal(dialog(), null);
      assert.equal(realStorage.getItem(KEY), null, 'no choice was recorded');
      assert.equal(store.getConsentSnapshot().status, 'unset');
      assert.equal(store.hasConsent('analytics'), false);
      assert.equal(dom.window.sessionStorage.getItem('hashimi_cookie_banner_dismissed'), '1', 'remembered for this session only');
      await view.unmount();
    });

    test('a closed banner stays away, then comes back asking for a choice when the visitor does something that uses cookies', async () => {
      const view = await mount(h(CookieBanner));
      await click(closeButton());
      assert.equal(dialog(), null);
      let outcome;
      await act(async () => { store.ensureConsentChoice().then((value) => { outcome = value; }); });
      assert.ok(dialog(), 'the banner is back');
      assert.match(document.querySelector('[role="status"]').textContent, /choose an option to continue/i);
      assert.equal(outcome, undefined, 'the action is waiting');
      await click(button('Accept all'));
      assert.equal(outcome, true, 'the action goes ahead once they choose');
      assert.equal(dialog(), null);
      await view.unmount();
    });

    test('closing the banner again while an action waits cancels that action and saves nothing', async () => {
      const view = await mount(h(CookieBanner));
      await click(closeButton());
      let outcome;
      await act(async () => { store.ensureConsentChoice().then((value) => { outcome = value; }); });
      await click(closeButton());
      assert.equal(outcome, false);
      assert.equal(dialog(), null);
      assert.equal(realStorage.getItem(KEY), null);
      await view.unmount();
    });

    test('nothing waits when the visitor has already chosen, when Global Privacy Control answered, or when no banner is on the page', async () => {
      assert.equal(await store.ensureConsentChoice(), true, 'no banner mounted: never hold an action up');
      const view = await mount(h(CookieBanner));
      store.rejectAll();
      assert.equal(await store.ensureConsentChoice(), true, 'already chosen');
      store.clearConsent();
      Object.defineProperty(dom.window.navigator, 'globalPrivacyControl', { value: true, configurable: true });
      store.clearConsent();
      assert.equal(await store.ensureConsentChoice(), true, 'Global Privacy Control');
      await view.unmount();
    });

    test('API calls that change data wait for the choice; reads, signing out and the assistant never do', async () => {
      const seen = [];
      apiClient.defaults.adapter = async (config) => { seen.push(`${config.method} ${config.url}`); return { data: { success: true, data: {} }, status: 200, statusText: 'OK', headers: {}, config }; };
      const view = await mount(h(CookieBanner));
      await click(closeButton()); // dismissed, so the next write must bring it back

      await apiClient.get('/content/homepage');
      await apiClient.post('/auth/logout');
      await apiClient.post('/chatbot/messages', { messages: [] });
      assert.deepEqual(seen, ['get /content/homepage', 'post /auth/logout', 'post /chatbot/messages']);
      assert.equal(dialog(), null, 'none of those asked');

      seen.length = 0;
      let login;
      await act(async () => { login = apiClient.post('/auth/login', {}); });
      assert.ok(dialog(), 'signing in brings the banner back');
      assert.deepEqual(seen, [], 'the request has not been sent');
      await click(button('Reject all'));
      await login;
      assert.deepEqual(seen, ['post /auth/login'], 'sent once they chose');
      assert.equal(store.hasConsent('analytics'), false, 'rejecting still lets them sign in');

      // Once chosen, nothing is asked again.
      await apiClient.post('/quotes', {});
      assert.equal(dialog(), null);
      await view.unmount();
    });

    test('closing the banner on a waiting sign-in cancels it with a clear message', async () => {
      apiClient.defaults.adapter = async (config) => ({ data: {}, status: 200, statusText: 'OK', headers: {}, config });
      const view = await mount(h(CookieBanner));
      await click(closeButton());
      let failure;
      await act(async () => { apiClient.post('/auth/register', {}).catch((error) => { failure = error; }); });
      await click(closeButton());
      assert.ok(failure instanceof ApiRequestError);
      assert.equal(failure.code, 'COOKIE_CHOICE_REQUIRED');
      assert.match(failure.message, /choose a cookie option/i);
      await view.unmount();
    });

    test('Cookie settings reopens it with the current choices; Escape closes it without changing anything', async () => {
      store.saveConsent({ analytics: true, marketing: false });
      const Opener = () => { const consent = useConsent(); return h('button', { id: 'opener', onClick: consent.openSettings }, 'Cookie settings'); };
      const view = await mount(h(Opener), h(CookieBanner));
      assert.equal(dialog(), null);
      document.getElementById('opener').focus(); // a real click focuses the button; jsdom's click() does not
      await click(document.getElementById('opener'));
      assert.ok(dialog(), 'reopened');
      assert.equal(document.getElementById('cookie-analytics').checked, true, 'shows what is currently allowed');
      assert.equal(document.getElementById('cookie-marketing').checked, false);
      assert.ok(document.activeElement === dialog(), 'focus moves into the panel');
      await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      assert.equal(dialog(), null);
      assert.ok(document.activeElement === document.getElementById('opener'), 'focus returns to the button');
      assert.deepEqual(store.getConsentSnapshot().choices, { analytics: true, marketing: false });
      await view.unmount();
    });
  });

  describe('optional scripts', () => {
    const scripts = () => [...document.head.querySelectorAll('script[data-consent-category="analytics"]')];
    async function mount(element) {
      const root = createRoot(document.getElementById('root'));
      await act(async () => root.render(h(Provider, null, element)));
      return { unmount: () => act(() => root.unmount()) };
    }

    test('Google Analytics is not loaded before consent, loads after "accept", and is removed when consent is withdrawn', async () => {
      const view = await mount(h(AnalyticsLoader, { measurementId: 'G-TEST1234' }));
      assert.equal(scripts().length, 0, 'nothing before the visitor chooses');
      await act(async () => store.acceptAll());
      assert.equal(scripts().length, 1);
      assert.match(scripts()[0].src, /googletagmanager\.com\/gtag\/js\?id=G-TEST1234$/);
      await act(async () => store.rejectAll());
      assert.equal(scripts().length, 0, 'removed after withdrawing');
      assert.equal(window['ga-disable-G-TEST1234'], true, 'collection is switched off');
      await view.unmount();
    });

    test('rejecting never loads it', async () => {
      const view = await mount(h(AnalyticsLoader, { measurementId: 'G-TEST1234' }));
      await act(async () => store.rejectAll());
      assert.equal(scripts().length, 0);
      await view.unmount();
    });

    test('a missing or malformed measurement ID never loads anything, even with consent', async () => {
      store.acceptAll();
      for (const measurementId of ['', 'UA-1', 'G-<script>']) {
        const view = await mount(h(AnalyticsLoader, { measurementId }));
        assert.equal(scripts().length, 0, `"${measurementId}"`);
        await view.unmount();
      }
    });
  });
});
