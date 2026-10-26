/**
 * Phase 4 public website: navigation, homepage, content pages, forms, tracking, FAQ, resources, SEO and
 * accessibility basics. Rendered in jsdom against a mocked API (mocks live only in this test file).
 * jsdom has no layout engine, so visual/responsive checks are done separately (see docs/PHASE_4_PUBLIC_WEBSITE.md).
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
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

describe('Phase 4 public website', () => {
  let vite;
  let appRoutes;
  let AuthProvider;
  let apiClient;
  let clearContentCache;
  let HeroMedia;
  let TestimonialSection;
  let StatsSection;
  let calls = [];
  let handler = null;
  const errors = [];
  const originalConsoleError = console.error;
  const tick = (ms = 30) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

  before(async () => {
    vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
    ({ appRoutes } = await vite.ssrLoadModule('/src/routes/appRoutes.jsx'));
    ({ AuthProvider } = await vite.ssrLoadModule('/src/context/AuthContext.jsx'));
    ({ apiClient } = await vite.ssrLoadModule('/src/services/apiClient.js'));
    ({ clearContentCache } = await vite.ssrLoadModule('/src/services/contentService.js'));
    ({ default: HeroMedia } = await vite.ssrLoadModule('/src/components/media/HeroMedia.jsx'));
    ({ default: TestimonialSection } = await vite.ssrLoadModule('/src/components/sections/TestimonialSection.jsx'));
    ({ default: StatsSection } = await vite.ssrLoadModule('/src/components/sections/StatsSection.jsx'));

    apiClient.defaults.adapter = async (config) => {
      const { url, method } = config;
      const isJson = typeof config.data === 'string';
      calls.push({ key: `${method.toUpperCase()} ${url}`, body: isJson ? JSON.parse(config.data) : undefined, form: isJson ? undefined : config.data, params: config.params });
      const ok = (data, status = 200) => ({ data, status, statusText: 'OK', headers: {}, config });
      const fail = (status, data = { success: false, message: 'Request failed.', errors: [] }) => {
        const error = new Error('request failed');
        error.response = { status, data };
        throw error;
      };
      if (url === '/auth/me') return fail(401, { success: false, message: 'Authentication required.', errors: [] });
      if (handler) {
        const handled = handler({ url, method, ok, fail, params: config.params });
        if (handled) return handled;
      }
      return fail(404, { success: false, message: 'Not found.', errors: [] });
    };
    // jsdom does not implement media playback; stub play() so HeroMedia's real code path runs.
    dom.window.HTMLMediaElement.prototype.play = () => Promise.resolve();
    console.error = (...args) => errors.push(args.map(String).join(' '));
  });

  after(async () => {
    console.error = originalConsoleError;
    await vite.close();
  });

  async function visit(path) {
    calls = [];
    clearContentCache();
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="root"></div>';
    const router = RR.createMemoryRouter(appRoutes, { initialEntries: [path] });
    const root = createRoot(document.getElementById('root'));
    await act(async () => {
      root.render(React.createElement(AuthProvider, null, React.createElement(RR.RouterProvider, { router })));
    });
    await tick();
    for (let attempt = 0; attempt < 60 && !document.querySelector('main h1'); attempt += 1) await tick(50);
    return { router, unmount: () => act(() => root.unmount()) };
  }

  async function render(element) {
    document.body.innerHTML = '<div id="root"></div>';
    const root = createRoot(document.getElementById('root'));
    await act(async () => root.render(element));
    return { unmount: () => act(() => root.unmount()) };
  }

  const text = () => document.body.textContent;
  const labelled = (label) => {
    const element = [...document.querySelectorAll('label')].find((item) => item.textContent.startsWith(label));
    assert.ok(element, `a field labelled "${label}" exists`);
    return document.getElementById(element.htmlFor);
  };
  async function fill(fields) {
    for (const [label, value] of Object.entries(fields)) {
      const input = labelled(label);
      await act(async () => {
        const proto = input.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
        input.dispatchEvent(new dom.window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      });
    }
  }
  async function click(label, scope = document) {
    const el = [...scope.querySelectorAll('button, a')].find((item) => item.textContent.trim().includes(label));
    assert.ok(el, `"${label}" control exists`);
    await act(async () => el.click());
    await tick(60);
  }
  async function choose(labelText) {
    const label = [...document.querySelectorAll('fieldset label')].find((item) => item.textContent.trim() === labelText);
    assert.ok(label, `choice "${labelText}" exists`);
    await act(async () => label.querySelector('input').click());
  }
  const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const lastCall = (key) => [...calls].reverse().find((call) => call.key === key);

  const PAGES = ['/', '/about', '/services', '/services/full-truckload', '/services/ltl', '/services/dry-van', '/services/reefer', '/services/flatbed', '/services/expedited', '/services/specialized', '/services/cross-border', '/industries', '/industries/manufacturing', '/industries/construction', '/industries/automotive', '/industries/retail', '/industries/food-beverage', '/industries/agriculture', '/industries/industrial', '/industries/consumer-goods', '/service-areas', '/for-shippers', '/for-carriers', '/how-it-works', '/track-shipment', '/request-quote', '/become-a-carrier', '/carrier-resources', '/resources', '/faq', '/contact', '/privacy-policy', '/terms'];

  describe('every public page', () => {
    test('has one h1, no skipped heading levels, named controls, unique ids, and its own title and description', async () => {
      const titles = new Set();
      for (const path of PAGES) {
        const page = await visit(path);
        assert.equal(document.querySelectorAll('h1').length, 1, `${path}: exactly one h1`);
        const levels = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => Number(h.tagName[1]));
        levels.forEach((level, i) => assert.ok(i === 0 || level - levels[i - 1] <= 1, `${path}: heading jump ${levels[i - 1]}→${level}`));
        for (const el of document.querySelectorAll('button, a[href]')) {
          assert.ok((el.textContent.trim() || el.getAttribute('aria-label')), `${path}: unnamed control ${el.outerHTML.slice(0, 80)}`);
        }
        for (const img of document.querySelectorAll('img')) assert.ok(img.hasAttribute('alt'), `${path}: img without alt`);
        const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
        assert.equal(new Set(ids).size, ids.length, `${path}: duplicate ids ${ids.filter((x, i) => ids.indexOf(x) !== i)}`);
        assert.ok(document.querySelectorAll('main').length === 1, `${path}: one main landmark`);
        assert.ok(document.title.includes('HASHIMI LOGISTICS INC.'), `${path}: title`);
        titles.add(document.title);
        assert.ok(document.head.querySelector('meta[name="description"]')?.content.length > 20, `${path}: description`);
        assert.ok(document.head.querySelector('meta[name="robots"]'), `${path}: robots`);
        await page.unmount();
      }
      assert.equal(titles.size, PAGES.length, 'every page has a unique title');
    });

    test('service and industry pages come from one template each and cover every catalogue entry', async () => {
      const { services } = await vite.ssrLoadModule('/src/content/services.js');
      const { industries } = await vite.ssrLoadModule('/src/content/industries.js');
      assert.equal(services.length, 8);
      assert.equal(industries.length, 8);
      for (const section of ['What We Handle', 'Benefits', 'Equipment', 'Industries Served', 'How It Works']) {
        const page = await visit('/services/reefer');
        assert.ok([...document.querySelectorAll('h2')].some((h) => h.textContent.includes(section)), `service page has "${section}"`);
        await page.unmount();
      }
      for (const section of ['Overview', 'Typical Freight', 'Transportation Considerations', 'Relevant Services']) {
        const page = await visit('/industries/retail');
        assert.ok([...document.querySelectorAll('h2')].some((h) => h.textContent.includes(section)), `industry page has "${section}"`);
        await page.unmount();
      }
    });

    test('pages never show invented figures, awards, years or testimonials', async () => {
      const banned = /\d+\+|\byears\b|award|certified|ISO ?\d|testimonial|\b24\/7\b|\bMC ?#?\d|\bDOT ?#?\d/i;
      for (const path of ['/', '/about', '/services', '/for-shippers', '/for-carriers', '/service-areas']) {
        const page = await visit(path);
        const main = document.querySelector('main').textContent;
        assert.ok(!banned.test(main.replace(/Testimonials?/g, '')), `${path}: ${main.match(banned)?.[0]}`);
        await page.unmount();
      }
    });
  });

  describe('navigation', () => {
    const header = () => document.querySelector('header');
    const navVar = (name) => header().style.getPropertyValue(name);
    const scrollTo = async (y) => {
      Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
      await act(async () => window.dispatchEvent(new dom.window.Event('scroll')));
    };
    const withAppearance = (appearance) => {
      handler = ({ url, ok }) => (url === '/content/site-settings' ? ok({ success: true, data: { configured: false, navbarAppearance: appearance } }) : null);
    };
    const FORMER_ROUTES = ['/', '/about', '/services', '/industries', '/service-areas', '/for-shippers', '/for-carriers', '/resources', '/track-shipment', '/become-a-carrier', '/request-quote'];

    test('two rows: logo and the actions (Sign In menu, Track Shipment, Request a Quote) on top, the main links (with a More dropdown) below; every former route stays reachable', async () => {
      const page = await visit('/services/ltl');
      const nav = document.querySelector('nav[aria-label="Primary"]');
      const topLevel = [...nav.querySelectorAll(':scope > div > ul > li')].map((li) => li.firstElementChild.textContent.trim());
      assert.deepEqual(topLevel, ['Home', 'About', 'Services', 'Industries', 'Service Areas', 'For Shippers', 'For Carriers', 'How It Works', 'Resources', 'Contact', 'More']);
      const solutions = [...nav.querySelectorAll('button[aria-expanded]')].find((b) => b.textContent.includes('More'));
      const menu = document.getElementById(solutions.getAttribute('aria-controls'));
      assert.deepEqual([...menu.querySelectorAll('a')].map((a) => a.textContent), ['Become a Carrier', 'FAQ']);
      assert.deepEqual([...nav.querySelectorAll('a[aria-current="page"]')].map((a) => a.textContent), ['Services']);
      const hrefs = new Set([...header().querySelectorAll('a[href]')].map((a) => a.getAttribute('href')));
      for (const route of FORMER_ROUTES) assert.ok(hrefs.has(route), `header still links to ${route}`);
      const track = [...header().querySelectorAll('a')].find((a) => a.textContent === 'Track Shipment');
      const quote = [...header().querySelectorAll('a')].find((a) => a.textContent === 'Request a Quote');
      assert.equal(track.getAttribute('href'), '/track-shipment');
      assert.equal(quote.getAttribute('href'), '/request-quote');
      const login = (label) => [...header().querySelectorAll('a')].find((x) => x.textContent === label);
      assert.equal(login('Customer Sign In').getAttribute('href'), '/login?portal=customer&step=choose');
      assert.equal(login('Carrier Sign In').getAttribute('href'), '/login?portal=carrier&step=choose');
      assert.equal(login('Super Admin Sign In').getAttribute('href'), '/admin/login');
      const signIn = [...header().querySelectorAll('button[aria-expanded]')].find((b) => b.textContent.includes('Sign In'));
      assert.ok(signIn, 'the Sign In menu button exists in the top row');
      assert.ok(!nav.contains(track) && !nav.contains(login('Carrier Sign In')) && !nav.contains(signIn), 'actions live in the top row, not the link row');
      assert.ok(header().querySelector('a[aria-label$="home"][href="/"]'), 'logo links home');
      await page.unmount();
    });

    test('the More dropdown opens from the keyboard or a click, marks its active child, and closes on Escape with focus returned', async () => {
      const page = await visit('/faq');
      const solutions = [...document.querySelectorAll('nav[aria-label="Primary"] button')].find((b) => b.textContent.includes('More'));
      const panel = document.getElementById(solutions.getAttribute('aria-controls')).parentElement;
      assert.equal(solutions.getAttribute('aria-expanded'), 'false');
      assert.match(panel.className, /\bhidden\b/);
      assert.match(solutions.className, /nav-link-active/, 'the group is marked active on one of its pages');
      await act(async () => solutions.click());
      assert.equal(solutions.getAttribute('aria-expanded'), 'true');
      assert.doesNotMatch(panel.className, /\bhidden\b/);
      assert.equal(panel.querySelector('a[aria-current="page"]').textContent, 'FAQ');
      solutions.focus();
      await act(async () => solutions.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      assert.equal(solutions.getAttribute('aria-expanded'), 'false');
      assert.equal(document.activeElement, solutions);
      await page.unmount();
    });

    test('with no saved settings (or the settings API down) it is a solid graphite bar at every scroll position', async () => {
      const page = await visit('/');
      assert.equal(header().dataset.navbarState, 'solid');
      assert.equal(navVar('--nav-bg'), '#22252A');
      assert.equal(navVar('--nav-blur'), '0px');
      assert.equal(navVar('--nav-quote-bg'), 'rgba(216, 173, 84, 1)', 'gold Request a Quote');
      assert.equal(navVar('--nav-track-bg'), 'rgba(216, 173, 84, 0)', 'outlined Track Shipment');
      assert.doesNotMatch(header().getAttribute('style'), /#0C1B2B|#11263C|rgba\(12, 27, 43|navy/i, 'no navy tint');
      await scrollTo(200);
      assert.equal(header().dataset.navbarState, 'solid');
      assert.equal(navVar('--nav-bg'), '#22252A');
      await scrollTo(0);
      assert.equal(header().dataset.navbarState, 'solid', 'still solid back at the top');
      await page.unmount();
    });

    test('applies the saved appearance from the site settings, and ignores malformed values', async () => {
      withAppearance({ scrolled: { backgroundColor: '#303030', textColor: 'red;}*{display:none', scrollThreshold: 9999 }, quoteButton: { backgroundColor: '#C9A045' } });
      const page = await visit('/');
      assert.equal(navVar('--nav-bg'), '#303030', 'a saved colour is used');
      assert.equal(navVar('--nav-text'), '#FFFFFF', 'a malformed colour falls back to the default');
      assert.equal(navVar('--nav-quote-bg'), 'rgba(201, 160, 69, 1)');
      assert.equal(navVar('--nav-blur'), '0px');
      handler = null;
      await page.unmount();
    });

    test('the bar is solid whatever the switches say: a saved "transparent over the hero" is an old default and is ignored', async () => {
      for (const appearance of [{ hero: { transparentEnabled: false } }, { hero: { transparentEnabled: true } }, { scrolled: { solidEnabled: false } }]) {
        withAppearance(appearance);
        const page = await visit('/');
        assert.equal(header().dataset.navbarState, 'solid', JSON.stringify(appearance));
        await scrollTo(500);
        assert.equal(header().dataset.navbarState, 'solid', JSON.stringify(appearance));
        await scrollTo(0);
        handler = null;
        await page.unmount();
      }
    });

    test('mobile menu: every link (the dropdown included) and both actions, page scroll locked while open, Escape closes and returns focus, navigating closes it', async () => {
      const page = await visit('/');
      const toggle = document.querySelector('button[aria-controls="mobile-menu"]');
      assert.equal(toggle.getAttribute('aria-label'), 'Open menu');
      await act(async () => toggle.click());
      let menu = document.getElementById('mobile-menu');
      assert.equal(toggle.getAttribute('aria-expanded'), 'true');
      assert.equal(toggle.getAttribute('aria-label'), 'Close menu');
      assert.equal(header().dataset.navbarState, 'solid', 'the open menu is always solid');
      assert.equal(document.body.style.overflow, 'hidden');
      assert.deepEqual([...menu.querySelectorAll('nav > ul > li > a')].map((a) => a.textContent), ['Home', 'About', 'Services', 'Industries', 'Service Areas', 'For Shippers', 'For Carriers', 'How It Works', 'Resources', 'Contact']);
      const group = menu.querySelector('nav button[aria-expanded]');
      assert.equal(group.textContent.trim(), 'More');
      const sublist = document.getElementById(group.getAttribute('aria-controls'));
      assert.equal(sublist.hidden, true);
      await act(async () => group.click());
      assert.equal(sublist.hidden, false);
      assert.deepEqual([...sublist.querySelectorAll('a')].map((a) => a.textContent), ['Become a Carrier', 'FAQ']);
      assert.ok(menu.querySelector('a[href="/request-quote"]') && menu.querySelector('a[href="/track-shipment"]'));
      assert.ok(menu.querySelector('a[href="/login?portal=carrier&step=choose"]') && menu.querySelector('a[href="/login?portal=customer&step=choose"]') && menu.querySelector('a[href="/admin/login"]'), 'the three sign-in options are in the menu');
      await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' })));
      assert.equal(document.getElementById('mobile-menu'), null);
      assert.equal(document.activeElement, toggle);
      assert.equal(document.body.style.overflow, '', 'page scrolling is restored');

      await act(async () => toggle.click());
      menu = document.getElementById('mobile-menu');
      await act(async () => [...menu.querySelectorAll('a')].find((a) => a.textContent === 'About').click());
      await tick(60);
      assert.equal(page.router.state.location.pathname, '/about');
      assert.equal(document.getElementById('mobile-menu'), null, 'the menu closes after navigating');
      assert.equal(document.body.style.overflow, '');
      await page.unmount();
    });
  });

  describe('approved branding colours', () => {
    test('the built-in logo mark keeps its original navy and gold; the home hero keeps its original golds; inner heroes follow the site gold', async () => {
      let page = await visit('/');
      const mark = document.querySelector('header a[aria-label$="home"] svg');
      assert.ok(mark, 'built-in mark shown (no CMS logo in tests)');
      assert.match(mark.innerHTML, /stroke-\[#f2a900\]/);
      assert.match(mark.innerHTML, /fill-\[#11263c\]/, 'navy tile');
      assert.match(mark.innerHTML, /stroke-white/, 'the second chevron is white on the navy tile (navy only on the dark-footer variant)');
      const hero = document.querySelector('[data-hero="home"]');
      const subtitle = [...hero.querySelectorAll('p')].find((p) => /font-semibold/.test(p.className));
      assert.match(subtitle.className, /text-\[#ffc233\]/);
      assert.equal(hero.querySelector('.lane-rule').style.getPropertyValue('--color-signal-400'), '#ffc233');
      await page.unmount();
      page = await visit('/about');
      const inner = document.querySelector('[data-hero="page"]');
      assert.doesNotMatch(inner.innerHTML, /#ffc233|#f2a900/i, 'inner-page heroes use the site theme gold');
      await page.unmount();
    });
  });

  describe('animation system', () => {
    test('sections reveal with one shared, staggered, capped animation; content is visible without IntersectionObserver; reduced motion and print show everything', async () => {
      const page = await visit('/');
      const delays = (selector) => [...document.querySelectorAll(`${selector} .reveal`)].map((el) => el.style.getPropertyValue('--reveal-delay') || '0ms');
      assert.ok(document.querySelectorAll('main .reveal').length > 20, 'homepage sections use the shared Reveal');
      assert.ok([...document.querySelectorAll('main .reveal')].every((el) => el.dataset.visible === 'true'), 'without IntersectionObserver nothing is left hidden');
      assert.deepEqual(delays('#services li').slice(0, 5), ['0ms', '80ms', '160ms', '240ms', '0ms'], 'cards in a row are staggered, each row starts again');
      assert.ok([...document.querySelectorAll('main .reveal')].every((el) => parseInt(el.style.getPropertyValue('--reveal-delay') || '0', 10) <= 400), 'no delay over 400ms');
      assert.ok(!document.querySelector('main .reveal[class*="transition-"]'), 'no transition utility on a Reveal element (it would cancel the entrance)');
      await page.unmount();
      const { readFileSync } = await import('node:fs');
      const css = readFileSync(`${ROOT}src/index.css`, 'utf8');
      assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*\.reveal\s*\{\s*opacity: 1;\s*transform: none;/);
      assert.match(css, /@media print\s*\{\s*\.reveal\s*\{\s*opacity: 1;/);
    });
  });

  describe('homepage', () => {
    test('without a CMS homepage the hero keeps its own media and buttons under a light neutral black overlay, with no navy layers', async () => {
      const page = await visit('/');
      const hero = document.querySelector('[data-hero="home"]');
      const overlays = hero.querySelectorAll('[data-testid="hero-overlay"]');
      assert.equal(overlays.length, 1);
      assert.equal(overlays[0].style.backgroundColor, 'rgb(0, 0, 0)');
      assert.equal(overlays[0].style.opacity, '0.3');
      assert.doesNotMatch(hero.innerHTML.replace(/<svg[\s\S]*?<\/svg>/g, ''), /\b(bg|from|via|to)-ink-\d/, 'no navy background or gradient layers over the home hero (the illustrated scene excluded)');
      assert.match(hero.className, /\bbg-black\b/);
      assert.ok(hero.querySelector('[data-testid="hero-media"]'), 'the hero media is still rendered');
      assert.deepEqual([...hero.querySelectorAll('a')].map((a) => a.getAttribute('href')), ['/request-quote', '/become-a-carrier']);
      await page.unmount();
    });

    test('renders every section in the required order with the required copy', async () => {
      const page = await visit('/');
      const order = ['header', '[data-hero="home"]', 'section[aria-label]', '#services', '#why-hashimi', '#how-it-works', '#industries', '#cross-border', '#service-areas', '#statistics', '#cta', '#network', '#get-a-quote', '#faq-preview', 'footer'];
      const positions = order.map((selector) => {
        const el = document.querySelector(selector);
        assert.ok(el, `${selector} exists`);
        return el;
      });
      positions.forEach((el, i) => i > 0 && assert.ok(positions[i - 1].compareDocumentPosition(el) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, `${order[i]} follows ${order[i - 1]}`));
      for (const copy of ['Freight Brokerage & Transportation Solutions', 'Domestic & Cross-Border Freight Solutions Across North America', 'Reliable Capacity', 'Nationwide Coverage', 'Cross-Border Expertise', 'Responsive Service', 'Freight Solutions Built Around Your Shipment', 'Transportation You Can Count On', 'Tell Us About Your Shipment', 'We Coordinate Transportation', 'Your Freight Moves', 'Stay Informed', 'Freight Expertise Across Industries', 'Cross-Border Freight Across North America', 'Coverage Across North America', 'Ready to Move Your Freight?', 'Tell us what you need to move and our team will help coordinate the right transportation solution.']) {
        assert.ok(text().includes(copy), `homepage contains "${copy}"`);
      }
      assert.equal(document.querySelectorAll('#services li article, #services > div ul > li').length >= 8, true);
      assert.equal(document.querySelectorAll('#industries ul > li').length, 8);
      assert.ok(!document.getElementById('testimonials'), 'no testimonials are shown when none are published');
      await page.unmount();
    });

    test('hero works without any video: no video element, illustrated fallback, both CTAs, h1 is the company name', async () => {
      const page = await visit('/');
      assert.equal(document.querySelector('video'), null);
      assert.equal(document.querySelector('[data-testid="hero-media"]').dataset.videoState, 'none');
      assert.ok(document.querySelector('[data-hero="home"] svg'));
      assert.equal(document.querySelector('h1').textContent, 'HASHIMI LOGISTICS INC.');
      await page.unmount();
    });

    test('FAQ preview accordion opens and closes with correct ARIA state', async () => {
      const page = await visit('/');
      const button = document.querySelector('#faq-preview button[aria-expanded]');
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      assert.equal(button.getAttribute('aria-expanded'), 'false');
      assert.equal(panel.hidden, true);
      await act(async () => button.click());
      assert.equal(button.getAttribute('aria-expanded'), 'true');
      assert.equal(panel.hidden, false);
      await act(async () => button.click());
      assert.equal(panel.hidden, true);
      await page.unmount();
    });

    test('footer shows brand, links and legal links; contact details only when configured', async () => {
      const page = await visit('/');
      const footer = document.querySelector('footer');
      for (const label of ['About', 'Services', 'Industries', 'Service Areas', 'For Shippers', 'For Carriers', 'Resources', 'Track Shipment', 'Request a Quote', 'Contact', 'Privacy Policy', 'Terms']) {
        assert.ok([...footer.querySelectorAll('a')].some((a) => a.textContent === label), `footer link ${label}`);
      }
      assert.ok(!footer.querySelector('a[href^="tel:"], a[href^="mailto:"]'), 'no invented phone or email');
      assert.ok(!footer.querySelector('a[target="_blank"]'), 'no invented social links');
      assert.ok(footer.textContent.includes('Contact details will be published here'));
      await page.unmount();
    });
  });

  describe('reusable CMS-ready components', () => {
    test('HeroMedia: a configured video is muted, looping, inline, has a poster, and is removed if it fails', async () => {
      const media = { videoSrc: '/x.mp4', videoType: 'video/mp4', posterSrc: '/poster.jpg', posterAlt: '' };
      const view = await render(React.createElement(HeroMedia, { media }));
      const video = document.querySelector('video');
      assert.ok(video);
      assert.equal(video.muted, true);
      assert.equal(video.loop, true);
      assert.ok(video.hasAttribute('playsinline'));
      assert.ok(video.autoplay);
      assert.equal(video.getAttribute('poster'), '/poster.jpg');
      assert.equal(video.getAttribute('preload'), 'metadata');
      assert.ok(document.querySelector('img[src="/poster.jpg"]'), 'poster image paints underneath');
      await act(async () => video.dispatchEvent(new dom.window.Event('error')));
      assert.equal(document.querySelector('video'), null, 'failed video is dropped');
      assert.ok(document.querySelector('img[src="/poster.jpg"]'), 'poster remains');
      await view.unmount();
    });

    test('TestimonialSection hides with no data, renders real data when given, and can show an honest empty state', async () => {
      let view = await render(React.createElement(TestimonialSection, { testimonials: [] }));
      assert.equal(document.querySelector('section'), null);
      await view.unmount();
      view = await render(React.createElement(TestimonialSection, { testimonials: [], showEmpty: true }));
      assert.match(text(), /No testimonials published yet/);
      await view.unmount();
      view = await render(React.createElement(TestimonialSection, { testimonials: [{ id: '1', quote: 'Test quote', name: 'Test Name' }] }));
      assert.match(text(), /Test quote/);
      await view.unmount();
    });

    test('StatsSection shows no figures by default, can show real ones when supplied, and can be disabled', async () => {
      const { stats } = await vite.ssrLoadModule('/src/content/home.js');
      assert.deepEqual(stats.items.filter((i) => i.value), [], 'no numeric statistics ship by default');
      let view = await render(React.createElement(StatsSection, { stats }));
      assert.match(text(), /North American Coverage/);
      assert.doesNotMatch(document.querySelector('section').textContent, /\d/, 'no digits at all in the default statistics');
      await view.unmount();
      view = await render(React.createElement(StatsSection, { stats: { title: 'Custom', items: [{ icon: 'truck', value: '999', label: 'Sentinel stat' }] } }));
      assert.match(text(), /999/);
      assert.match(text(), /Sentinel stat/);
      await view.unmount();
      view = await render(React.createElement(StatsSection, { stats: { ...stats, enabled: false } }));
      assert.equal(document.querySelector('section'), null);
      await view.unmount();
    });
  });

  describe('SEO foundation', () => {
    test('sets title, description, robots and Open Graph tags, and omits canonical/og:image until configured', async () => {
      const page = await visit('/about');
      assert.equal(document.title, 'About Us | HASHIMI LOGISTICS INC.');
      assert.equal(document.head.querySelector('meta[property="og:title"]').content, document.title);
      assert.equal(document.head.querySelector('meta[name="robots"]').content, 'index,follow');
      assert.equal(document.head.querySelector('link[rel="canonical"]'), null);
      assert.equal(document.head.querySelector('meta[property="og:image"]'), null);
      await page.unmount();
    });

    test('not-found pages are noindex', async () => {
      const page = await visit('/nope');
      assert.equal(document.head.querySelector('meta[name="robots"]').content, 'noindex,follow');
      await page.unmount();
    });
  });

  // Fields that share a label across stops (City, Country...) are addressed by their name instead.
  async function fillNamed(fields) {
    for (const [name, value] of Object.entries(fields)) {
      const input = document.querySelector(`[name="${name}"]`);
      assert.ok(input, `a field named "${name}" exists`);
      await act(async () => {
        const proto = input.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
        input.dispatchEvent(new dom.window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      });
    }
  }

  describe('request a quote', () => {
    const fillRoute = async () => fillNamed({ 'origin.city': 'Chicago', 'origin.state': 'IL', 'destination.city': 'Toronto', 'destination.state': 'ON', 'destination.country': 'CA', pickupDate: tomorrow() });
    async function completeToReview() {
      await fillRoute();
      await click('Next');
      await fillNamed({ commodity: 'Packaged goods', 'weight.value': '12000', equipmentType: 'Dry Van', pallets: '10' });
      await click('Next');
      await choose('Full Truckload (FTL)');
      await click('Next');
      await fillNamed({ 'contactInformation.name': 'Pat Shipper', 'contactInformation.company': 'Pat Goods', 'contactInformation.email': 'pat@example.com', 'contactInformation.phone': '555 123 4567' });
      await click('Next');
      await click('Review');
    }

    test('validates each step before moving on and shows a five-step progress indicator', async () => {
      const page = await visit('/request-quote');
      assert.equal(document.querySelectorAll('nav[aria-label="Quote request progress"] li').length, 5);
      assert.equal(document.querySelector('nav[aria-label="Quote request progress"] li[aria-current="step"]').textContent.slice(0, 2), '01');
      await click('Next');
      assert.match(text(), /Pickup city is required/);
      assert.match(text(), /Delivery city is required/);
      assert.match(text(), /Pickup date is required/);
      assert.ok(document.querySelector('[aria-invalid="true"]'));
      await fillNamed({ 'origin.city': 'A', 'destination.city': 'B', pickupDate: '2000-01-01' });
      await click('Next');
      assert.match(text(), /Pickup date cannot be in the past/);
      await fillNamed({ 'origin.country': 'CA', 'destination.country': 'MX', pickupDate: tomorrow() });
      await click('Next');
      assert.match(text(), /between the US and Canada, or the US and Mexico/);
      await page.unmount();
    });

    test('walks all steps, reviews, and sends exactly the JSON body the API validates to POST /quotes', async () => {
      handler = ({ url, method, ok }) => (url === '/quotes' && method === 'post' ? ok({ success: true, data: { quoteNumber: 'QT-2026-000042' } }, 201) : null);
      const page = await visit('/request-quote');
      await completeToReview();
      assert.match(document.querySelector('h2:not(.sr-only)').textContent, /Review your request/);
      assert.match(text(), /Chicago, IL · US/);
      assert.match(text(), /Toronto, ON · CA/);
      await click('Back');
      assert.match(document.querySelector('h2:not(.sr-only)').textContent, /05 Additional/);
      assert.match(text(), /Files cannot be uploaded from the website/);
      assert.equal(document.querySelector('input[type="file"]'), null, 'no file upload on the public form');
      await click('Review');
      await click('Submit Quote Request');
      const call = lastCall('POST /quotes');
      assert.ok(call, 'POST /quotes was sent');
      assert.equal(call.form, undefined, 'sent as JSON, not multipart');
      assert.deepEqual(call.body, {
        origin: { city: 'Chicago', country: 'US', state: 'IL' },
        destination: { city: 'Toronto', country: 'CA', state: 'ON' },
        pickupDate: tomorrow(),
        equipmentType: 'Dry Van',
        shipmentType: 'FTL',
        commodity: 'Packaged goods',
        weight: { value: 12000, unit: 'lb' },
        pallets: 10,
        contactInformation: { name: 'Pat Shipper', email: 'pat@example.com', phone: '555 123 4567', company: 'Pat Goods' },
      });
      assert.match(text(), /Quote request submitted/);
      assert.match(text(), /QT-2026-000042/);
      assert.match(text(), /No email confirmation is sent/);
      handler = null;
      await page.unmount();
    });

    test('never reports success when the quote service is unavailable', async () => {
      const page = await visit('/request-quote');
      await completeToReview();
      await click('Submit Quote Request');
      assert.ok(lastCall('POST /quotes'));
      assert.doesNotMatch(text(), /Quote request submitted/);
      assert.match(document.querySelector('[role="alert"]').textContent, /Online quote requests are not available right now/);
      await page.unmount();
    });
  });

  describe('contact form', () => {
    const valid = { Name: 'Pat', Email: 'pat@example.com', Subject: 'Hello', Message: 'I need a quote.' };
    const submit = async () => {
      await act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
      await tick(60);
    };

    test('validates required fields and the interest choice', async () => {
      const page = await visit('/contact');
      await submit();
      for (const message of [/Name is required/, /Email is required/, /Interest is required/, /Subject is required/, /Message is required/]) assert.match(text(), message);
      assert.equal(calls.filter((c) => c.key === 'POST /contact').length, 0, 'nothing sent while invalid');
      await fill({ Email: 'bad' });
      await submit();
      assert.match(text(), /valid email/);
      await page.unmount();
    });

    test('posts the API contract to /contact and shows an honest success only after the server confirms', async () => {
      handler = ({ url, method, ok }) => (url === '/contact' && method === 'post' ? ok({ success: true, data: {} }, 201) : null);
      const page = await visit('/contact');
      await fill(valid);
      await choose('General Inquiry');
      await submit();
      assert.deepEqual(lastCall('POST /contact').body, { name: 'Pat', company: '', email: 'pat@example.com', phone: '', subject: 'Hello', message: 'I need a quote.', interest: 'general' });
      assert.match(text(), /Message received/);
      assert.match(text(), /No email confirmation is sent/);
      handler = null;
      await page.unmount();
    });

    test('shows an honest error and keeps the form when the service is unavailable', async () => {
      const page = await visit('/contact');
      await fill(valid);
      await choose('Shipping');
      await submit();
      assert.doesNotMatch(text(), /Message received/);
      assert.match(document.querySelector('[role="alert"]').textContent, /contact form is not available right now/);
      assert.equal(labelled('Name').value, 'Pat', 'user input is preserved');
      await page.unmount();
    });
  });

  describe('become a carrier', () => {
    const submit = async () => {
      await act(async () => document.querySelector('#apply form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
      await tick(60);
    };
    async function complete() {
      await fill({ 'Company Name': 'Road Co', 'Contact Person': 'Sam', Email: 'sam@example.com', Phone: '555 111 2222', 'MC Number': '123456', 'DOT Number': '654321', Address: '1 Main St', 'Cross-Border Capability': 'yes' });
      await choose('Dry Van');
      await choose('U.S. Domestic');
    }

    test('shows the page sections and every application field, and explains that documents are requested after review', async () => {
      const page = await visit('/become-a-carrier');
      for (const label of ['Company Name', 'Contact Person', 'Email', 'Phone', 'MC Number', 'DOT Number', 'Address', 'Cross-Border Capability', 'Additional notes']) labelled(label);
      for (const heading of ['Why Partner With Us', 'Carrier Benefits', 'Requirements']) assert.ok([...document.querySelectorAll('h2')].some((h) => h.textContent === heading), heading);
      for (const legend of ['Equipment Types', 'Operating Regions']) assert.ok([...document.querySelectorAll('legend')].some((l) => l.textContent === legend), legend);
      assert.equal(document.querySelector('#apply input[type="file"]'), null, 'no file upload on the public form');
      assert.match(document.querySelector('#apply').textContent, /Documents \(W-9, insurance, operating authority, carrier agreement\) are not uploaded here/);
      await page.unmount();
    });

    test('validates, then submits the API contract as JSON to /carrier-applications with honest outcomes', async () => {
      const page = await visit('/become-a-carrier');
      await submit();
      for (const message of [/Company name is required/, /MC number is required/, /Select at least one equipment type/, /Select at least one operating region/]) assert.match(text(), message);
      assert.equal(calls.filter((c) => c.key === 'POST /carrier-applications').length, 0);
      await complete();
      await submit();
      assert.ok(lastCall('POST /carrier-applications'));
      assert.doesNotMatch(text(), /Application submitted/);
      assert.match(document.querySelector('[role="alert"]').textContent, /carrier applications are not available right now/);

      handler = ({ url, method, ok }) => (url === '/carrier-applications' && method === 'post' ? ok({ success: true, data: {} }, 201) : null);
      await submit();
      const call = lastCall('POST /carrier-applications');
      assert.equal(call.form, undefined, 'sent as JSON, not multipart');
      assert.deepEqual(call.body, {
        companyName: 'Road Co', contactPerson: 'Sam', email: 'sam@example.com', phone: '555 111 2222', mcNumber: '123456', dotNumber: '654321',
        address: '1 Main St', equipmentTypes: ['Dry Van'], operatingRegions: ['us_domestic'], crossBorder: 'yes',
      });
      assert.match(text(), /Application submitted/);
      assert.match(text(), /No email confirmation is sent/);
      handler = null;
      await page.unmount();
    });

    test('server-side field errors are shown on the matching fields', async () => {
      handler = ({ url, method, fail }) => (url === '/carrier-applications' && method === 'post' ? fail(422, { success: false, message: 'Please correct the highlighted fields.', errors: [{ field: 'mcNumber', message: 'MC number must be 1 to 8 digits.' }] }) : null);
      const page = await visit('/become-a-carrier');
      await complete();
      await submit();
      assert.match(text(), /MC number must be 1 to 8 digits/);
      assert.equal(labelled('MC Number').getAttribute('aria-invalid'), 'true');
      handler = null;
      await page.unmount();
    });
  });

  describe('track shipment', () => {
    const search = async (number) => {
      if (number) await fill({ 'Tracking number': number });
      await act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
      await tick(60);
    };

    test('shows no result before searching and asks for a number when empty', async () => {
      const page = await visit('/track-shipment');
      assert.match(text(), /will appear here after you search/);
      await search();
      assert.match(text(), /Enter a tracking number/);
      assert.equal(calls.filter((c) => c.key.startsWith('GET /tracking')).length, 0);
      await page.unmount();
    });

    test('a domestic shipment never shows border statuses', async () => {
      handler = ({ url, ok }) => (url === '/tracking/HL-1' ? ok({ success: true, data: { trackingNumber: 'HL-1', status: 'in_transit', isCrossBorder: false, events: [{ status: 'booked', timestamp: '2026-01-01T10:00:00Z' }, { status: 'at_border' }] } }) : null);
      const page = await visit('/track-shipment');
      await search('HL-1');
      const steps = [...document.querySelectorAll('ol[aria-label="Shipment progress"] li')].map((li) => li.textContent);
      assert.equal(steps.length, 6);
      assert.ok(!steps.some((s) => /Border/.test(s)));
      assert.ok(!/At Border/.test(document.querySelector('main').textContent));
      assert.equal(document.querySelector('li[aria-current="step"]').textContent.replace(/\(current\)/, '').trim().replace(/^\d/, ''), 'In Transit');
      handler = null;
      await page.unmount();
    });

    test('a cross-border shipment shows border statuses and exceptions are called out', async () => {
      handler = ({ url, ok }) => (url === '/tracking/HL-2' ? ok({ success: true, data: { trackingNumber: 'HL-2', status: 'exception', isCrossBorder: true, events: [] } }) : null);
      const page = await visit('/track-shipment');
      await search('HL-2');
      assert.equal(document.querySelectorAll('ol[aria-label="Shipment progress"] li').length, 8);
      assert.match(text(), /At Border/);
      assert.match(text(), /marked exception/);
      assert.match(text(), /No tracking events have been recorded/);
      handler = null;
      await page.unmount();
    });

    test('a genuine SHIPMENT_NOT_FOUND answer shows "No shipment found", never fake results', async () => {
      handler = ({ url, fail }) => (url === '/tracking/NOPE-1' ? fail(404, { success: false, code: 'SHIPMENT_NOT_FOUND', message: 'No shipment.', errors: [] }) : null);
      const page = await visit('/track-shipment');
      await search('NOPE-1');
      assert.match(text(), /No shipment found/);
      assert.doesNotMatch(text(), /In Transit|Delivered|not available yet/);
      handler = null;
      await page.unmount();
    });

    test('a missing tracking API (plain 404) is reported as unavailable, not as "no shipment"', async () => {
      const page = await visit('/track-shipment');
      await search('HL-9');
      assert.match(text(), /Online tracking is not available yet/);
      assert.doesNotMatch(text(), /No shipment found/);
      await page.unmount();
    });

    test('shows an error state with retry when the service fails', async () => {
      handler = ({ url, fail }) => (url.startsWith('/tracking/') ? fail(500, { success: false, message: 'Server error.', errors: [] }) : null);
      const page = await visit('/track-shipment');
      await search('HL-3');
      assert.match(document.querySelector('[role="alert"]').textContent, /Tracking is unavailable right now/);
      const before = calls.length;
      await click('Try again');
      assert.ok(calls.length > before);
      handler = null;
      await page.unmount();
    });
  });

  describe('FAQ', () => {
    test('searches, filters by category, and shows an empty state', async () => {
      const page = await visit('/faq');
      const count = () => document.querySelectorAll('main button[aria-expanded]').length;
      const all = count();
      assert.ok(all >= 10);
      for (const name of ['Shippers', 'Carriers', 'Quotes', 'Tracking', 'Cross-Border', 'General']) assert.ok([...document.querySelectorAll('button[aria-pressed]')].some((b) => b.textContent === name), name);
      await click('Tracking');
      assert.ok(count() > 0 && count() < all);
      await click('All');
      await fill({ 'Search questions': 'customs' });
      assert.ok(count() >= 1 && count() < all);
      await fill({ 'Search questions': 'zzzz-no-match' });
      assert.match(text(), /No questions match/);
      await click('Clear filters');
      assert.equal(count(), all);
      await page.unmount();
    });
  });

  describe('resources and articles', () => {
    test('a CMS with no published posts shows a professional empty state, not fake news', async () => {
      handler = ({ url, ok }) => (url === '/content/blog' ? ok({ success: true, data: { items: [], page: 1, totalPages: 1, total: 0, categories: [] } }) : null);
      const page = await visit('/resources');
      assert.match(text(), /No articles published yet/);
      assert.equal(document.querySelectorAll('button[aria-pressed]').length, 0, 'no category filters are invented');
      assert.ok(document.querySelector('input[type="search"]'));
      handler = null;
      await page.unmount();
    });

    test('lists CMS posts with a featured article, filters by the CMS categories and paginates', async () => {
      const article = (n) => ({ slug: `a${n}`, title: `Article ${n}`, category: 'Freight', excerpt: 'Excerpt', authorName: 'Staff', publishedAt: '2026-01-01T00:00:00.000Z', tags: [], featuredImage: null, isFeatured: false });
      handler = ({ url, ok, params }) => (url === '/content/blog' ? ok({ success: true, data: { items: [article(1), article(2), article(3)], page: params.page, totalPages: 3, total: 9, categories: ['Carrier Resources', 'Freight'] } }) : null);
      const page = await visit('/resources');
      assert.match(text(), /Featured/);
      assert.equal(document.querySelectorAll('main article').length, 3);
      assert.match(text(), /Page 1 of 3/);
      assert.deepEqual([...document.querySelectorAll('button[aria-pressed]')].map((b) => b.textContent), ['All', 'Carrier Resources', 'Freight']);
      await click('Next');
      assert.equal(lastCall('GET /content/blog').params.page, 2);
      await click('Carrier Resources');
      assert.equal(lastCall('GET /content/blog').params.category, 'Carrier Resources');
      assert.equal(lastCall('GET /content/blog').params.page, 1);
      handler = null;
      await page.unmount();
    });

    test('shows an error state when the content API fails', async () => {
      handler = ({ url, fail }) => (url === '/content/blog' ? fail(500, { success: false, message: 'Server error.', errors: [] }) : null);
      const page = await visit('/resources');
      assert.match(document.querySelector('[role="alert"]').textContent, /Articles are unavailable right now/);
      handler = null;
      await page.unmount();
    });

    test('article template renders API content as text and 404s cleanly', async () => {
      handler = ({ url, ok }) => (url === '/content/blog/hello' ? ok({ success: true, data: { slug: 'hello', title: 'Hello Freight', category: 'Freight', authorName: 'Staff', publishedAt: '2026-01-01T00:00:00.000Z', content: 'First paragraph.\n\n<script>alert(1)</script>', tags: ['one'], featuredImage: null, seo: {} } }) : null);
      let page = await visit('/resources/hello');
      assert.equal(document.querySelector('h1').textContent, 'Hello Freight');
      assert.match(text(), /First paragraph/);
      assert.equal(document.querySelector('main script'), null, 'content is never injected as HTML');
      assert.match(text(), /<script>alert\(1\)<\/script>/);
      await page.unmount();
      page = await visit('/resources/missing');
      assert.equal(document.querySelector('h1').textContent, 'Article not found');
      handler = null;
      await page.unmount();
    });
  });

  describe('legal pages', () => {
    test('carry a not-legal-advice notice and no specific legal commitments', async () => {
      for (const path of ['/privacy-policy', '/terms']) {
        const page = await visit(path);
        assert.match(text(), /not legal advice/);
        assert.doesNotMatch(document.querySelector('main').textContent, /\b\d+ days\b|governing law|arbitration/i);
        await page.unmount();
      }
    });
  });

  describe('portals are untouched', () => {
    test('/admin, /customer and /carrier still redirect guests to sign in', async () => {
      for (const [path, expected] of [['/admin', '/admin/login'], ['/customer', '/login'], ['/carrier', '/login']]) {
        const page = await visit(path);
        assert.equal(page.router.state.location.pathname, expected);
        await page.unmount();
      }
    });
  });


  describe('QA hardening', () => {
    test('FAQ and page copy make no unconfirmed promises (hours, days, guarantees, payment timing)', async () => {
      const { faqs } = await vite.ssrLoadModule('/src/content/faqs.js');
      const pages = await vite.ssrLoadModule('/src/content/pages.js');
      const home = await vite.ssrLoadModule('/src/content/home.js');
      const services = await vite.ssrLoadModule('/src/content/services.js');
      const corpus = JSON.stringify([faqs, pages.about, pages.shipperSections, pages.carrierSections, pages.carrierResourceCards, home, services.services]);
      for (const banned of [/\b\d+\s*(?:business\s+)?(?:hours?|days?|weeks?|minutes?)\b/i, /(?<!not )\balways\b/i, /guarantee/i, /\bnet[- ]?\d+/i, /same[- ]day/i, /within \d/i, /\bfastest\b/i, /\b#1\b|\bbest\b/i, /ocean|air freight|airplane|\bship(?:s|ping)? port|vessel/i, /customs broker(?:age)? (?:services )?(?:are|is) (?:available|provided|offered)/i]) {
        assert.doesNotMatch(corpus, banned, String(banned));
      }
      const carrierPayment = faqs.find((f) => f.id === 'carrier-payment');
      assert.match(carrierPayment.a, /applicable agreement/);
      assert.match(faqs.find((f) => f.id === 'quote-response').a, /may vary/);
      assert.match(faqs.find((f) => f.id === 'border-docs').a, /does not offer customs brokerage or legal services/);
    });

    test('every internal link on every public page resolves to a real route and none points at a portal', async () => {
      const seen = new Set();
      for (const path of PAGES) {
        const page = await visit(path);
        for (const a of document.querySelectorAll('a[href]')) {
          const href = a.getAttribute('href');
          if (!href.startsWith('/')) continue;
          seen.add(href);
        }
        await page.unmount();
      }
      assert.ok(seen.size > 30, `collected ${seen.size} links`);
      for (const href of seen) {
        const pathname = href.split(/[?#]/)[0];
        const matches = RR.matchRoutes(appRoutes, pathname);
        assert.ok(matches && matches.at(-1).route.path !== '*', `${href} resolves to a real route`);
        // The navbar's Sign In menu may open the Super Admin sign-in page; no public page links to a dashboard.
        assert.ok(pathname === '/admin/login' || (!/^\/(customer|admin)(\/|$)/.test(pathname) && !/^\/carrier(\/|$)/.test(pathname)), `${href} does not link into a portal`);
      }
      assert.ok(seen.has('/login'), 'public site keeps a route into sign-in');
    });

    test('robots.txt blocks only portals and sign-in, never a public route (e.g. /carrier-resources)', async () => {
      const { readFileSync } = await import('node:fs');
      // robots.txt is generated by the backend (backend/src/cms/sitemap.routes.js) so its Sitemap line follows the site address.
      const source = readFileSync(`${ROOT}../backend/src/cms/sitemap.routes.js`, 'utf8');
      const lines = [...source.matchAll(/'Disallow: ([^']+)'/g)].map((m) => m[1].trim());
      assert.ok(lines.length > 0);
      for (const path of PAGES) {
        for (const rule of lines) assert.ok(!path.startsWith(rule), `${path} must not match Disallow: ${rule}`);
      }
      assert.ok(lines.includes('/carrier/'));
    });

    test('sign-in and portal screens are noindex, and public pages are indexable again afterwards', async () => {
      const robots = () => document.head.querySelector('meta[name="robots"]')?.content;
      let page = await visit('/login');
      assert.equal(robots(), 'noindex,nofollow');
      await page.unmount();
      page = await visit('/admin');
      assert.equal(page.router.state.location.pathname, '/admin/login');
      assert.equal(robots(), 'noindex,nofollow');
      await page.unmount();
      page = await visit('/carrier-resources');
      assert.equal(robots(), 'index,follow');
      await page.unmount();
    });

    test('Navbar and Footer take their content from props (CMS-ready)', async () => {
      const { default: Navbar } = await vite.ssrLoadModule('/src/components/layout/Navbar.jsx');
      const { default: Footer } = await vite.ssrLoadModule('/src/components/layout/Footer.jsx');
      const router = RR.createMemoryRouter([{ path: '*', element: React.createElement(React.Fragment, null, React.createElement(Navbar, { items: [{ label: 'Sentinel Link', to: '/x' }], primaryAction: { label: 'Primary Sentinel', to: '/p' }, trackAction: { label: 'Secondary Sentinel', to: '/s' } }), React.createElement(Footer, { company: { name: 'SENTINEL CO', tagline: 'Sentinel tagline', supportingStatement: 'Sentinel statement' }, contact: { phone: '555 000 1111', email: 'x@example.test', address: '1 Test Rd', businessHours: 'Test hours', mcNumber: '', dotNumber: '' }, social: { linkedin: 'https://example.test/li' }, links: [{ label: 'Footer Sentinel', to: '/f' }], legal: [{ label: 'Legal Sentinel', to: '/l' }] })) }]);
      const view = await render(React.createElement(RR.RouterProvider, { router }));
      await tick();
      for (const expected of ['Sentinel Link', 'Primary Sentinel', 'Secondary Sentinel', 'SENTINEL CO', 'Sentinel tagline', '555 000 1111', 'x@example.test', '1 Test Rd', 'Test hours', 'LinkedIn', 'Footer Sentinel', 'Legal Sentinel']) assert.ok(text().includes(expected), expected);
      assert.ok(!text().includes('Request a Quote'), 'default CTA text is not hard-wired into the component');
      assert.equal(document.querySelectorAll('nav[aria-label="Primary"] a').length, 1);
      await view.unmount();
    });

    test('section components render whatever data they are given, not built-in copy', async () => {
      const load = async (name) => (await vite.ssrLoadModule(`/src/components/sections/${name}.jsx`)).default;
      const [ServiceGrid, IndustryGrid, FeatureGrid, StepsSection, CrossBorderSection, ServiceAreaCards, FAQSection, CTASection, TrustStrip, HeroSection] = await Promise.all(['ServiceGrid', 'IndustryGrid', 'FeatureGrid', 'StepsSection', 'CrossBorderSection', 'ServiceAreaCards', 'FAQSection', 'CTASection', 'TrustStrip', 'HeroSection'].map(load));
      const h = React.createElement;
      const tree = h(React.Fragment, null,
        h(HeroSection, { title: 'Hero Sentinel', subtitle: 'Sub Sentinel', description: 'Desc Sentinel', actions: [{ label: 'Action Sentinel', to: '/a' }] }),
        h(TrustStrip, { items: [{ icon: 'truck', title: 'Trust Sentinel' }] }),
        h(ServiceGrid, { title: 'ServiceGrid Sentinel', services: [{ slug: 's', title: 'Service Sentinel', short: 'x', icon: 'truck' }] }),
        h(IndustryGrid, { title: 'IndustryGrid Sentinel', industries: [{ slug: 'i', title: 'Industry Sentinel', short: 'x', icon: 'factory', scene: 'highway' }] }),
        h(FeatureGrid, { id: 'f', title: 'Feature Sentinel', items: [{ icon: 'truck', title: 'Item Sentinel', text: 'x' }] }),
        h(StepsSection, { title: 'Steps Sentinel', steps: [{ title: 'Step Sentinel', text: 'x' }] }),
        h(CrossBorderSection, { data: { title: 'Cross Sentinel', intro: 'x', lanes: [{ title: 'Lane Sentinel', text: 'x' }], items: [] } }),
        h(ServiceAreaCards, { title: 'Areas Sentinel', areas: [{ slug: 'a', country: 'Country Sentinel', title: 'Area Sentinel', text: 'x', regions: ['Region Sentinel'] }] }),
        h(FAQSection, { title: 'FAQ Sentinel', items: [{ id: 'q', q: 'Question Sentinel', a: 'Answer' }] }),
        h(CTASection, { title: 'CTA Sentinel', text: 'x', actions: [{ label: 'CTA Action Sentinel', to: '/c' }] }));
      const router = RR.createMemoryRouter([{ path: '*', element: tree }]);
      const view = await render(h(RR.RouterProvider, { router }));
      await tick();
      for (const word of ['Hero Sentinel', 'Action Sentinel', 'Trust Sentinel', 'ServiceGrid Sentinel', 'Service Sentinel', 'IndustryGrid Sentinel', 'Industry Sentinel', 'Feature Sentinel', 'Item Sentinel', 'Steps Sentinel', 'Step Sentinel', 'Cross Sentinel', 'Lane Sentinel', 'Areas Sentinel', 'Region Sentinel', 'FAQ Sentinel', 'Question Sentinel', 'CTA Sentinel', 'CTA Action Sentinel']) assert.ok(text().includes(word), word);
      await view.unmount();
    });

    test('hero shows only the poster for visitors who prefer reduced motion', async () => {
      window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
      const view = await render(React.createElement(HeroMedia, { media: { videoSrc: '/x.mp4', videoType: 'video/mp4', posterSrc: '/poster.jpg', posterAlt: '' } }));
      assert.equal(document.querySelector('video'), null);
      assert.ok(document.querySelector('img[src="/poster.jpg"]'));
      await view.unmount();
      delete window.matchMedia;
    });

    test('hero fallback scenes and decorative images are hidden from assistive technology and lazy where below the fold', async () => {
      const page = await visit('/industries');
      assert.ok(document.querySelectorAll('svg[aria-hidden="true"]').length >= 8);
      assert.equal(document.querySelectorAll('svg:not([aria-hidden="true"])').length, 0, 'no unlabeled informative svg');
      const view = await render(React.createElement((await vite.ssrLoadModule('/src/components/media/MediaImage.jsx')).default, { src: '/photo.jpg', alt: '' }));
      const img = document.querySelector('img');
      assert.equal(img.getAttribute('loading'), 'lazy');
      assert.equal(img.getAttribute('decoding'), 'async');
      assert.equal(img.getAttribute('alt'), '');
      await view.unmount();
      await page.unmount();
    });

    test('contact form: Enter submits exactly once, a second click while sending is ignored, and focus lands on the first invalid field', async () => {
      let release;
      handler = ({ url, method, ok }) => (url === '/contact' && method === 'post' ? new Promise((resolve) => { release = () => resolve(ok({ success: true, data: {} }, 201)); }) : null);
      const page = await visit('/contact');
      const submit = async () => act(async () => document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
      await submit();
      assert.equal(document.activeElement, labelled('Name'), 'focus moves to the first invalid field');
      assert.equal(labelled('Name').getAttribute('aria-invalid'), 'true');
      assert.ok(document.getElementById(labelled('Name').getAttribute('aria-describedby')).textContent.includes('Name is required'));
      await fill({ Name: 'Pat', Email: 'pat@example.com', Subject: 'Hi', Message: 'Hello' });
      await choose('Shipping');
      await submit();
      const button = [...document.querySelectorAll('form button[type="submit"]')][0];
      assert.equal(button.disabled, true, 'submit button is disabled while sending');
      assert.equal(button.getAttribute('aria-busy'), 'true');
      await submit();
      assert.equal(calls.filter((c) => c.key === 'POST /contact').length, 1, 'a second submit while one is in flight is ignored');
      await act(async () => release());
      await tick(60);
      assert.match(text(), /Message received/);
      handler = null;
      await page.unmount();
    });

    test('the quote form sends only the fields the API accepts, never an owner, status or price', async () => {
      handler = ({ url, method, ok }) => (url === '/quotes' && method === 'post' ? ok({ success: true, data: { quoteNumber: 'QT-2026-000001' } }, 201) : null);
      const page = await visit('/request-quote');
      await fillNamed({ 'origin.city': 'A', 'destination.city': 'B', pickupDate: tomorrow() });
      await click('Next');
      await fillNamed({ commodity: 'Goods', 'weight.value': '100', equipmentType: 'Reefer', 'temperatureRequirements.minimum': '34', 'temperatureRequirements.maximum': '38' });
      await click('Next');
      await choose('Expedited');
      await click('Next');
      await fillNamed({ 'contactInformation.name': 'Pat', 'contactInformation.email': 'pat@example.com', 'contactInformation.phone': '555 123 4567' });
      await click('Next');
      await click('Review');
      await click('Submit Quote Request');
      const body = lastCall('POST /quotes').body;
      assert.deepEqual(Object.keys(body).sort(), ['commodity', 'contactInformation', 'destination', 'equipmentType', 'origin', 'pickupDate', 'shipmentType', 'temperatureRequirements', 'weight']);
      assert.deepEqual(body.temperatureRequirements, { unit: 'F', minimum: 34, maximum: 38 });
      assert.deepEqual(Object.keys(body.contactInformation).sort(), ['email', 'name', 'phone'], 'an empty company is left out');
      for (const key of ['customerId', 'status', 'quotedRate', 'source', 'isCrossBorder', 'attachments']) assert.ok(!(key in body), key);
      handler = null;
      await page.unmount();
    });

    test('server-side field errors on the quote form take the user back to the step that owns the field and keep their input', async () => {
      handler = ({ url, method, fail }) => (url === '/quotes' && method === 'post' ? fail(422, { success: false, message: 'Please correct the highlighted fields.', errors: [{ field: 'contactInformation.email', message: 'Email is not accepted.' }] }) : null);
      const page = await visit('/request-quote');
      await fillNamed({ 'origin.city': 'Chicago', 'destination.city': 'Toronto', 'destination.country': 'CA', pickupDate: tomorrow() });
      await click('Next');
      await fillNamed({ commodity: 'Goods', 'weight.value': '100', equipmentType: 'Dry Van' });
      await click('Next');
      await choose('Full Truckload (FTL)');
      await click('Next');
      await fillNamed({ 'contactInformation.name': 'Pat', 'contactInformation.email': 'pat@example.com', 'contactInformation.phone': '555 123 4567' });
      await click('Next');
      await click('Review');
      await click('Submit Quote Request');
      assert.match(document.querySelector('h2:not(.sr-only)').textContent, /04 Contact/);
      assert.match(text(), /Email is not accepted/);
      assert.equal(document.querySelector('[name="contactInformation.email"]').value, 'pat@example.com');
      handler = null;
      await page.unmount();
    });

    test('the footer keeps a path to sign-in and the public site never exposes admin or portal APIs', async () => {
      const page = await visit('/');
      assert.ok(document.querySelector('footer a[href="/login"]'));
      await page.unmount();
      const { readdirSync, readFileSync } = await import('node:fs');
      const publicFiles = [...readdirSync(`${ROOT}src/pages/public`).map((f) => `src/pages/public/${f}`), ...readdirSync(`${ROOT}src/services`).filter((f) => !/authService|apiClient|adminService/.test(f)).map((f) => `src/services/${f}`)];
      for (const file of publicFiles) {
        const code = readFileSync(`${ROOT}${file}`, 'utf8');
        assert.ok(!/['"`]\/admin|\/auth\/admin|role\s*===?\s*['"]super_admin/.test(code), `${file} must not touch admin APIs or role flags`);
        assert.ok(!/\b(?:fetch|axios)\s*[.(]/.test(code.replace(/import axios.*/g, '')), `${file} must use the shared apiClient`);
        assert.ok(!/console\.(log|debug)|debugger|TODO|FIXME/.test(code), `${file} has debug leftovers`);
        assert.ok(!/adminService|components\/admin|pages\/admin/.test(code), `${file} must not import the admin panel`);
      }
    });
  });

  test('no React errors or warnings were logged during the whole run', () => {
    const real = errors.filter((message) => !/not wrapped in act|ScrollRestoration|scrollTo/.test(message));
    assert.deepEqual(real, []);
  });
});
