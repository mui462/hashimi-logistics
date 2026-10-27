/**
 * Phase 9 public website <-> CMS integration, rendered in jsdom against a mocked /content API (mocks live only in this file).
 * Covers built-in fallbacks, CMS-driven homepage order and visibility, collections that take over only once configured,
 * hidden empty testimonials, plain-text rendering, SEO, site settings in the header and footer, custom and system pages,
 * graceful degradation when the API fails, and request behaviour.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { createHarness, ROOT, seo } from './cms-harness.mjs';

const ORDER = ['trust', 'services', 'whyChooseUs', 'howItWorks', 'industries', 'crossBorder', 'serviceAreas', 'stats', 'testimonials', 'faq', 'finalCTA'];
const header = (extra = {}) => ({ enabled: true, title: null, subtitle: null, description: null, image: null, button: null, ...extra });
const homeData = (extra = {}, collections = {}) => ({
  configured: true, sectionOrder: ORDER,
  hero: { eyebrow: null, title: null, subtitle: null, description: null, video: null, poster: null, fallbackImage: null, primaryButton: null, secondaryButton: null, overlay: { color: '#000000', opacity: 0.5, enabled: false }, autoplay: true, muted: true, loop: true },
  trust: header({ items: [] }), services: header(), whyChooseUs: header({ items: [] }), howItWorks: header({ steps: [] }), industries: header(), crossBorder: header({ highlights: [] }), serviceAreas: header(), stats: header({ items: [] }),
  testimonials: header(), faq: header(), finalCTA: header({ primaryButton: null, secondaryButton: null }), seo: seo(),
  collections: { services: { configured: false, items: [] }, industries: { configured: false, items: [] }, serviceAreas: { configured: false, items: [] }, faqs: { configured: false, items: [] }, testimonials: { items: [] }, ...collections },
  ...extra,
});
const settings = (extra = {}) => ({ configured: true, companyName: 'Hashimi Freight Co', shortName: null, tagline: 'Custom tagline', websiteTitle: null, description: null, phone: '(312) 555-0100', email: 'ops@example.test', address: { street: '1 Dock Rd', city: 'Chicago', state: 'IL', zipCode: '60601', country: 'US' }, businessHours: [{ day: 'monday', isClosed: false, opensAt: '08:00', closesAt: '17:00' }, { day: 'sunday', isClosed: true, opensAt: null, closesAt: null }], socialLinks: [{ platform: 'linkedin', url: 'https://www.linkedin.com/company/example' }], logo: null, favicon: null, primaryCta: { label: 'Get pricing', url: '/request-quote' }, footerText: 'Footer words from the CMS.', copyrightText: 'CMS copyright line.', canonicalBaseUrl: 'https://example.test', seo: seo(), ...extra });
const cmsPage = (extra = {}) => ({ title: 'Hello', slug: 'hello', pageKey: null, excerpt: 'Summary line.', content: 'First paragraph.\n\n<script>alert(1)</script>', heroHeading: null, heroSubtitle: null, heroImage: null, sections: [], cta: null, seo: seo(), updatedAt: '2026-10-01T00:00:00.000Z', ...extra });
const card = (extra = {}) => ({ slug: 'cms-svc', name: 'CMS Service', shortDescription: 'From the CMS.', icon: 'truck', image: null, isFeatured: false, ...extra });
const ok = (data) => () => ({ data });

describe('Phase 9 public website and the CMS', () => {
  let h;
  before(async () => { h = await createHarness(); });
  after(async () => { await h.close(); });
  const visit = (path, routes = {}) => h.visit(path, { as: null, routes });
  const sectionIds = () => [...document.querySelectorAll('main section[id]')].map((node) => node.id);
  const meta = (name, attr = 'name') => document.head.querySelector(`meta[${attr}="${name}"]`)?.getAttribute('content');

  describe('fallbacks', () => {
    test('with nothing in the CMS the homepage is the built-in Phase 4 homepage', async () => {
      const view = await visit('/');
      assert.equal(h.h1(), 'HASHIMI LOGISTICS LLC');
      for (const id of ['services', 'why-hashimi', 'how-it-works', 'industries', 'cross-border', 'service-areas', 'statistics', 'faq-preview', 'cta']) assert.ok(sectionIds().includes(id), id);
      assert.ok(!sectionIds().includes('testimonials'), 'no testimonials are invented');
      assert.match(h.text(), /Full Truckload/);
      await view.unmount();
    });

    test('when the content API fails the site still renders its built-in content', async () => {
      const view = await visit('/', { 'GET /content/homepage': () => ({ status: 500, body: { message: 'Server error' } }), 'GET /content/site-settings': () => ({ status: 500, body: { message: 'Server error' } }) });
      assert.equal(h.h1(), 'HASHIMI LOGISTICS LLC');
      assert.match(h.text(), /Full Truckload/);
      assert.doesNotMatch(document.body.textContent, /Server error|unavailable/);
      await view.unmount();
    });

    test('a network failure is handled the same way', async () => {
      const view = await visit('/services', { 'GET /content/services': () => ({ networkError: true }) });
      assert.match(h.text(), /Full Truckload/);
      await view.unmount();
    });
  });

  describe('homepage', () => {
    test('hero text, buttons and section order come from the CMS', async () => {
      const order = ['finalCTA', 'faq', ...ORDER.filter((key) => !['finalCTA', 'faq'].includes(key))];
      const data = homeData({ sectionOrder: order, hero: { ...homeData().hero, eyebrow: 'Since the CMS', title: 'Freight, edited in the CMS', subtitle: 'A new subtitle', description: 'A new description', primaryButton: { label: 'Talk to us', url: '/contact' }, secondaryButton: { label: 'External', url: 'https://example.org/x' } } });
      const view = await visit('/', { 'GET /content/homepage': ok(data) });
      assert.equal(h.h1(), 'Freight, edited in the CMS');
      assert.match(h.text(), /A new subtitle/);
      assert.equal(h.link('Talk to us').getAttribute('href'), '/contact');
      assert.equal(h.link('External').getAttribute('href'), 'https://example.org/x');
      const ids = sectionIds();
      // The saved order moves the call to action to the top; the quote form and then the FAQ always close the page, whatever order was saved.
      assert.ok(ids.indexOf('cta') < ids.indexOf('services'), `order is ${ids.join(',')}`);
      assert.deepEqual(ids.slice(-3), ['network', 'get-a-quote', 'faq-preview'], `order is ${ids.join(',')}`);
      await view.unmount();
    });

    test('a hidden section is not rendered, and visible ones are', async () => {
      const view = await visit('/', { 'GET /content/homepage': ok(homeData({ services: header({ enabled: false }), stats: header({ enabled: false }) })) });
      assert.ok(!sectionIds().includes('services'));
      assert.ok(!sectionIds().includes('statistics'));
      assert.ok(sectionIds().includes('industries'));
      await view.unmount();
    });

    test('collections take over only once configured; until then the built-in cards stay', async () => {
      let view = await visit('/', { 'GET /content/homepage': ok(homeData({}, { services: { configured: false, items: [] } })) });
      assert.match(h.text(), /Full Truckload/);
      await view.unmount();
      view = await visit('/', { 'GET /content/homepage': ok(homeData({}, { services: { configured: true, items: [card()] } })) });
      assert.match(h.text(), /CMS Service/);
      assert.doesNotMatch(document.querySelector('#services').textContent, /Full Truckload/);
      await view.unmount();
      // Everything archived or hidden still means "configured": the CMS decides, so the built-in list does not come back.
      view = await visit('/', { 'GET /content/homepage': ok(homeData({}, { services: { configured: true, items: [] } })) });
      assert.ok(!sectionIds().includes('services'));
      await view.unmount();
    });

    test('testimonials stay hidden when empty and show only real CMS entries', async () => {
      let view = await visit('/', { 'GET /content/homepage': ok(homeData()) });
      assert.ok(!sectionIds().includes('testimonials'));
      await view.unmount();
      view = await visit('/', { 'GET /content/homepage': ok(homeData({}, { testimonials: { items: [{ id: 't1', customerName: 'Pat Shipper', company: 'Acme', position: 'Logistics lead', testimonial: 'Reliable coordination.', photo: null, rating: null, isFeatured: false }] } })) });
      assert.ok(sectionIds().includes('testimonials'));
      assert.match(document.querySelector('#testimonials').textContent, /Reliable coordination\./);
      assert.match(document.querySelector('#testimonials').textContent, /Pat Shipper/);
      await view.unmount();
    });

    test('FAQs, statistics and the closing call to action come from the CMS', async () => {
      const data = homeData({ stats: header({ title: 'By the numbers', items: [{ label: 'Lanes covered', value: '42', description: null }] }), finalCTA: header({ title: 'Book with us', description: 'Plain words.', primaryButton: { label: 'Start now', url: '/request-quote' } }) }, { faqs: { configured: true, items: [{ id: 'q1', question: 'CMS question?', answer: 'CMS answer.', category: 'General' }] } });
      const view = await visit('/', { 'GET /content/homepage': ok(data) });
      assert.match(document.querySelector('#faq-preview').textContent, /CMS question\?/);
      assert.match(document.querySelector('#statistics').textContent, /42/);
      assert.match(document.querySelector('#cta').textContent, /Book with us/);
      assert.equal(h.link('Start now').getAttribute('href'), '/request-quote');
      await view.unmount();
    });

    test('CMS text is always text: markup typed by an editor is shown literally and never injected', async () => {
      const view = await visit('/', { 'GET /content/homepage': ok(homeData({ hero: { ...homeData().hero, title: '<script>window.__x=1</script>Hello <b>bold</b>' } })) });
      assert.equal(h.h1(), '<script>window.__x=1</script>Hello <b>bold</b>');
      assert.equal(document.querySelector('main script'), null);
      assert.equal(document.querySelector('h1 b'), null);
      assert.equal(window.__x, undefined);
      await view.unmount();
    });

    test('the hero shows a configured video over its poster; without one no video is requested', async () => {
      let view = await visit('/', { 'GET /content/homepage': ok(homeData({ hero: { ...homeData().hero, video: { url: 'https://cdn.example.com/hero.mp4', altText: null }, poster: { url: 'https://cdn.example.com/poster.jpg', altText: 'Trucks at dusk' }, overlay: { color: '#112233', opacity: 0.4, enabled: true } } })) });
      assert.ok(document.querySelector('video source[src="https://cdn.example.com/hero.mp4"]'));
      assert.equal(document.querySelector('video').muted, true);
      assert.ok(document.querySelector('img[src="https://cdn.example.com/poster.jpg"]'));
      assert.ok(document.querySelector('[data-testid="hero-overlay"]'));
      await view.unmount();
      view = await visit('/', { 'GET /content/homepage': ok(homeData()) });
      assert.equal(document.querySelector('video'), null);
      await view.unmount();
    });

    test('the home hero overlay follows the saved CMS setting exactly: its strength when on, nothing when switched off', async () => {
      let view = await visit('/', { 'GET /content/homepage': ok(homeData({ hero: { ...homeData().hero, overlay: { color: '#000000', opacity: 0.1, enabled: true } } })) });
      let overlay = document.querySelector('[data-hero="home"] [data-testid="hero-overlay"]');
      assert.equal(overlay.style.opacity, '0.1', 'the saved 0.1 is not replaced by the built-in default');
      assert.equal(overlay.style.backgroundColor, 'rgb(0, 0, 0)');
      await view.unmount();
      view = await visit('/', { 'GET /content/homepage': ok(homeData()) });
      assert.equal(document.querySelector('[data-hero="home"] [data-testid="hero-overlay"]'), null, 'switched off in the CMS: no overlay at all');
      await view.unmount();
    });

    test('one grouped homepage request: no per-section fan-out and no duplicate settings request', async () => {
      const view = await visit('/', { 'GET /content/homepage': ok(homeData()), 'GET /content/site-settings': ok(settings()) });
      assert.equal(h.called('GET /content/homepage').length, 1);
      assert.equal(h.called('GET /content/site-settings').length, 1);
      for (const path of ['/content/services', '/content/industries', '/content/faqs', '/content/testimonials', '/content/service-areas']) assert.equal(h.called(`GET ${path}`).length, 0, `${path} is not fetched separately`);
      await view.unmount();
    });
  });

  describe('site settings, header and footer', () => {
    test('company name, header button, contact details, hours, social links and footer text come from the CMS', async () => {
      const view = await visit('/', { 'GET /content/site-settings': ok(settings()) });
      const footer = document.querySelector('footer');
      assert.match(footer.textContent, /Hashimi Freight Co/);
      assert.match(footer.textContent, /\(312\) 555-0100/);
      assert.match(footer.textContent, /ops@example\.test/);
      assert.match(footer.textContent, /1 Dock Rd, Chicago, IL 60601, US/);
      assert.match(footer.textContent, /Monday: 08:00 to 17:00/);
      assert.match(footer.textContent, /Sunday: Closed/);
      assert.match(footer.textContent, /Footer words from the CMS\./);
      assert.match(footer.textContent, /CMS copyright line\./);
      assert.equal(footer.querySelector('a[href="https://www.linkedin.com/company/example"]').textContent, 'LinkedIn');
      assert.ok(footer.querySelector('a[href="https://www.linkedin.com/company/example"] svg'), 'the social link carries its platform logo');
      assert.equal(footer.querySelector('a[href="https://www.linkedin.com/company/example"] [aria-hidden="true"]').getAttribute('aria-hidden'), 'true');
      assert.ok(document.querySelector('header').textContent.includes('Get pricing'));
      await view.unmount();
    });

    test('with no settings saved the footer invents no contact details', async () => {
      const view = await visit('/');
      const footer = document.querySelector('footer');
      assert.match(footer.textContent, /Contact details will be published here/);
      assert.equal(footer.querySelector('a[href^="tel:"]'), null);
      assert.equal(footer.querySelector('a[href^="mailto:"]'), null);
      assert.doesNotMatch(footer.textContent, /\bMC\b|\bDOT\b/);
      await view.unmount();
    });

    test('the contact page shows the CMS contact details only when they exist', async () => {
      let view = await visit('/contact', { 'GET /content/site-settings': ok(settings()) });
      assert.match(document.querySelector('aside').textContent, /ops@example\.test/);
      await view.unmount();
      view = await visit('/contact');
      assert.match(document.querySelector('aside').textContent, /will be published here/);
      await view.unmount();
    });
  });

  describe('SEO', () => {
    test('a page’s CMS SEO sets title, description, robots and canonical; global settings fill the gaps', async () => {
      const view = await visit('/about', { 'GET /content/site-settings': ok(settings({ description: 'Global description.' })), 'GET /content/pages/about': ok(cmsPage({ title: 'About', slug: 'about', pageKey: 'about', content: 'About text from the CMS.', seo: seo({ title: 'Custom SEO title', description: 'Custom SEO description.', noIndex: true, canonicalUrl: '/about-us' }) })) });
      assert.equal(document.title, 'Custom SEO title | Hashimi Freight Co');
      assert.equal(meta('description'), 'Custom SEO description.');
      assert.equal(meta('robots'), 'noindex,follow');
      assert.equal(document.head.querySelector('link[rel="canonical"]').getAttribute('href'), 'https://example.test/about-us');
      await view.unmount();
      const other = await visit('/faq', { 'GET /content/site-settings': ok(settings({ description: 'Global description.' })) });
      assert.equal(meta('robots'), 'index,follow');
      assert.equal(document.head.querySelector('link[rel="canonical"]').getAttribute('href'), 'https://example.test/faq');
      await other.unmount();
    });

    test('without a configured site address no canonical link is guessed', async () => {
      const view = await visit('/faq', { 'GET /content/site-settings': ok(settings({ canonicalBaseUrl: null })) });
      assert.equal(document.head.querySelector('link[rel="canonical"]'), null);
      await view.unmount();
    });
  });

  describe('pages', () => {
    test('a published custom page renders its content as text at /pages/:slug', async () => {
      const view = await visit('/pages/hello', { 'GET /content/pages/hello': ok(cmsPage({ sections: [{ heading: 'Second block', body: 'More words.', image: null }], cta: { label: 'Contact us', url: '/contact' } })) });
      assert.equal(h.h1(), 'Hello');
      assert.match(h.text(), /First paragraph\./);
      assert.match(h.text(), /<script>alert\(1\)<\/script>/);
      assert.equal(document.querySelector('main script'), null);
      assert.match(h.text(), /Second block/);
      assert.equal(h.link('Contact us').getAttribute('href'), '/contact');
      await view.unmount();
    });

    test('an unpublished, missing or built-in page key is not served at /pages/:slug', async () => {
      let view = await visit('/pages/nope');
      assert.equal(h.h1(), 'Page not found');
      await view.unmount();
      view = await visit('/pages/about', { 'GET /content/pages/about': ok(cmsPage({ slug: 'about', pageKey: 'about' })) });
      assert.equal(h.h1(), 'Page not found');
      await view.unmount();
    });

    test('a published built-in page replaces the banner text and adds its content; unpublished keeps the built-in page', async () => {
      let view = await visit('/about');
      const builtIn = h.h1();
      await view.unmount();
      view = await visit('/about', { 'GET /content/pages/about': ok(cmsPage({ title: 'About', slug: 'about', pageKey: 'about', heroHeading: 'About, rewritten', content: 'Our story in plain text.' })) });
      assert.equal(h.h1(), 'About, rewritten');
      assert.match(h.text(), /Our story in plain text\./);
      assert.notEqual(h.h1(), builtIn);
      await view.unmount();
    });

    test('every page that was not editable before is now a built-in page: banner, content and search text come from the CMS, and unpublished keeps the built-in page', async () => {
      const pages = [['/become-a-carrier', 'become-a-carrier'], ['/carrier-resources', 'carrier-resources'], ['/request-quote', 'request-quote'], ['/track-shipment', 'track-shipment'], ['/resources', 'resources']];
      for (const [path, key] of pages) {
        let view = await visit(path);
        const builtIn = h.h1();
        await view.unmount();
        view = await visit(path, { [`GET /content/pages/${key}`]: ok(cmsPage({ title: key, slug: key, pageKey: key, heroHeading: `Edited ${key}`, content: `Text for ${key} from the CMS.`, seo: seo({ title: `SEO ${key}` }) })) });
        assert.equal(h.h1(), `Edited ${key}`, path);
        assert.match(h.text(), new RegExp(`Text for ${key} from the CMS\.`), path);
        assert.notEqual(h.h1(), builtIn, path);
        await view.unmount();
      }
    });

    test('the introduction picture of For Shippers, For Carriers, Services and Industries comes from the CMS page', async () => {
      for (const [path, key] of [['/for-shippers', 'for-shippers'], ['/for-carriers', 'for-carriers'], ['/services', 'services'], ['/industries', 'industries']]) {
        const url = `https://cdn.example.com/${key}-intro.jpg`;
        let view = await visit(path);
        assert.equal(document.querySelector(`img[src="${url}"]`), null, `${path} starts with the built-in illustration`);
        await view.unmount();
        view = await visit(path, { [`GET /content/pages/${key}`]: ok(cmsPage({ title: key, slug: key, pageKey: key, introImage: { url, altText: 'Intro picture' } })) });
        assert.ok(document.querySelector(`main img[src="${url}"]`), `${path} shows the CMS introduction picture`);
        await view.unmount();
      }
    });

    test('the homepage network map and quote form blocks take their text, pillars and button from the CMS, and can be hidden', async () => {
      let view = await visit('/');
      assert.match(h.text(), /Experience. Capacity. Flexibility./);
      assert.match(h.text(), /Get a Freight Quote/);
      await view.unmount();
      const network = header({ subtitle: 'Edited eyebrow', title: 'Edited network heading', description: 'Edited network text.', button: { label: 'Read more', url: '/contact' }, items: [{ title: 'Edited pillar', description: 'Edited pillar text.', icon: 'route' }] });
      const quote = header({ subtitle: 'Edited quote line', title: 'Edited quote heading', description: 'Edited quote text.' });
      view = await visit('/', { 'GET /content/homepage': ok(homeData({ network, quote })) });
      assert.match(h.text(), /Edited network heading/);
      assert.match(h.text(), /Edited pillar text./);
      assert.equal(h.link('Read more').getAttribute('href'), '/contact');
      assert.match(h.text(), /Edited quote heading/);
      assert.doesNotMatch(h.text(), /Experience. Capacity. Flexibility./);
      await view.unmount();
      view = await visit('/', { 'GET /content/homepage': ok(homeData({ network: header({ enabled: false, items: [] }), quote: header({ enabled: false }) })) });
      assert.ok(!sectionIds().includes('network'));
      assert.ok(!sectionIds().includes('get-a-quote'));
      await view.unmount();
    });

    test('the About page shows its six sections in order, and its call to action links to the existing routes', async () => {
      const view = await visit('/about');
      const ids = ['who-we-are', 'mission', 'approach', 'what-sets-us-apart', 'commitment', 'cta'];
      const found = ids.map((id) => document.getElementById(id));
      found.forEach((node, i) => assert.ok(node, ids[i]));
      found.slice(1).forEach((node, i) => assert.ok(found[i].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING, `${ids[i + 1]} follows ${ids[i]}`));
      const headings = (id) => [...document.getElementById(id).querySelectorAll('h2, h3')].map((n) => n.textContent.trim());
      assert.ok(headings('who-we-are').includes('Who We Are'));
      assert.ok(headings('mission').includes('Our Mission'));
      assert.ok(headings('approach').includes('Our Approach'));
      assert.deepEqual(headings('what-sets-us-apart'), ['What Sets Us Apart', 'Reliable Capacity', 'Nationwide Coverage', 'Cross-Border Expertise', 'Responsive Service']);
      assert.ok(headings('commitment').includes('Our Commitment to Customers'));
      assert.equal(headings('cta')[0], "Let's Move Freight Forward");
      assert.equal(h.link('Request a Quote', document.getElementById('cta')).getAttribute('href'), '/request-quote');
      assert.equal(h.link('Become a Carrier', document.getElementById('cta')).getAttribute('href'), '/become-a-carrier');
      assert.equal(document.querySelectorAll('[id="who-we-are"]').length, 1, 'no duplicated sections');
      await view.unmount();
    });

    test('the About page takes its sections from the published CMS page: new wording and picture, hidden sections stay hidden, empty fields keep the built-in text', async () => {
      const section = (heading, body = null, image = null) => ({ heading, body, image });
      const picture = { url: 'https://cdn.example.com/who.jpg', altText: 'Our dock' };
      const view = await visit('/about', { 'GET /content/pages/about': ok(cmsPage({ title: 'About', slug: 'about', pageKey: 'about', excerpt: null, content: null, sections: [
        section('Who We Are', 'A rewritten introduction.', picture),
        section('Our Mission'),
        section('What Sets Us Apart', 'New intro for the cards.'),
        section('Reliable Capacity', 'New card text.'),
        section('Cross-Border Expertise'),
        section('Our Commitment to Customers'),
        section('Let’s move freight, together', 'Updated closing line.'),
      ] })) });
      assert.match(document.getElementById('who-we-are').textContent, /A rewritten introduction./);
      assert.equal(document.querySelector('#who-we-are img').getAttribute('src'), picture.url);
      assert.match(document.getElementById('mission').textContent, /simplify freight coordination/, 'an empty field keeps the built-in text');
      assert.equal(document.getElementById('approach'), null, 'a section that is not in the published page is hidden');
      const cards = [...document.querySelectorAll('#what-sets-us-apart h3')].map((n) => n.textContent);
      assert.deepEqual(cards, ['Reliable Capacity', 'Cross-Border Expertise'], 'hidden cards are not shown');
      assert.match(document.getElementById('what-sets-us-apart').textContent, /New card text./);
      assert.equal(document.querySelector('#cta h2').textContent, 'Let’s move freight, together', 'a reworded heading keeps its place');
      assert.match(document.getElementById('cta').textContent, /Updated closing line./);
      await view.unmount();
    });

    test('the Services page cards show the same pictures as the homepage cards (the Super Admin’s card pictures first)', async () => {
      const url = 'https://cdn.example.com/ltl-card.jpg';
      const view = await visit('/services', { 'GET /content/homepage': ok(homeData({ services: { ...header(), cardImages: [{ slug: 'ltl', image: { url, altText: null } }] } })) });
      const pictures = [...document.querySelectorAll('#service-grid img')].map((img) => img.getAttribute('src'));
      assert.ok(pictures.includes(url), 'the card picture chosen in the Homepage editor is used on the Services page');
      await view.unmount();
    });

    test('a published Privacy page replaces the built-in placeholder template', async () => {
      const view = await visit('/privacy-policy', { 'GET /content/pages/privacy': ok(cmsPage({ title: 'Privacy', slug: 'privacy', pageKey: 'privacy', content: 'Approved privacy text.' })) });
      assert.match(h.text(), /Approved privacy text\./);
      assert.doesNotMatch(h.text(), /not legal advice/);
      await view.unmount();
    });
  });

  describe('services, industries, areas and FAQs', () => {
    test('the services page uses the CMS list once configured', async () => {
      const view = await visit('/services', { 'GET /content/services': ok({ configured: true, items: [card()] }) });
      assert.match(h.text(), /CMS Service/);
      assert.doesNotMatch(document.querySelector('#service-grid').textContent, /Full Truckload/);
      await view.unmount();
    });

    test('a CMS service renders its own detail page; an unknown slug is not found once the CMS is configured', async () => {
      const detail = { ...card(), fullDescription: 'Long text.\n\nSecond paragraph.', heroImage: null, benefits: ['A benefit'], features: ['A feature'], serviceAreas: [], cta: null, seo: seo({ title: 'CMS service SEO' }) };
      const routes = { 'GET /content/services': ok({ configured: true, items: [card()] }), 'GET /content/services/cms-svc': ok(detail) };
      let view = await visit('/services/cms-svc', routes);
      assert.equal(h.h1(), 'CMS Service');
      assert.match(h.text(), /A feature/);
      assert.match(h.text(), /Second paragraph\./);
      assert.equal(document.title, 'CMS service SEO | HASHIMI LOGISTICS LLC');
      await view.unmount();
      view = await visit('/services/ltl', routes);
      assert.equal(h.h1(), 'Service not found');
      await view.unmount();
      view = await visit('/services/ltl');
      assert.match(h.h1(), /Less-Than-Truckload/);
      await view.unmount();
    });

    test('industries and service areas follow the same rule', async () => {
      let view = await visit('/industries', { 'GET /content/industries': ok({ configured: true, items: [{ slug: 'mining', name: 'Mining', shortDescription: 'Heavy loads.', icon: null, image: null }] }) });
      assert.match(h.text(), /Mining/);
      assert.doesNotMatch(document.querySelector('#industry-grid').textContent, /Manufacturing/);
      await view.unmount();
      view = await visit('/service-areas', { 'GET /content/service-areas': ok({ configured: true, items: [{ slug: 'tx', name: 'Texas lanes', country: 'US', stateProvince: 'TX', cityRegion: null, description: 'Texas coverage.', image: null, coverageType: 'domestic' }] }) });
      assert.match(document.querySelector('#regions').textContent, /Texas lanes/);
      assert.match(document.querySelector('#regions').textContent, /United States/);
      await view.unmount();
      view = await visit('/industries/mining', { 'GET /content/industries': ok({ configured: true, items: [] }), 'GET /content/industries/mining': ok({ slug: 'mining', name: 'Mining', shortDescription: 'Heavy loads.', icon: null, image: null, description: 'Overview text.', benefits: ['Heavy haul'], cta: null, seo: seo() }) });
      assert.equal(h.h1(), 'Mining Freight');
      await view.unmount();
    });

    test('the FAQ page lists CMS questions once configured and searches them', async () => {
      const view = await visit('/faq', { 'GET /content/faqs': ok({ configured: true, items: [{ id: 'q1', question: 'Only CMS question?', answer: 'Yes.', category: 'General' }] }) });
      assert.match(h.text(), /1 question/);
      assert.match(h.text(), /Only CMS question\?/);
      assert.doesNotMatch(h.text(), /How do I request a quote/);
      await view.unmount();
    });
  });

  describe('blog', () => {
    test('the resources page lists only what the API returns and never invents posts', async () => {
      const view = await visit('/resources', { 'GET /content/blog': ok({ items: [], page: 1, limit: 9, total: 0, totalPages: 1, categories: [] }) });
      assert.match(h.text(), /No articles published yet/);
      assert.equal(document.querySelectorAll('main article').length, 0);
      await view.unmount();
    });
  });

  describe('website theme and section appearance (Stage 4)', () => {
    const themed = () => document.querySelector('[data-site-theme]');
    const themeVar = (name) => themed().style.getPropertyValue(name);

    test('the frontend theme and section specs are identical to the API\'s', async () => {
      const { pathToFileURL } = await import('node:url');
      const backend = (file) => import(pathToFileURL(`${ROOT}../backend/src/cms/${file}`).href);
      const [frontTheme, backTheme] = [await h.vite.ssrLoadModule('/src/config/themeAppearance.js'), await backend('themeAppearance.js')];
      assert.deepEqual(JSON.parse(JSON.stringify(frontTheme.THEME_APPEARANCE_SPEC)), JSON.parse(JSON.stringify(backTheme.THEME_APPEARANCE_SPEC)));
      const [frontSections, backSections] = [await h.vite.ssrLoadModule('/src/config/sectionAppearance.js'), await backend('sectionAppearance.js')];
      for (const name of ['SECTION_BACKGROUNDS', 'SECTION_SPACINGS', 'SECTION_ANIMATIONS', 'SECTION_CARD_STYLES', 'SECTION_APPEARANCE_CAPABILITIES', 'DEFAULT_SECTION_APPEARANCE']) {
        assert.deepEqual(JSON.parse(JSON.stringify(frontSections[name])), JSON.parse(JSON.stringify(backSections[name])), name);
      }
    });

    test('with no saved theme the public site uses the default palette variables', async () => {
      const view = await visit('/');
      assert.equal(themeVar('--color-ink-950'), '#111111');
      assert.equal(themeVar('--color-signal-400'), '#D8AD54');
      assert.equal(themeVar('--site-content-width'), '80rem');
      assert.equal(themeVar('--site-card-radius'), '0px', 'sharp = the current square cards');
      assert.equal(themeVar('--reveal-duration'), '600ms');
      await view.unmount();
    });

    test('a saved theme is applied to the public site only; malformed values fall back to the defaults', async () => {
      const themeAppearance = {
        colors: { accentColor: '#C9A045', surfaceColor: '#FAFAF9', darkestColor: 'red;}*{x' },
        layout: { cornerRadius: 'rounded', contentWidth: 'wide' },
        motion: { preset: 'off', durationMs: 450, staggerMs: 60 },
      };
      const view = await visit('/', { 'GET /content/site-settings': ok(settings({ themeAppearance })) });
      assert.equal(themeVar('--color-signal-400'), '#C9A045');
      assert.equal(themeVar('--color-surface'), '#FAFAF9');
      assert.equal(themeVar('--color-ink-950'), '#111111', 'a malformed colour falls back to the default');
      assert.equal(themeVar('--site-card-radius'), '1rem');
      assert.equal(themeVar('--site-content-width'), '90rem');
      assert.equal(themeVar('--reveal-start-opacity'), '1', 'animation off: content is shown at once');
      assert.equal(themeVar('--reveal-duration'), '0ms');
      assert.equal(document.documentElement.style.getPropertyValue('--color-signal-400'), '', 'never applied to the whole document (portals and admin keep the defaults)');
      await view.unmount();
    });

    test('homepage sections render their saved presets; unsaved sections keep their built-in look', async () => {
      const data = homeData();
      data.services = { ...data.services, appearance: { background: 'glass', spacing: 'spacious', animation: 'none', cardStyle: 'default' } };
      data.industries = { ...data.industries, appearance: { background: 'dark', spacing: 'compact', animation: 'fade', cardStyle: 'glass' } };
      data.faq = { ...data.faq, appearance: { background: 'dark', spacing: 'standard', animation: 'default', cardStyle: 'default' } };
      const view = await visit('/', { 'GET /content/homepage': ok(data) });
      const services = document.getElementById('services');
      assert.match(services.className, /\bbg-ink-950\b/);
      assert.match(services.className, /\bpy-20\b/, 'spacious spacing');
      assert.ok(services.querySelector('.glass-panel'), 'glass background puts the content on a glass panel');
      assert.ok([...services.querySelectorAll('.reveal')].every((el) => el.dataset.variant === 'none'), 'animation: none');
      assert.equal(services.dataset.surface, 'dark', 'light text on the glass background');

      const industries = document.getElementById('industries');
      assert.match(industries.className, /\bbg-ink-900\b/);
      assert.match(industries.className, /\bpy-10\b/, 'compact spacing');
      // The homepage shows industries as picture cards, which keep their own look; the glass card style applies to the plain card grid.
      assert.equal(industries.querySelectorAll('ul > li').length, 8, 'the eight industry cards are shown');
      assert.ok([...industries.querySelectorAll('.reveal')].every((el) => el.dataset.variant === 'fade'));

      const faq = document.getElementById('faq-preview');
      assert.doesNotMatch(faq.className, /bg-ink-9/, 'the FAQ cannot be made dark (its text is dark); the unsupported preset is ignored');

      const why = document.getElementById('why-hashimi');
      assert.match(why.className, /\bbg-ink-900\b/, 'an unsaved section keeps its built-in dark background');
      assert.match(why.className, /\bpy-14\b/, 'and its standard spacing');
      await view.unmount();
    });
  });

  describe('static guarantees', () => {
    const read = (file) => readFileSync(`${ROOT}${file}`, 'utf8');
    test('the public CMS client only reads: GET /content, no admin endpoint, no credentials, no secrets', () => {
      for (const file of ['src/services/contentService.js', 'src/services/cmsService.js', 'src/services/blogService.js']) {
        const code = read(file);
        assert.doesNotMatch(code, /apiClient\s*\.(post|put|patch|delete|request)\(/, `${file} only reads`);
        assert.doesNotMatch(code, /\/admin\/|Authorization|localStorage/, `${file} touches no admin or credential`);
      }
      assert.match(read('src/services/contentService.js'), /apiClient\s*\.get\(`\/content\$\{path\}`/);
    });
    test('CMS text is rendered only through text nodes', () => {
      assert.doesNotMatch(read('src/components/common/PlainText.jsx'), /dangerouslySetInnerHTML|innerHTML/);
      assert.doesNotMatch(read('src/components/sections/CmsPageContent.jsx'), /dangerouslySetInnerHTML|innerHTML/);
    });
  });
});
