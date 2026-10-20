/**
 * Shared jsdom + Vite + mocked-API harness for the Phase 9 CMS test files. The mocks live only in tests; the app code is
 * exercised through the real router, auth provider and axios client (only the transport adapter is replaced).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'FormData', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  try {
    globalThis[key] = dom.window[key];
  } catch {
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => {};
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));

const require = createRequire(`${ROOT}package.json`);
const React = require('react');
const { createRoot } = require('react-dom/client');
const RR = await import(pathToFileURL(require.resolve('react-router-dom')).href);
export const { act } = React;
export { dom, RR, React };

export const USERS = {
  super_admin: { id: 'u0', firstName: 'Root', lastName: 'Admin', fullName: 'Root Admin', email: 'root@example.com', role: 'super_admin' },
  customer: { id: 'u1', firstName: 'Casey', lastName: 'Customer', fullName: 'Casey Customer', email: 'casey@example.com', role: 'customer' },
  carrier: { id: 'u2', firstName: 'Kai', lastName: 'Carrier', fullName: 'Kai Carrier', email: 'k@example.com', role: 'carrier' },
};
export const page = (items, extra = {}) => ({ items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 }, ...extra });
export const seo = (extra = {}) => ({ title: null, description: null, keywords: [], canonicalUrl: null, ogImage: null, noIndex: false, ...extra });

export async function createHarness() {
  const state = { session: null, calls: [], routes: {}, delayMs: 0, errors: [] };
  const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  const { appRoutes } = await vite.ssrLoadModule('/src/routes/appRoutes.jsx');
  const { AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx');
  const { apiClient } = await vite.ssrLoadModule('/src/services/apiClient.js');
  const { clearContentCache } = await vite.ssrLoadModule('/src/services/contentService.js');
  const originalConsoleError = console.error;

  apiClient.defaults.adapter = async (config) => {
    const { url, method } = config;
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : undefined;
    const key = `${method.toUpperCase()} ${url}`;
    state.calls.push({ key, body, params: config.params, raw: config.data, headers: config.headers });
    const ok = (data, status = 200) => ({ data: { success: true, message: 'OK', ...data }, status, statusText: 'OK', headers: {}, config });
    const fail = (status, data) => {
      const error = new Error('request failed');
      error.response = { status, data: { success: false, errors: [], ...data } };
      throw error;
    };
    if (url === '/auth/me') return state.session ? ok({ data: { user: USERS[state.session], profile: null } }) : fail(401, { message: 'Authentication required.' });
    if (url === '/auth/logout') {
      state.session = null;
      return ok({ data: {} });
    }
    const handler = state.routes[key];
    if (!handler) {
      if (key.startsWith('GET /content/')) return fail(404, { message: 'Not found.', code: 'CONTENT_NOT_FOUND' });
      throw new Error(`unmocked request: ${key}`);
    }
    if (state.delayMs) await new Promise((resolve) => setTimeout(resolve, state.delayMs));
    const result = handler({ body, params: config.params });
    if (result.networkError) throw new Error('Network Error');
    if (result.status && result.status >= 400) return fail(result.status, result.body);
    return ok(result, result.status ?? 200);
  };
  console.error = (...args) => state.errors.push(args.map(String).join(' '));

  const tick = (ms = 30) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
  async function visit(path, { as = 'super_admin', routes = {}, wait = true } = {}) {
    state.session = as;
    state.calls = [];
    state.routes = routes;
    clearContentCache();
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="root"></div>';
    const router = RR.createMemoryRouter(appRoutes, { initialEntries: [path] });
    const root = createRoot(document.getElementById('root'));
    await act(async () => {
      root.render(React.createElement(AuthProvider, null, React.createElement(RR.RouterProvider, { router })));
    });
    await tick();
    for (let attempt = 0; wait && attempt < 80; attempt += 1) {
      const loading = [...document.querySelectorAll('[role="status"]')].some((node) => /^Loading/.test(node.textContent));
      if (document.querySelector('h1') && !loading) break;
      await tick(40);
    }
    await tick();
    return { router, path: () => router.state.location.pathname + router.state.location.search, unmount: () => act(() => root.unmount()) };
  }

  const h = {
    state, vite, visit, tick, clearContentCache,
    main: () => document.querySelector('main#main-content'),
    text: () => document.querySelector('main#main-content')?.textContent ?? '',
    h1: () => document.querySelector('h1')?.textContent ?? '',
    called: (key) => state.calls.filter((call) => call.key === key),
    button: (label, scope = document) => [...scope.querySelectorAll('button')].find((item) => item.textContent.trim() === label || item.getAttribute('aria-label') === label),
    link: (label) => [...document.querySelectorAll('a')].find((item) => item.textContent.trim() === label || item.getAttribute('aria-label') === label),
    dialog: () => document.querySelector('[role="dialog"]'),
    async click(element) {
      assert.ok(element, 'element to click exists');
      await act(async () => element.click());
      await tick(60);
    },
    labelled(label, scope = document) {
      const element = [...scope.querySelectorAll('label')].find((item) => item.textContent.trim().startsWith(label));
      assert.ok(element, `a field labelled "${label}" exists`);
      return document.getElementById(element.htmlFor);
    },
    async fill(fields, scope = document) {
      for (const [label, value] of Object.entries(fields)) {
        const input = h.labelled(label, scope);
        await act(async () => {
          const prototype = input.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
          input.dispatchEvent(new dom.window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
        });
      }
    },
    async submit(form) {
      assert.ok(form, 'form exists');
      await act(async () => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
      await tick(80);
    },
    form: (name) => [...document.querySelectorAll('form')].find((item) => item.getAttribute('aria-label') === name),
    async press(key, target = document.activeElement ?? document.body) {
      await act(async () => target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
      await tick(30);
    },
    async close() {
      console.error = originalConsoleError;
      await vite.close();
    },
  };
  return h;
}
