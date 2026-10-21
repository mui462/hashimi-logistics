/**
 * Phase 9 Website CMS admin UI, rendered in jsdom against a mocked API (mocks live only in this file).
 * Covers navigation and guards, list/search/filter/pagination/empty/error states, create/edit forms (validation, server field
 * errors, duplicate-submit protection, slug-change confirmation, unsaved-change protection), archive/restore/reorder,
 * homepage, pages, blog scheduling, media and SEO, settings, and static guarantees. Run with: npm test
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { act, createHarness, page, ROOT, seo } from './cms-harness.mjs';

const stamp = '2026-10-01T12:00:00.000Z';
const service = (extra = {}) => ({ id: 'a'.repeat(24), name: 'Dry Van Freight', slug: 'dry-van', shortDescription: 'Enclosed trailers.', fullDescription: null, icon: null, image: null, heroImage: null, benefits: [], features: [], serviceAreaIds: [], serviceAreas: [], cta: null, isFeatured: false, isActive: true, isArchived: false, displayOrder: 10, SEO: seo(), createdAt: stamp, updatedAt: stamp, ...extra });
const faq = (extra = {}) => ({ id: 'f'.repeat(24), question: 'How do I request a quote?', answer: 'Use the form.', category: 'Quotes', isActive: true, isArchived: false, displayOrder: 10, createdAt: stamp, updatedAt: stamp, ...extra });
const post = (extra = {}) => ({ id: 'b'.repeat(24), title: 'Border basics', slug: 'border-basics', excerpt: 'Short.', content: 'Body text.', featuredImage: null, category: 'Freight', tags: [], authorName: null, isFeatured: false, status: 'draft', isLive: false, publishedAt: null, scheduledAt: null, SEO: seo(), createdAt: stamp, updatedAt: stamp, ...extra });
const pageRecord = (extra = {}) => ({ id: 'c'.repeat(24), title: 'About', slug: 'about', pageKey: 'about', isSystem: true, status: 'draft', excerpt: null, content: null, heroHeading: null, heroSubtitle: null, heroImage: null, sections: [], cta: null, displayOrder: 0, SEO: seo(), createdAt: stamp, updatedAt: stamp, ...extra });
const media = (extra = {}) => ({ id: 'd'.repeat(24), fileName: 'dock.jpg', url: 'https://cdn.example.com/dock.jpg', type: 'image', mimeType: null, size: null, width: null, height: null, altText: 'A loading dock', caption: null, folder: 'general', provider: 'external', isArchived: false, createdAt: stamp, updatedAt: stamp, ...extra });
const homepage = (extra = {}) => ({ exists: true, updatedAt: stamp, sectionOrder: ['trust', 'services', 'whyChooseUs', 'howItWorks', 'industries', 'crossBorder', 'serviceAreas', 'stats', 'testimonials', 'faq', 'finalCTA'], hero: { eyebrow: null, title: 'Move freight', subtitle: null, description: null, backgroundVideo: null, fallbackImage: null, poster: null, primaryButton: null, secondaryButton: null, overlay: { color: '#000000', opacity: 0.5, isActive: true }, autoplay: true, muted: true, loop: true, isActive: true }, stats: [], SEO: seo(), ...extra });

const CMS_PATHS = ['/admin/cms', '/admin/cms/homepage', '/admin/cms/pages', '/admin/cms/pages/new', '/admin/cms/services', '/admin/cms/services/new', '/admin/cms/industries', '/admin/cms/industries/new', '/admin/cms/service-areas', '/admin/cms/service-areas/new', '/admin/cms/blog', '/admin/cms/blog/new', '/admin/cms/faqs', '/admin/cms/faqs/new', '/admin/cms/testimonials', '/admin/cms/testimonials/new', '/admin/cms/media', '/admin/cms/seo', '/admin/settings'];

describe('Phase 9 Website CMS admin', () => {
  let h;
  const defaults = () => ({
    'GET /admin/cms/overview': () => ({ data: { homepage: { configured: false }, settings: { configured: false }, storage: { configured: false, uploadsAvailable: false, message: 'Media storage is not configured yet.' }, pages: { total: 0, published: 0 }, services: { total: 1, visible: 1 }, industries: { total: 0, visible: 0 }, serviceAreas: { total: 0, visible: 0 }, faqs: { total: 0, visible: 0 }, testimonials: { total: 0, visible: 0 }, blog: { total: 0, live: 0 }, media: { total: 0 } } }),
    'GET /admin/cms/homepage': () => ({ data: homepage() }),
    'GET /admin/cms/pages': () => ({ data: page([], { availableSystemPages: ['about', 'faq'] }) }),
    'GET /admin/cms/services': () => ({ data: page([service()]) }),
    'GET /admin/cms/industries': () => ({ data: page([]) }),
    'GET /admin/cms/service-areas': () => ({ data: page([]) }),
    'GET /admin/cms/blog': () => ({ data: page([]) }),
    'GET /admin/cms/faqs': () => ({ data: page([faq()]) }),
    'GET /admin/cms/testimonials': () => ({ data: page([]) }),
    'GET /admin/cms/media': () => ({ data: page([], { folders: [], storage: { uploadsAvailable: false } }) }),
    'GET /admin/cms/media/storage': () => ({ data: { configured: false, uploadsAvailable: false, externalLinksAvailable: true, message: 'Media storage is not configured yet.' } }),
    'GET /admin/cms/seo': () => ({ data: { global: { exists: false, siteName: null, websiteTitle: null, description: null, canonicalBaseUrl: null, defaultSEO: seo() }, entries: [{ kind: 'homepage', id: null, title: 'Homepage', path: '/', status: 'published', seo: seo(), issues: ['No SEO title'] }] } }),
    'GET /admin/cms/settings': () => ({ data: { exists: false } }),
  });
  const visit = (path, options = {}) => h.visit(path, { ...options, routes: { ...defaults(), ...(options.routes ?? {}) } });

  before(async () => {
    h = await createHarness();
  });
  after(async () => {
    await h.close();
  });

  describe('navigation and guards', () => {
    test('every CMS route renders one h1 inside the admin layout', async () => {
      for (const path of CMS_PATHS) {
        const view = await visit(path);
        assert.equal(view.path(), path, `${path} is not redirected`);
        assert.ok(h.h1(), `${path} has a heading`);
        assert.equal(document.querySelectorAll('h1').length, 1, `${path} has exactly one h1`);
        assert.ok(document.querySelector('nav[aria-label="Super Admin"]'), `${path} sits in the admin layout`);
        await view.unmount();
      }
    });

    test('the sidebar has a Website CMS group and keeps the section active on nested routes', async () => {
      const view = await visit('/admin/cms/services/new');
      const nav = document.querySelector('nav[aria-label="Super Admin"]');
      assert.ok([...nav.querySelectorAll('h2')].some((node) => node.textContent === 'Website CMS'));
      for (const label of ['Homepage', 'Pages', 'Services', 'Industries', 'Service areas', 'Blog / Resources', 'FAQs', 'Testimonials', 'Media library', 'SEO']) assert.ok(h.link(label) && nav.contains(h.link(label)), label);
      assert.equal(nav.querySelector('[aria-current="page"]').textContent, 'Services');
      await view.unmount();
    });

    test('old placeholder paths redirect to the real pages and Settings stays a single page', async () => {
      let view = await visit('/admin/seo');
      assert.equal(view.path(), '/admin/cms/seo');
      await view.unmount();
      view = await visit('/admin/cms/settings');
      assert.equal(view.path(), '/admin/settings');
      await view.unmount();
      view = await visit('/admin/cms/homepage-sections');
      assert.equal(view.path(), '/admin/cms/homepage');
      await view.unmount();
    });

    test('guests, customers and carriers never reach CMS screens or call the CMS API', async () => {
      for (const [as, expected] of [[null, '/admin/login'], ['customer', '/customer'], ['carrier', '/carrier']]) {
        const view = await visit('/admin/cms/homepage', { as });
        assert.equal(view.path(), expected);
        assert.equal(h.state.calls.filter((call) => call.key.includes('/admin/cms')).length, 0, `${as} makes no CMS call`);
        await view.unmount();
      }
    });
  });

  describe('overview', () => {
    test('shows counts and says honestly that uploads are not available', async () => {
      const view = await visit('/admin/cms');
      assert.match(h.text(), /Media storage is not configured yet/);
      assert.match(h.text(), /Built-in/);
      await view.unmount();
    });
  });

  describe('collection lists', () => {
    test('render rows, send filters to the API, validate search and show empty and error states', async () => {
      let view = await visit('/admin/cms/services');
      assert.match(h.text(), /Dry Van Freight/);
      assert.ok(h.link('Dry Van Freight').getAttribute('href').endsWith(`/admin/cms/services/${'a'.repeat(24)}`));
      await h.fill({ 'Search services': 'x' });
      await h.click(h.button('Apply filters'));
      assert.match(h.text(), /at least 2 characters/);
      await h.fill({ 'Search services': 'van', 'Visible on website': 'true' });
      await h.click(h.button('Apply filters'));
      assert.equal(view.path(), '/admin/cms/services?q=van&visible=true');
      assert.deepEqual(h.called('GET /admin/cms/services').at(-1).params, { q: 'van', visible: 'true' });
      await view.unmount();

      view = await visit('/admin/cms/industries');
      assert.match(h.text(), /No industries yet/);
      await view.unmount();

      let fail = true;
      view = await visit('/admin/cms/faqs', { routes: { 'GET /admin/cms/faqs': () => (fail ? { status: 500, body: { message: 'Boom' } } : { data: page([faq()]) }) } });
      assert.match(h.text(), /We could not load this list/);
      fail = false;
      await h.click(h.button('Try again') ?? h.button('Retry'));
      assert.match(h.text(), /How do I request a quote/);
      await view.unmount();
    });

    test('archive asks first, Escape cancels, confirming calls the archive endpoint and restore is offered for archived items', async () => {
      const view = await visit('/admin/cms/services');
      await h.click(h.button('Archive Dry Van Freight'));
      assert.ok(h.dialog());
      await h.press('Escape');
      assert.equal(h.dialog(), null);
      assert.equal(h.called(`POST /admin/cms/services/${'a'.repeat(24)}/archive`).length, 0);
      await h.click(h.button('Archive Dry Van Freight'));
      await h.click(h.button('Archive', h.dialog()));
      assert.equal(h.called(`POST /admin/cms/services/${'a'.repeat(24)}/archive`).length, 1);
      await view.unmount();

      const archived = await visit('/admin/cms/services?archived=true', { routes: { 'GET /admin/cms/services': () => ({ data: page([service({ isArchived: true })]) }) } });
      assert.ok(h.button('Restore Dry Van Freight'));
      await archived.unmount();
    });

    test('reorder moves items with buttons and saves the new order', async () => {
      const items = [faq({ id: '1'.repeat(24), question: 'First question' }), faq({ id: '2'.repeat(24), question: 'Second question' })];
      const view = await visit('/admin/cms/faqs', { routes: { 'GET /admin/cms/faqs': () => ({ data: page(items) }), 'POST /admin/cms/faqs/reorder': () => ({ data: page(items) }) } });
      await h.click(h.button('Reorder'));
      await h.click(h.button('Move First question down'));
      await h.click(h.button('Save order'));
      assert.deepEqual(h.called('POST /admin/cms/faqs/reorder')[0].body, { ids: ['2'.repeat(24), '1'.repeat(24)] });
      await view.unmount();
    });
  });

  describe('editor forms', () => {
    test('create: validation blocks the request, a valid form sends only content fields, then opens the saved record', async () => {
      const created = service({ id: 'e'.repeat(24), name: 'Reefer' });
      const view = await visit('/admin/cms/services/new', { routes: { 'POST /admin/cms/services': () => ({ status: 201, data: created }), [`GET /admin/cms/services/${'e'.repeat(24)}`]: () => ({ data: created }) } });
      await h.submit(h.form('service editor'));
      assert.match(h.text(), /Enter the service name/);
      assert.equal(h.called('POST /admin/cms/services').length, 0);
      assert.equal(document.activeElement, h.labelled('Service name'), 'focus moves to the first invalid field');
      await h.fill({ 'Service name': 'Reefer', 'Short description': 'Temperature controlled.' });
      await h.submit(h.form('service editor'));
      const sent = h.called('POST /admin/cms/services');
      assert.equal(sent.length, 1);
      assert.equal(sent[0].body.name, 'Reefer');
      for (const forbidden of ['id', '_id', 'role', 'accountType', 'status', 'archivedAt', 'createdBy', 'userId']) assert.ok(!(forbidden in sent[0].body), `${forbidden} is never sent`);
      assert.equal(view.path(), `/admin/cms/services/${'e'.repeat(24)}`);
      await view.unmount();
    });

    test('server field errors appear on the field, no success message is shown for a failed save', async () => {
      const view = await visit('/admin/cms/faqs/new', { routes: { 'POST /admin/cms/faqs': () => ({ status: 422, body: { message: 'Please correct the highlighted fields.', errors: [{ field: 'answer', message: 'Do not make guarantees.' }] } }) } });
      await h.fill({ Question: 'Is it fast?', Answer: 'We guarantee it.' });
      await h.submit(h.form('FAQ editor'));
      assert.match(h.text(), /Do not make guarantees/);
      assert.doesNotMatch(document.body.textContent, /Saved\.|created/);
      assert.equal(h.labelled('Answer').getAttribute('aria-invalid'), 'true');
      await view.unmount();
    });

    test('a double submit sends one request and the button shows a busy state', async () => {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const view = await visit('/admin/cms/faqs/new', { routes: { 'POST /admin/cms/faqs': () => ({ status: 201, data: faq() }), [`GET /admin/cms/faqs/${'f'.repeat(24)}`]: () => ({ data: faq() }) } });
      await h.fill({ Question: 'Q?', Answer: 'A.' });
      const form = h.form('FAQ editor');
      await act(async () => { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
      release();
      await h.tick(80);
      assert.equal(h.called('POST /admin/cms/faqs').length, 1);
      await view.unmount();
    });

    test('changing the address of live content asks for confirmation and resends with the confirmation flag', async () => {
      let calls = 0;
      const view = await visit(`/admin/cms/services/${'a'.repeat(24)}`, {
        routes: {
          [`GET /admin/cms/services/${'a'.repeat(24)}`]: () => ({ data: service() }),
          [`PATCH /admin/cms/services/${'a'.repeat(24)}`]: ({ body }) => { calls += 1; return body.confirmSlugChange ? { data: service({ slug: 'dry-van-2' }) } : { status: 409, body: { message: 'Confirm', code: 'SLUG_CHANGE_NEEDS_CONFIRMATION' } }; },
        },
      });
      await h.fill({ 'Web address': 'dry-van-2' });
      await h.submit(h.form('service editor'));
      assert.match(h.dialog().textContent, /Change this page address/);
      assert.equal(calls, 1);
      await h.click(h.button('Change the address', h.dialog()));
      assert.equal(calls, 2);
      const patches = h.called(`PATCH /admin/cms/services/${'a'.repeat(24)}`);
      assert.equal(patches[0].body.slug, 'dry-van-2');
      assert.equal(patches[1].body.confirmSlugChange, true);
      await view.unmount();
    });

    test('unsaved edits trigger a leave-without-saving dialog; staying keeps the edits', async () => {
      const view = await visit(`/admin/cms/services/${'a'.repeat(24)}`, { routes: { [`GET /admin/cms/services/${'a'.repeat(24)}`]: () => ({ data: service() }) } });
      await h.fill({ 'Service name': 'Changed' });
      assert.match(h.text(), /unsaved changes/);
      await h.click(h.link('Services'));
      assert.match(h.dialog().textContent, /Leave without saving/);
      await h.click(h.button('Cancel', h.dialog()));
      assert.equal(view.path(), `/admin/cms/services/${'a'.repeat(24)}`);
      assert.equal(h.labelled('Service name').value, 'Changed');
      await view.unmount();
    });

    test('an unknown record shows a not-found state, not a blank form', async () => {
      const view = await visit(`/admin/cms/services/${'9'.repeat(24)}`, { routes: { [`GET /admin/cms/services/${'9'.repeat(24)}`]: () => ({ status: 404, body: { message: 'Not found' } }) } });
      assert.match(h.text(), /was not found/);
      assert.equal(h.form('service editor'), undefined);
      await view.unmount();
    });
  });

  describe('media picker', () => {
    test('choose, preview with alt text, remove, and Escape closes the picker and returns focus', async () => {
      const view = await visit('/admin/cms/services/new', { routes: { 'GET /admin/cms/media': () => ({ data: page([media()], { folders: [], storage: {} }) }) } });
      const opener = h.button('Choose from library');
      opener.focus();
      await h.click(opener);
      assert.match(h.dialog().textContent, /Choose an image/);
      await h.press('Escape');
      assert.equal(h.dialog(), null);
      await h.click(h.button('Choose from library'));
      await h.click(h.button('dock.jpg') ?? [...h.dialog().querySelectorAll('button')].find((b) => b.textContent.includes('dock.jpg')));
      assert.equal(h.dialog(), null);
      assert.ok(document.querySelector('img[alt="Preview of Card image"]'));
      assert.equal(h.labelled('Alt text').value, 'A loading dock');
      await h.fill({ 'Service name': 'With picture' });
      await h.submit(h.form('service editor'));
      assert.deepEqual(h.called('POST /admin/cms/services')[0].body.image, { url: 'https://cdn.example.com/dock.jpg', altText: 'A loading dock', mediaId: 'd'.repeat(24) });
      await h.click(h.button('Remove'));
      assert.equal(document.querySelector('img[alt="Preview of Card image"]'), null);
      await h.submit(h.form('service editor'));
      assert.equal(h.called('POST /admin/cms/services')[1].body.image, null, 'removing sends null');
      await view.unmount();
    });

    test('a picture can be added by its link from inside the picker and is chosen straight away', async () => {
      const added = media({ id: 'e'.repeat(24), fileName: 'dock.jpg', url: 'https://cdn.example.com/new/dock.jpg', altText: 'New dock' });
      const view = await visit('/admin/cms/services/new', { routes: { 'GET /admin/cms/media': () => ({ data: page([], { folders: [], storage: {} }) }), 'POST /admin/cms/media/external': () => ({ status: 201, data: added }) } });
      await h.click(h.button('Choose from library'));
      assert.match(h.dialog().textContent, /Add a new picture/);
      assert.match(h.dialog().textContent, /File uploads are not set up/);
      await h.fill({ 'Picture web address': 'http://insecure.example.com/a.jpg' });
      await h.submit(h.form('Add a picture by link'));
      assert.match(h.dialog().textContent, /starting with https/);
      assert.equal(h.called('POST /admin/cms/media/external').length, 0);
      await h.fill({ 'Picture web address': 'https://cdn.example.com/new/dock.jpg', 'Alt text': 'New dock' });
      await h.submit(h.form('Add a picture by link'));
      const sent = h.called('POST /admin/cms/media/external')[0].body;
      assert.deepEqual({ url: sent.url, fileName: sent.fileName, type: sent.type, altText: sent.altText }, { url: 'https://cdn.example.com/new/dock.jpg', fileName: 'dock.jpg', type: 'image', altText: 'New dock' });
      assert.equal(h.dialog(), null);
      assert.ok(document.querySelector('img[alt="Preview of Card image"]'));
      await view.unmount();
    });

    test('Fill pictures from library hands out library pictures to empty spots only, creates and publishes missing menu pages, and keeps existing pictures', async () => {
      const images = [1, 2, 3, 4].map((n) => media({ id: String(n).repeat(24), fileName: `p${n}.jpg`, url: `https://cdn.example.com/p${n}.jpg`, altText: null }));
      const about = pageRecord({ heroImage: { url: 'https://cdn.example.com/own.jpg', altText: 'Own', mediaId: null }, status: 'published' });
      const services = pageRecord({ id: 'e'.repeat(24), title: 'Services', slug: 'services', pageKey: 'services', status: 'draft' });
      const created = pageRecord({ id: '9'.repeat(24), status: 'draft' });
      const view = await visit('/admin/cms/pages', { routes: {
        'GET /admin/cms/media': () => ({ data: page(images, { folders: [], storage: {} }) }),
        'GET /admin/cms/pages': () => ({ data: page([{ ...about, excerpt: null }, { ...services, excerpt: null }], { availableSystemPages: [] }) }),
        [`GET /admin/cms/pages/${about.id}`]: () => ({ data: about }),
        [`GET /admin/cms/pages/${services.id}`]: () => ({ data: services }),
        [`PATCH /admin/cms/pages/${services.id}`]: () => ({ data: services }),
        'POST /admin/cms/pages': () => ({ status: 201, data: created }),
        [`POST /admin/cms/pages/${created.id}/publish`]: () => ({ data: { ...created, status: 'published' } }),
      } });
      await h.click(h.button('Fill pictures from library'));
      assert.match(h.dialog().textContent, /Page will be created/);
      assert.doesNotMatch(h.dialog().textContent, /About Us/, 'a page that needs nothing is not listed');
      await h.click(h.button('Fill pictures'));
      const saved = h.called(`PATCH /admin/cms/pages/${services.id}`);
      assert.equal(saved.length, 1);
      assert.equal(saved[0].body.heroImage.url, 'https://cdn.example.com/p1.jpg');
      assert.equal(saved[0].body.introImage.url, 'https://cdn.example.com/p2.jpg');
      assert.equal(saved[0].body.heroImage.altText, 'Services', 'alt text falls back to the page title');
      assert.equal(h.called(`PATCH /admin/cms/pages/${about.id}`).length, 0, 'a page that already has its picture is untouched');
      assert.ok(h.called('POST /admin/cms/pages').length >= 8, 'missing menu pages are created');
      assert.ok(h.called('POST /admin/cms/pages').every((call) => call.body.pageKey && call.body.heroImage.url && !('heroHeading' in call.body)));
      assert.ok(h.called(`POST /admin/cms/pages/${created.id}/publish`).length >= 8, 'created pages are published');
      assert.equal(h.called(`POST /admin/cms/pages/${services.id}/publish`).length, 0, 'an existing draft is never published');
      assert.match(h.dialog().textContent, /Publish the page to show them/);
      await view.unmount();
    });

    test('an empty library explains how to add media instead of showing a blank dialog', async () => {
      const view = await visit('/admin/cms/faqs', { routes: {} });
      await view.unmount();
      const service = await visit('/admin/cms/services/new');
      await h.click(h.button('Choose from library'));
      assert.match(h.dialog().textContent, /No images in the library yet/);
      assert.match(h.dialog().textContent, /Media Library/);
      await service.unmount();
    });
  });

  describe('homepage', () => {
    test('section order and visibility are editable and saved as one request without invented fields', async () => {
      const view = await visit('/admin/cms/homepage', { routes: { 'PATCH /admin/cms/homepage': () => ({ data: homepage({ updatedAt: '2026-10-02T00:00:00.000Z' }) }) } });
      await h.click(h.button('Move Trust strip down'));
      await h.click(h.button('Hide Statistics'));
      await h.submit(h.form('Homepage editor'));
      const sent = h.called('PATCH /admin/cms/homepage');
      assert.equal(sent.length, 1);
      assert.deepEqual(sent[0].body.sectionOrder.slice(0, 2), ['services', 'trust']);
      assert.equal(sent[0].body.statsSection.isActive, false);
      assert.equal(sent[0].body.hero.overlay.opacity, 0.5);
      for (const forbidden of ['role', 'status', 'id', '_id', 'userId']) assert.ok(!(forbidden in sent[0].body));
      await view.unmount();
    });

    test('section appearance presets: only supported options are offered, saved with the section, and the hero overlay is kept', async () => {
      const saved = homepage({ servicesSection: { title: 'Our services', subtitle: null, description: null, isActive: true, image: null, button: null, appearance: { background: 'glass', spacing: 'spacious', animation: 'fade', cardStyle: 'default' } } });
      const view = await visit('/admin/cms/homepage', { routes: { 'GET /admin/cms/homepage': () => ({ data: saved }), 'PATCH /admin/cms/homepage': () => ({ data: saved }) } });
      // Each section's editor panel is a <section> labelled by its h2; its Appearance selects are found by label.
      const panelOf = { servicesSection: 'Services', faq: 'FAQ', trust: 'Trust strip', industries: 'Industries' };
      const labelOf = { background: 'Background', spacing: 'Spacing', animation: 'Animation', cardStyle: 'Cards' };
      const select = (name) => {
        const [, field, , kind] = name.split('.');
        const heading = [...document.querySelectorAll('main section h2')].find((node) => node.textContent.trim() === panelOf[field]);
        const label = [...heading.closest('section').querySelectorAll('label')].find((node) => node.textContent.trim().startsWith(labelOf[kind]));
        return label ? document.getElementById(label.htmlFor) : null;
      };
      const values = (name) => [...select(name).options].map((option) => option.value).filter(Boolean);
      assert.equal(select('sections.servicesSection.appearance.background').value, 'glass', 'the saved preset is shown');
      assert.deepEqual(values('sections.faq.appearance.background'), ['default', 'light', 'muted'], 'the FAQ is never offered a dark background');
      assert.equal(select('sections.trust.appearance.background'), null, 'the trust strip has no background control');
      assert.equal(select('sections.servicesSection.appearance.cardStyle'), null, 'services has no card style control');
      const faqBackground = select('sections.faq.appearance.background');
      await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(faqBackground, 'muted');
        faqBackground.dispatchEvent(new window.Event('change', { bubbles: true }));
      });
      await h.submit(h.form('Homepage editor'));
      const body = h.called('PATCH /admin/cms/homepage')[0].body;
      assert.deepEqual(body.servicesSection.appearance, { background: 'glass', spacing: 'spacious', animation: 'fade' });
      assert.equal(body.servicesSection.title, 'Our services', 'content is saved with it');
      assert.deepEqual(body.faq.appearance, { background: 'muted', spacing: 'standard', animation: 'default' });
      assert.deepEqual(body.trust.appearance, { animation: 'default' });
      assert.deepEqual(body.industries.appearance, { background: 'default', spacing: 'standard', animation: 'default', cardStyle: 'default' });
      assert.equal(body.hero.overlay.opacity, 0.5, 'the saved hero overlay travels unchanged');
      await view.unmount();
    });

    test('the network map and quote form blocks are editable, shown in the editor, and saved without section order or appearance fields', async () => {
      const saved = homepage({ networkSection: { title: 'Our network', subtitle: 'Eyebrow', description: null, isActive: true, image: null, button: { label: 'Read more', url: '/contact' }, items: [{ id: 'a'.repeat(24), title: 'Experience', description: 'Text', icon: 'shield', displayOrder: 0, isActive: true }] }, quoteSection: { title: 'Quote us', subtitle: null, description: null, isActive: false, image: null, button: null } });
      const view = await visit('/admin/cms/homepage', { routes: { 'GET /admin/cms/homepage': () => ({ data: saved }), 'PATCH /admin/cms/homepage': () => ({ data: saved }) } });
      assert.match(h.text(), /Network map block/);
      assert.match(h.text(), /Quote form block/);
      await h.submit(h.form('Homepage editor'));
      const body = h.called('PATCH /admin/cms/homepage')[0].body;
      assert.equal(body.networkSection.title, 'Our network');
      assert.deepEqual(body.networkSection.button, { label: 'Read more', url: '/contact' });
      assert.equal(body.networkSection.items.length, 1);
      assert.equal(body.networkSection.items[0].title, 'Experience');
      assert.equal(body.quoteSection.isActive, false);
      for (const key of ['networkSection', 'quoteSection']) {
        assert.ok(!('appearance' in body[key]), `${key} has no appearance`);
        assert.ok(!('image' in body[key]) || body[key].image === null || body[key].image === undefined, `${key} has no image`);
      }
      assert.ok(!body.sectionOrder.includes('network') && !body.sectionOrder.includes('quote'), 'fixed blocks are not in the section order');
      await view.unmount();
    });

    test('an invalid overlay strength is stopped in the form', async () => {
      const view = await visit('/admin/cms/homepage');
      await h.fill({ 'Overlay strength': '7' });
      await h.submit(h.form('Homepage editor'));
      assert.match(h.text(), /from 0 \(clear\) to 1/);
      assert.equal(h.called('PATCH /admin/cms/homepage').length, 0);
      await view.unmount();
    });

    test('says the built-in homepage is in use until it is customised', async () => {
      const view = await visit('/admin/cms/homepage', { routes: { 'GET /admin/cms/homepage': () => ({ data: { exists: false, sectionOrder: homepage().sectionOrder } }) } });
      assert.match(h.text(), /built-in content/);
      await view.unmount();
    });
  });

  describe('pages', () => {
    test('offers the built-in pages that have no CMS version and creates one with its fixed address', async () => {
      const created = pageRecord();
      const view = await visit('/admin/cms/pages', { routes: { 'POST /admin/cms/pages': () => ({ status: 201, data: created }), [`GET /admin/cms/pages/${'c'.repeat(24)}`]: () => ({ data: created }) } });
      assert.match(h.text(), /Built-in pages you have not customised/);
      await h.click(h.link('About'));
      assert.equal(view.path(), '/admin/cms/pages/new?key=about');
      assert.match(h.text(), /Address:\s*\/about/);
      assert.equal(document.querySelector('input[name="slug"]'), null, 'a system page address cannot be edited');
      await h.submit(h.form('Page editor'));
      assert.equal(h.called('POST /admin/cms/pages')[0].body.pageKey, 'about');
      const sent = h.called('POST /admin/cms/pages')[0].body.sections;
      assert.deepEqual(sent.map((section) => section.heading), ['Who We Are', 'Our Mission', 'Our Approach', 'What Sets Us Apart', 'Reliable Capacity', 'Nationwide Coverage', 'Cross-Border Expertise', 'Responsive Service', 'Our Commitment to Customers', "Let's Move Freight Forward"], 'the built-in About sections are offered for editing, in their fixed order');
      assert.ok(sent.every((section) => section.isActive === true && section.body.length > 0));
      assert.ok(!('slug' in h.called('POST /admin/cms/pages')[0].body));
      await view.unmount();
    });

    test('publish asks first, then calls the publish action; system pages cannot be archived', async () => {
      const record = pageRecord();
      const view = await visit(`/admin/cms/pages/${record.id}`, { routes: { [`GET /admin/cms/pages/${record.id}`]: () => ({ data: record }), [`POST /admin/cms/pages/${record.id}/publish`]: () => ({ data: { ...record, status: 'published' } }) } });
      assert.ok(!h.button('Archive'));
      await h.click(h.button('Publish'));
      assert.match(h.dialog().textContent, /last saved version/);
      await h.click(h.button('Publish', h.dialog()));
      assert.equal(h.called(`POST /admin/cms/pages/${record.id}/publish`).length, 1);
      await view.unmount();
    });
  });

  describe('blog', () => {
    test('list shows status and publication time; scheduled posts are labelled as not yet public', async () => {
      const view = await visit('/admin/cms/blog', { routes: { 'GET /admin/cms/blog': () => ({ data: page([post({ status: 'scheduled', scheduledAt: '2099-01-01T15:00:00.000Z' }), post({ id: '7'.repeat(24), title: 'Live post', status: 'published', isLive: true, publishedAt: stamp })]) }) } });
      assert.match(h.text(), /Goes live/);
      assert.match(h.text(), /Scheduled/);
      assert.match(h.text(), /Published/);
      await view.unmount();
    });

    test('a draft can be scheduled only for a future time and the request carries an ISO instant', async () => {
      const record = post();
      const view = await visit(`/admin/cms/blog/${record.id}`, { routes: { [`GET /admin/cms/blog/${record.id}`]: () => ({ data: record }), [`POST /admin/cms/blog/${record.id}/schedule`]: () => ({ data: { ...record, status: 'scheduled' } }) } });
      await h.click(h.button('Schedule'));
      assert.match(h.dialog().textContent, /browser’s time zone/);
      await h.fill({ 'Go live on': '2001-01-01T10:00' }, h.dialog());
      await h.submit(h.dialog().querySelector('form'));
      assert.match(h.dialog().textContent, /future/);
      assert.equal(h.called(`POST /admin/cms/blog/${record.id}/schedule`).length, 0);
      await h.fill({ 'Go live on': '2099-01-01T10:00' }, h.dialog());
      await h.submit(h.dialog().querySelector('form'));
      const body = h.called(`POST /admin/cms/blog/${record.id}/schedule`)[0].body;
      assert.match(body.scheduledAt, /^2099-01-01T\d\d:\d\d:00\.000Z$/);
      await view.unmount();
    });

    test('the preview shows article text as plain text, never as markup', async () => {
      const record = post({ content: 'Hello\n\n<script>alert(1)</script>' });
      const view = await visit(`/admin/cms/blog/${record.id}`, { routes: { [`GET /admin/cms/blog/${record.id}`]: () => ({ data: record }) } });
      await h.click(h.button('Preview text'));
      assert.equal(document.querySelector('main script'), null);
      assert.match(h.text(), /<script>alert\(1\)<\/script>/);
      await view.unmount();
    });
  });

  describe('media library', () => {
    test('uploads are honestly unavailable; add-by-link validates and posts; delete asks first and is permanent', async () => {
      const view = await visit('/admin/cms/media', { routes: { 'GET /admin/cms/media': () => ({ data: page([media()], { folders: [], storage: {} }) }), 'POST /admin/cms/media/external': () => ({ status: 201, data: media() }), [`DELETE /admin/cms/media/${'d'.repeat(24)}`]: () => ({ data: { id: 'd'.repeat(24), deleted: true } }) } });
      assert.match(h.text(), /File uploads are not available/);
      assert.equal(h.button('Upload file').disabled, true);
      await h.click(h.button('Add by link'));
      await h.submit(h.dialog().querySelector('form'));
      assert.match(h.dialog().textContent, /Enter the full web address/);
      assert.equal(h.called('POST /admin/cms/media/external').length, 0);
      await h.fill({ 'File address': 'https://cdn.example.com/a.jpg', 'File name': 'a.jpg' }, h.dialog());
      await h.submit(h.dialog().querySelector('form'));
      assert.equal(h.called('POST /admin/cms/media/external')[0].body.url, 'https://cdn.example.com/a.jpg');
      assert.equal(h.button('Archive dock.jpg'), undefined, 'there is no archive option any more');
      await h.click(h.button('Delete dock.jpg'));
      assert.match(h.dialog().textContent, /Do you want to delete this?/);
      assert.match(h.dialog().textContent, /permanently deleted/);
      assert.equal(h.called(`DELETE /admin/cms/media/${'d'.repeat(24)}`).length, 0, 'nothing is deleted before confirming');
      await h.click(h.button('Delete', h.dialog()));
      assert.equal(h.called(`DELETE /admin/cms/media/${'d'.repeat(24)}`).length, 1);
      await view.unmount();
    });
  });

  describe('SEO', () => {
    test('lists entries with issues and saves an entry through the SEO endpoint', async () => {
      const view = await visit('/admin/cms/seo', { routes: { 'PATCH /admin/cms/seo/homepage': () => ({ data: { kind: 'homepage', seo: seo() } }) } });
      assert.match(h.text(), /No SEO title/);
      await h.click(h.button('Edit SEO for Homepage'));
      await h.fill({ 'SEO title': 'Freight brokerage' }, h.dialog());
      await h.submit(h.dialog().querySelector('form'));
      assert.equal(h.called('PATCH /admin/cms/seo/homepage')[0].body.SEO.title, 'Freight brokerage');
      await view.unmount();
    });
  });

  describe('static guarantees about the CMS source', () => {
    const walk = (dir) => readdirSync(`${ROOT}${dir}`, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
    const source = (files) => files.map((file) => [file, readFileSync(`${ROOT}${file}`, 'utf8')]);
    const cmsFiles = [...walk('src/components/admin/cms'), ...walk('src/pages/admin/cms'), 'src/pages/admin/SettingsPage.jsx'];

    test('no HTML injection, raw network calls, browser token storage or tiny text anywhere in src', () => {
      for (const [file, code] of source(walk('src').filter((f) => /\.(jsx?|css)$/.test(f)))) {
        assert.doesNotMatch(code, /dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML/, `${file} never injects HTML`);
      }
      for (const [file, code] of source(cmsFiles)) {
        assert.doesNotMatch(code, /\bfetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie/, `${file} uses only the service layer`);
        assert.doesNotMatch(code, /text-(xs|sm|\[(1[0-5]|[0-9])px\])|text-\[0?\.[0-8]\d*r?em\]/, `${file} has no text smaller than 16px`);
      }
    });

    test('the CMS service layer uses literal /admin/cms paths and sends no credentials of its own', () => {
      const service = readFileSync(`${ROOT}src/services/adminService.js`, 'utf8');
      const urls = [...service.matchAll(/['`](\/(?:admin|operations)\/[^'`]*)['`]/g)].map((match) => match[1]);
      assert.ok(urls.filter((url) => url.startsWith('/admin/cms')).length >= 50);
      assert.doesNotMatch(service, /Authorization|Bearer|token/i);
    });
  });
});
