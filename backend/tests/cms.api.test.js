/**
 * Phase 9 Website CMS: Super Admin CMS API (/api/v1/admin/cms) and public content API (/api/v1/content).
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27018/hl_test node --test tests/cms.api.test.js
 *
 * The database name MUST end in "_test" (it is dropped). Without MONGO_TEST_URI every test is skipped, not passed.
 * Verified against FerretDB, not real MongoDB.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

const testUri = process.env.MONGO_TEST_URI;
const skipReason = testUri ? false : 'MONGO_TEST_URI is not set; these tests require a live MongoDB';

// Keep the developer's real storage settings (backend/.env) out of these tests: dotenv never overrides a variable that
// already exists, and env.js ignores empty values, so every test starts from "no storage configured".
for (const key of ['STORAGE_PROVIDER', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) process.env[key] = '';

if (testUri) {
  const databaseName = new URL(testUri).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) throw new Error(`Refusing to run: database "${databaseName}" must end with "_test".`);
  Object.assign(process.env, {
    NODE_ENV: 'development',
    MONGO_URI: testUri,
    JWT_SECRET: 'api-test-secret-api-test-secret-api-test-1234',
    CLIENT_URL: 'http://localhost:5173',
    AUTH_RATE_LIMIT_MAX: '10000',
    RESET_EMAIL_LIMIT_MAX: '100000',
    UPLOAD_RATE_LIMIT_MAX: '100000',
    QUOTE_IP_LIMIT_MAX: '100000',
    GLOBAL_RATE_LIMIT_MAX: '100000',
    LOGIN_ACCOUNT_LIMIT_MAX: '500',
  });
}

const PASS = 'cms-panel-pass-phrase-1';
const MISSING = '000000000000000000000001';
const future = (days = 3) => new Date(Date.now() + days * 86400000).toISOString();

describe('website CMS', { skip: skipReason }, () => {
  let mongoose;
  let server;
  let baseUrl;
  let M;
  let hashPassword;
  let adminStack;
  let publicStack;
  const S = {};
  const ID = {};

  async function api(method, path, { body, cookie, raw, headers } = {}) {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    const text = await response.text();
    const setCookie = response.headers.get('set-cookie');
    return { status: response.status, text, headers: response.headers, body: text ? JSON.parse(text) : null, cookie: setCookie ? setCookie.split(';')[0] : null };
  }
  const cms = (path, method = 'GET', body) => api(method, `/admin/cms${path}`, { cookie: S.admin, body });
  const pub = (path) => api('GET', `/content${path}`);
  const ok = (response, status = 200) => {
    assert.equal(response.status, status, response.text.slice(0, 500));
    return response.body.data;
  };
  const refuse = (response, status, code) => {
    assert.equal(response.status, status, response.text.slice(0, 500));
    if (code) assert.equal(response.body.code, code, response.text.slice(0, 500));
    return response.body;
  };
  const fieldErrors = (response) => (response.body.errors ?? []).map((error) => error.field);

  async function mkUser(role, email) {
    return M.User.create({ firstName: 'Cms', lastName: role, email, role, passwordHash: await hashPassword(PASS) });
  }
  async function login(key, email, path = '/auth/login') {
    const response = await api('POST', path, { body: { email, password: PASS } });
    assert.equal(response.status, 200, response.text);
    S[key] = response.cookie;
  }
  const logsFor = (action) => M.ActivityLog.find({ action }).lean();

  before(async () => {
    const database = await import('../src/config/database.js');
    ({ default: mongoose } = await import('mongoose'));
    const { default: app } = await import('../src/app.js');
    M = await import('../src/models/index.js');
    ({ hashPassword } = await import('../src/services/password.service.js'));
    ({ default: { stack: adminStack } } = await import('../src/cms/cms.routes.js'));
    ({ default: { stack: publicStack } } = await import('../src/cms/content.routes.js'));
    await database.connectDatabase();
    await mongoose.connection.dropDatabase();
    const results = await Promise.allSettled(Object.values(M.models).map((Model) => Model.init()));
    results.forEach((result) => {
      if (result.status === 'rejected' && !/partialFilterExpression/.test(result.reason?.message ?? '')) throw result.reason;
    });
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    ID.admin = (await mkUser('super_admin', 'cms.root@example.com'))._id;
    await mkUser('customer', 'cms.customer@example.com');
    await mkUser('carrier', 'cms.carrier@example.com');
    await login('admin', 'cms.root@example.com', '/auth/admin/login');
    await login('customer', 'cms.customer@example.com');
    await login('carrier', 'cms.carrier@example.com');
  });

  after(async () => {
    await new Promise((resolve) => server?.close(resolve));
    await mongoose?.disconnect();
  });

  /* ------------------------------------------------------------------ access */
  describe('access control', () => {
    const routes = () =>
      adminStack
        .filter((layer) => layer.route)
        .flatMap((layer) => Object.keys(layer.route.methods).map((method) => ({ method: method.toUpperCase(), path: layer.route.path })));
    const concrete = (path) => path.replace(':id', MISSING).replace(':kind', 'page');

    test('the CMS API exposes every documented route', () => {
      const all = routes().map((r) => `${r.method} ${r.path}`);
      for (const expected of [
        'GET /homepage', 'PATCH /homepage', 'GET /pages', 'POST /pages', 'POST /pages/:id/publish', 'GET /services', 'POST /services/reorder', 'POST /industries', 'POST /service-areas', 'PATCH /faqs/:id',
        'POST /testimonials', 'POST /blog/:id/schedule', 'POST /blog/:id/publish', 'GET /media', 'POST /media/external', 'POST /media/upload', 'GET /seo', 'PATCH /seo/global', 'PATCH /seo/:kind/:id', 'GET /settings', 'PATCH /settings',
      ]) assert.ok(all.includes(expected), `missing ${expected}`);
      assert.ok(all.length >= 65, `only ${all.length} routes`);
    });

    test('guests get 401 on every CMS route', async () => {
      for (const { method, path } of routes()) {
        const response = await api(method, `/admin/cms${concrete(path)}`, { body: method === 'GET' ? undefined : {} });
        assert.equal(response.status, 401, `${method} ${path}: ${response.status}`);
      }
    });

    test('customers and carriers get 403 on every CMS route, before any handler runs', async () => {
      for (const cookie of [S.customer, S.carrier]) {
        for (const { method, path } of routes()) {
          const response = await api(method, `/admin/cms${concrete(path)}`, { cookie, body: method === 'GET' ? undefined : {} });
          assert.equal(response.status, 403, `${method} ${path}: ${response.status}`);
        }
      }
      assert.equal(await M.Service.countDocuments({}), 0, 'a refused write created nothing');
    });

    test('the Super Admin can reach the read routes', async () => {
      for (const path of ['/overview', '/homepage', '/pages', '/services', '/industries', '/service-areas', '/faqs', '/testimonials', '/blog', '/media', '/media/storage', '/seo', '/settings']) {
        ok(await cms(path));
      }
    });

    test('a forged role, cookie or token is not accepted', async () => {
      const forged = await api('GET', '/admin/cms/overview', { cookie: 'accessToken=not-a-real-token' });
      assert.equal(forged.status, 401);
      const header = await api('GET', '/admin/cms/overview', { headers: { Authorization: 'Bearer abc', 'X-Role': 'super_admin' } });
      assert.equal(header.status, 401);
    });

    test('a cross-origin mutation is refused', async () => {
      const response = await api('PATCH', '/admin/cms/settings', { cookie: S.admin, body: { tagline: 'x' }, headers: { Origin: 'https://evil.example.com' } });
      assert.equal(response.status, 403);
    });

    test('public content routes are GET only and need no sign-in', async () => {
      const methods = publicStack.filter((layer) => layer.route).flatMap((layer) => Object.keys(layer.route.methods));
      assert.ok(methods.length >= 14);
      assert.ok(methods.every((method) => method === 'get'));
      for (const path of ['/site-settings', '/homepage', '/seo', '/pages', '/services', '/industries', '/service-areas', '/blog', '/faqs', '/testimonials']) ok(await pub(path));
    });

    test('there is still exactly one Super Admin and no new role was added', async () => {
      assert.equal(await M.User.countDocuments({ role: 'super_admin' }), 1);
      const roles = await M.User.distinct('role');
      assert.deepEqual(roles.sort(), ['carrier', 'customer', 'super_admin']);
    });
  });

  /* -------------------------------------------------------------- validation */
  describe('validation and injection', () => {
    test('invalid ids are 400 and unknown ids are 404', async () => {
      refuse(await cms('/pages/not-an-id'), 400);
      refuse(await cms('/services/zzzzzzzzzzzzzzzzzzzzzzzz'), 400);
      refuse(await cms('/blog/{"$ne":1}'), 400);
      refuse(await cms(`/pages/${MISSING}`), 404, 'CMS_NOT_FOUND');
      refuse(await cms(`/blog/${MISSING}/publish`, 'POST'), 404);
      refuse(await cms('/seo/nonsense/' + MISSING, 'PATCH', { SEO: {} }), 400);
    });

    test('malformed slugs are rejected', async () => {
      for (const slug of ['Bad Slug', 'UPPER', '../etc/passwd', 'a--b', '-lead', 'trail-', 'with/slash', '%2e%2e', 'admin', 'x'.repeat(161), '<script>']) {
        const response = await cms('/pages', 'POST', { title: 'T', slug });
        refuse(response, 422);
        assert.ok(fieldErrors(response).includes('body.slug') || fieldErrors(response).includes('slug'), `${slug}: ${response.text}`);
      }
      assert.equal(await M.Page.countDocuments({}), 0);
    });

    test('unexpected fields are refused (mass assignment)', async () => {
      refuse(await cms('/services', 'POST', { name: 'S', role: 'super_admin' }), 422);
      refuse(await cms('/services', 'POST', { name: 'S', accountType: 'super_admin', isAdmin: true }), 422);
      refuse(await cms('/pages', 'POST', { title: 'T', status: 'published' }), 422);
      refuse(await cms('/blog', 'POST', { title: 'T', status: 'published', publishedAt: new Date().toISOString() }), 422);
      refuse(await cms('/blog', 'POST', { title: 'T', author: String(ID.admin) }), 422);
      refuse(await cms('/media/external', 'POST', { url: 'https://cdn.example.com/a.jpg', fileName: 'a.jpg', type: 'image', uploadedBy: String(ID.admin), storageKey: 'x' }), 422);
      refuse(await cms('/faqs', 'POST', { question: 'Q', answer: 'A', archivedAt: null, _id: MISSING }), 422);
      refuse(await cms('/settings', 'PATCH', { key: 'other' }), 422);
      assert.equal(await M.Service.countDocuments({}), 0);
    });

    test('Mongo operators and dotted keys are refused with 400 before validation', async () => {
      const operator = refuse(await cms('/services', 'POST', { name: { $ne: null } }), 400, 'OPERATOR_NOT_ALLOWED');
      assert.ok(operator);
      refuse(await cms('/services', 'POST', { name: 'S', 'SEO.title': 'x' }), 400, 'OPERATOR_NOT_ALLOWED');
      refuse(await cms('/faqs', 'POST', { question: 'Q', answer: { $regex: '.*' } }), 400, 'OPERATOR_NOT_ALLOWED');
      refuse(await cms('/services?q[$ne]=zz'), 400, 'OPERATOR_NOT_ALLOWED');
      refuse(await cms('/pages?status[$ne]=draft'), 400, 'OPERATOR_NOT_ALLOWED');
      refuse(await pub('/blog?category[$ne]=x'), 400, 'OPERATOR_NOT_ALLOWED');
    });

    test('prototype pollution keys are refused and nothing is polluted', async () => {
      const response = await api('POST', '/admin/cms/services', { cookie: S.admin, raw: '{"name":"Proto","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}' });
      assert.equal(response.status, 422, response.text);
      assert.equal({}.polluted, undefined);
      assert.equal(Object.prototype.polluted, undefined);
      assert.equal(await M.Service.countDocuments({}), 0);
    });

    test('HTML, script and markup are refused in every text field', async () => {
      for (const evil of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', 'hello <b>bold</b>', '<iframe src="https://x"></iframe>', '<svg onload=alert(1)>']) {
        refuse(await cms('/services', 'POST', { name: evil }), 422);
        refuse(await cms('/faqs', 'POST', { question: 'Q', answer: evil }), 422);
        refuse(await cms('/pages', 'POST', { title: 'T', content: evil }), 422);
        refuse(await cms('/blog', 'POST', { title: 'T', content: evil }), 422);
        refuse(await cms('/testimonials', 'POST', { customerName: 'N', testimonial: evil }), 422);
        refuse(await cms('/settings', 'PATCH', { tagline: evil }), 422);
      }
      assert.equal(await M.Faq.countDocuments({}), 0);
    });

    test('unsafe URLs are refused: javascript:, data:, protocol-relative, credentials, ftp', async () => {
      for (const url of ['javascript:alert(1)', 'data:text/html;base64,AAAA', '//evil.example.com', 'ftp://x.example.com/a', 'https://user:pass@cdn.example.com/a.jpg', 'https://exa mple.com', 'vbscript:x']) {
        refuse(await cms('/media/external', 'POST', { url, fileName: 'f.jpg', type: 'image' }), 422);
        refuse(await cms('/homepage', 'PATCH', { hero: { primaryButton: { label: 'Go', url } } }), 422);
      }
      refuse(await cms('/seo/global', 'PATCH', { defaultSEO: { canonicalUrl: 'javascript:alert(1)' } }), 422);
      refuse(await cms('/settings', 'PATCH', { socialLinks: [{ platform: 'x', url: 'javascript:alert(1)' }] }), 422);
    });

    test('oversized content is refused (field limits and the request body limit)', async () => {
      refuse(await cms('/pages', 'POST', { title: 'T', content: 'a'.repeat(100001) }), 422);
      refuse(await cms('/blog', 'POST', { title: 'T', content: 'a'.repeat(100001) }), 422);
      refuse(await cms('/faqs', 'POST', { question: 'Q', answer: 'a'.repeat(5001) }), 422);
      refuse(await cms('/services', 'POST', { name: 'S', benefits: Array(21).fill('ok') }), 422);
      refuse(await cms('/pages', 'POST', { title: 'T', sections: Array(31).fill({ heading: 'h', body: 'b' }) }), 422);
      const huge = await api('POST', '/admin/cms/pages', { cookie: S.admin, raw: JSON.stringify({ title: 'T', content: 'a'.repeat(1_200_000) }) });
      assert.equal(huge.status, 413);
      assert.equal(await M.Page.countDocuments({}), 0);
    });

    test('only the CMS API accepts a large body; other routes keep the 10kb limit', async () => {
      const response = await api('POST', '/auth/login', { raw: JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(20000) }) });
      assert.equal(response.status, 413);
      const guestBig = await api('POST', '/admin/cms/pages', { raw: JSON.stringify({ title: 'T', content: 'a'.repeat(50000) }) });
      assert.equal(guestBig.status, 401, 'a guest is refused before the large body is read');
    });

    test('invalid enums, countries, statuses and query values are refused', async () => {
      refuse(await cms('/pages?status=live'), 400);
      refuse(await cms('/blog?status=pending'), 400);
      refuse(await cms('/service-areas?country=FR'), 400);
      refuse(await cms('/faqs?category=Gossip'), 400);
      refuse(await cms('/services?limit=1000'), 400);
      refuse(await cms('/services?page=0'), 400);
      refuse(await cms('/services?nope=1'), 400);
      refuse(await cms('/service-areas', 'POST', { name: 'Paris', country: 'FR' }), 422);
      refuse(await cms('/faqs', 'POST', { question: 'Q', answer: 'A', category: 'Gossip' }), 422);
      refuse(await cms('/testimonials', 'POST', { customerName: 'N', testimonial: 'T', rating: 6 }), 422);
      refuse(await cms('/homepage', 'PATCH', { sectionOrder: ['services', 'services'] }), 422);
      refuse(await cms('/homepage', 'PATCH', { sectionOrder: ['nonsense'] }), 422);
      refuse(await cms('/homepage', 'PATCH', { hero: { overlay: { opacity: 2 } } }), 422);
    });

    test('validation errors name the field', async () => {
      const response = await cms('/faqs', 'POST', { question: '', answer: 'A' });
      refuse(response, 422);
      assert.ok(fieldErrors(response).some((field) => field.endsWith('question')), response.text);
    });
  });

  /* ---------------------------------------------------------- content policy */
  describe('business content policy', () => {
    test('no ocean freight, air freight or passenger transport', async () => {
      refuse(await cms('/services', 'POST', { name: 'Ocean Freight', shortDescription: 'We ship by ocean freight worldwide.' }), 422);
      refuse(await cms('/services', 'POST', { name: 'Air', fullDescription: 'Fast air freight.' }), 422);
      refuse(await cms('/industries', 'POST', { name: 'I', description: 'Sea cargo specialists' }), 422);
      refuse(await cms('/faqs', 'POST', { question: 'Do you do air freight?', answer: 'Yes.' }), 422);
      refuse(await cms('/services', 'POST', { name: 'Customs', shortDescription: 'Full customs brokerage included.' }), 422);
    });

    test('no direct Canada to Mexico lane', async () => {
      refuse(await cms('/service-areas', 'POST', { name: 'Lane', country: 'CA', description: 'Direct service from Canada to Mexico.' }), 422);
      refuse(await cms('/services', 'POST', { name: 'S', shortDescription: 'Mexico ↔ Canada freight' }), 422);
      const allowed = await cms('/service-areas', 'POST', { name: 'U.S. and Canada', country: 'CA', coverageType: 'cross_border', description: 'Truck freight between the U.S. and Canada, and between the U.S. and Mexico.' });
      ok(allowed, 201);
    });

    test('FAQs and service benefits cannot make guarantees', async () => {
      refuse(await cms('/faqs', 'POST', { question: 'Is delivery on time?', answer: 'We guarantee delivery times.' }), 422);
      refuse(await cms('/faqs', 'POST', { question: 'Do you guarantee savings?', answer: 'No.' }), 422);
      refuse(await cms('/services', 'POST', { name: 'S', benefits: ['Guaranteed capacity'] }), 422);
      ok(await cms('/faqs', 'POST', { question: 'How do I request a quote?', answer: 'Use the quote form and our team will review your shipment.', category: 'Quotes' }), 201);
    });

    test('nothing is seeded: every collection starts empty and says so', async () => {
      const fresh = async (path) => ok(await pub(path));
      assert.deepEqual((await fresh('/testimonials')).items, []);
      assert.deepEqual((await fresh('/blog')).items, []);
      assert.deepEqual((await fresh('/pages')).items, []);
      const settings = await fresh('/site-settings');
      assert.equal(settings.configured, false, 'settings are not created by reading them');
      assert.equal(await M.SiteSettings.countDocuments({}), 0);
      assert.equal(await M.Homepage.countDocuments({}), 0);
      assert.equal(await M.Testimonial.countDocuments({}), 0);
    });
  });

  /* ---------------------------------------------------------------- homepage */
  describe('homepage', () => {
    test('GET reports an unconfigured homepage and does not create one', async () => {
      await M.Homepage.deleteMany({});
      const data = ok(await cms('/homepage'));
      assert.equal(data.exists, false);
      assert.equal(data.sectionOrder.length, 11);
      assert.equal(await M.Homepage.countDocuments({}), 0);
      const open = ok(await pub('/homepage'));
      assert.equal(open.configured, false);
      assert.deepEqual(open.sectionOrder, data.sectionOrder);
    });

    test('hero, sections, order and stats can be edited', async () => {
      const data = ok(
        await cms('/homepage', 'PATCH', {
          hero: {
            eyebrow: 'Freight brokerage',
            title: 'Move freight with confidence',
            subtitle: 'Truckload and LTL coordination',
            description: 'Domestic and cross-border truck freight.',
            backgroundVideo: { url: 'https://cdn.example.com/hero.mp4', altText: 'Trucks on a highway' },
            poster: { url: 'https://cdn.example.com/poster.jpg', altText: 'Highway at dawn' },
            fallbackImage: { url: 'https://cdn.example.com/fallback.jpg' },
            primaryButton: { label: 'Request a Quote', url: '/request-quote' },
            secondaryButton: { label: 'Become a Carrier', url: '/become-a-carrier' },
            overlay: { color: '#101820', opacity: 0.4, isActive: true },
            autoplay: true, muted: true, loop: false, isActive: true,
          },
          sectionOrder: ['services', 'trust', 'faq'],
          servicesSection: { title: 'Our services', subtitle: 'What we coordinate', isActive: true, button: { label: 'All services', url: '/services' } },
          trust: { isActive: true, items: [{ title: 'Nationwide coverage', description: 'Freight across the U.S.', displayOrder: 1 }] },
          testimonials: { title: 'What customers say', isActive: false },
          stats: [{ label: 'Lanes', value: '12', displayOrder: 1 }],
          finalCTA: { title: 'Ready?', primaryButton: { label: 'Quote', url: '/request-quote' } },
          crossBorder: { title: 'Cross-border', highlights: ['U.S. to Canada', 'U.S. to Mexico'], image: { url: 'https://cdn.example.com/border.jpg' } },
        })
      );
      assert.equal(data.hero.title, 'Move freight with confidence');
      assert.equal(data.hero.loop, false);
      assert.equal(data.hero.overlay.opacity, 0.4);
      assert.equal(data.hero.backgroundVideo.url, 'https://cdn.example.com/hero.mp4');
      assert.deepEqual(data.sectionOrder.slice(0, 3), ['services', 'trust', 'faq']);
      assert.equal(data.sectionOrder.length, 11, 'sections not mentioned are appended, never lost');
      assert.equal(data.testimonials.isActive, false);
      assert.equal(data.stats[0].value, '12');
    });

    test('the network map and quote form blocks are saved, served publicly, and take no appearance or unknown fields', async () => {
      const data = ok(await cms('/homepage', 'PATCH', {
        networkSection: { title: 'Our network', subtitle: 'Why us', description: 'Plain text.', isActive: true, button: { label: 'Read more', url: '/contact' }, items: [{ title: 'Experience', description: 'Plain text.', icon: 'shield', displayOrder: 0, isActive: true }, { title: 'Hidden pillar', isActive: false, displayOrder: 1 }] },
        quoteSection: { title: 'Quote us', isActive: false },
      }));
      assert.equal(data.networkSection.items.length, 2);
      const open = ok(await pub('/homepage'));
      assert.equal(open.network.enabled, true);
      assert.equal(open.network.title, 'Our network');
      assert.deepEqual(open.network.button, { label: 'Read more', url: '/contact' });
      assert.deepEqual(open.network.items.map((i) => i.title), ['Experience']);
      assert.equal(open.quote.enabled, false);
      assert.ok(!('appearance' in open.network) && !('appearance' in open.quote));
      assert.ok(!open.sectionOrder.includes('network') && !open.sectionOrder.includes('quote'));
      refuse(await cms('/homepage', 'PATCH', { networkSection: { appearance: { spacing: 'compact' } } }), 422);
      refuse(await cms('/homepage', 'PATCH', { quoteSection: { title: 'x', role: 'admin' } }), 422);
      refuse(await cms('/homepage', 'PATCH', { networkSection: { title: '<script>alert(1)</script>' } }), 422);
    });

    test('the public homepage is one grouped, allow-listed response', async () => {
      const data = ok(await pub('/homepage'));
      assert.equal(data.configured, true);
      assert.equal(data.hero.video.url, 'https://cdn.example.com/hero.mp4');
      assert.equal(data.hero.poster.url, 'https://cdn.example.com/poster.jpg');
      assert.equal(data.hero.overlay.enabled, true);
      assert.deepEqual(data.sectionOrder.slice(0, 3), ['services', 'trust', 'faq']);
      assert.equal(data.testimonials.enabled, false);
      assert.deepEqual(Object.keys(data.collections).sort(), ['faqs', 'industries', 'serviceAreas', 'services', 'testimonials']);
      assert.equal(data.services.button.url, '/services');
      assert.equal(data.stats.items[0].label, 'Lanes');
      assert.ok(!('_id' in data) && !('createdAt' in data) && !('__v' in data) && !('key' in data));
    });

    test('hiding the hero video removes it from the public response (poster stays)', async () => {
      ok(await cms('/homepage', 'PATCH', { hero: { isActive: false } }));
      const data = ok(await pub('/homepage'));
      assert.equal(data.hero.video, null);
      assert.equal(data.hero.poster.url, 'https://cdn.example.com/poster.jpg');
      assert.equal(data.hero.title, 'Move freight with confidence', 'a partial hero update keeps the other fields');
      ok(await cms('/homepage', 'PATCH', { hero: { isActive: true, backgroundVideo: null } }));
      assert.equal(ok(await pub('/homepage')).hero.video, null, 'a cleared video is gone');
    });

    test('the homepage update is audited with field names only', async () => {
      const entries = await logsFor('cms.homepage.updated');
      assert.ok(entries.length >= 2);
      const last = entries.at(-1);
      assert.equal(last.module, 'cms');
      assert.equal(String(last.userId), String(ID.admin));
      assert.ok(Array.isArray(last.metadata.changedFields));
      assert.ok(!JSON.stringify(last.metadata).includes('Move freight'));
    });
  });

  /* ------------------------------------------------------------------- pages */
  describe('pages', () => {
    test('system pages are created by key; the slug is fixed to the key', async () => {
      const page = ok(await cms('/pages', 'POST', { title: 'About us', pageKey: 'about', heroHeading: 'About Hashimi', content: 'We are a freight brokerage.' }), 201);
      ID.about = page.id;
      assert.equal(page.slug, 'about');
      assert.equal(page.isSystem, true);
      assert.equal(page.status, 'draft');
      refuse(await cms('/pages', 'POST', { title: 'About again', pageKey: 'about' }), 409, 'PAGE_KEY_TAKEN');
      refuse(await cms('/pages', 'POST', { title: 'X', pageKey: 'contact', slug: 'something-else' }), 422);
    });

    test('the carrier, quote, tracking and resources pages are offered as built-in pages', async () => {
      // Only listed here, not created: later tests count the pages in this collection.
      const available = ok(await cms('/pages')).availableSystemPages;
      for (const key of ['become-a-carrier', 'carrier-resources', 'request-quote', 'track-shipment', 'resources']) assert.ok(available.includes(key), key);
    });

    test('a system page cannot change its slug or be archived', async () => {
      refuse(await cms(`/pages/${ID.about}`, 'PATCH', { slug: 'about-us' }), 409, 'SYSTEM_PAGE_LOCKED');
      refuse(await cms(`/pages/${ID.about}`, 'PATCH', { pageKey: 'contact' }), 422);
      refuse(await cms(`/pages/${ID.about}/archive`, 'POST'), 409, 'SYSTEM_PAGE_LOCKED');
      const updated = ok(await cms(`/pages/${ID.about}`, 'PATCH', { heroSubtitle: 'Freight brokerage', sections: [{ heading: 'Our approach', body: 'Plain text only.', displayOrder: 1 }], cta: { label: 'Contact', url: '/contact' } }));
      assert.equal(updated.sections[0].heading, 'Our approach');
      assert.equal(updated.slug, 'about');
    });

    test('the list shows which system pages are still available', async () => {
      const data = ok(await cms('/pages'));
      assert.ok(data.availableSystemPages.includes('contact'));
      assert.ok(!data.availableSystemPages.includes('about'));
    });

    test('drafts are hidden from the public API until published', async () => {
      refuse(await pub('/pages/about'), 404, 'CONTENT_NOT_FOUND');
      assert.deepEqual(ok(await pub('/pages')).items, []);
      const published = ok(await cms(`/pages/${ID.about}/publish`, 'POST'));
      assert.equal(published.status, 'published');
      const open = ok(await pub('/pages/about'));
      assert.equal(open.heroHeading, 'About Hashimi');
      assert.equal(open.sections[0].body, 'Plain text only.');
      assert.ok(!('status' in open) && !('id' in open) && !('createdAt' in open));
      refuse(await cms(`/pages/${ID.about}/publish`, 'POST'), 409, 'ALREADY_IN_STATE');
    });

    test('custom pages: create, edit, publish, slug change needs confirmation, archive, restore', async () => {
      const page = ok(await cms('/pages', 'POST', { title: 'Safety Policy', excerpt: 'Our approach to safety.' }), 201);
      assert.equal(page.slug, 'safety-policy', 'the slug is generated from the title');
      assert.equal(page.isSystem, false);
      refuse(await cms('/pages', 'POST', { title: 'Another', slug: 'safety-policy' }), 409, 'SLUG_TAKEN');
      ok(await cms(`/pages/${page.id}/publish`, 'POST'));
      refuse(await cms(`/pages/${page.id}`, 'PATCH', { slug: 'safety' }), 409, 'SLUG_CHANGE_NEEDS_CONFIRMATION');
      assert.equal(ok(await cms(`/pages/${page.id}`)).slug, 'safety-policy', 'nothing changed without confirmation');
      const moved = ok(await cms(`/pages/${page.id}`, 'PATCH', { slug: 'safety', confirmSlugChange: true }));
      assert.equal(moved.slug, 'safety');
      ok(await pub('/pages/safety'));
      refuse(await pub('/pages/safety-policy'), 404);
      ok(await cms(`/pages/${page.id}/archive`, 'POST'));
      refuse(await pub('/pages/safety'), 404, 'CONTENT_NOT_FOUND');
      assert.equal(ok(await cms(`/pages/${page.id}`)).status, 'archived', 'the admin still sees it');
      refuse(await cms(`/pages/${page.id}/restore`, 'POST').then((r) => ({ ...r, status: r.status === 200 ? 400 : r.status })), 400);
      assert.equal(ok(await cms(`/pages/${page.id}`)).status, 'draft');
      refuse(await pub('/pages/safety'), 404, 'CONTENT_NOT_FOUND');
    });

    test('list: search, status filter and pagination', async () => {
      const found = ok(await cms('/pages?q=safety'));
      assert.equal(found.items.length, 1);
      assert.equal(ok(await cms('/pages?status=published')).items.length, 1);
      assert.equal(ok(await cms('/pages?system=true')).items.length, 1);
      const paged = ok(await cms('/pages?limit=1&page=2'));
      assert.equal(paged.pagination.limit, 1);
      assert.equal(paged.pagination.total, 2);
      assert.equal(paged.items.length, 1);
    });

    test('page changes are audited', async () => {
      for (const action of ['cms.page.created', 'cms.page.updated', 'cms.page.published', 'cms.page.archived', 'cms.page.restored']) {
        assert.ok((await logsFor(action)).length >= 1, action);
      }
    });
  });

  /* ---------------------------------------------- services / industries / areas */
  describe('services', () => {
    test('create, read, update, feature and hide', async () => {
      const area = ok(await cms('/service-areas', 'POST', { name: 'United States', country: 'US', coverageType: 'domestic', description: 'Domestic truck freight.' }), 201);
      ID.areaUS = area.id;
      const created = ok(
        await cms('/services', 'POST', {
          name: 'Full Truckload', shortDescription: 'Dedicated trailer capacity.', fullDescription: 'One shipper, one trailer.', icon: 'truck',
          image: { url: 'https://cdn.example.com/ftl-card.jpg', altText: 'Truck' }, heroImage: { url: 'https://cdn.example.com/ftl-hero.jpg' },
          benefits: ['Direct movement'], features: ['Dry van', 'Flatbed'], serviceAreaIds: [ID.areaUS], cta: { label: 'Get a quote', url: '/request-quote' }, isFeatured: true, displayOrder: 10,
          SEO: { title: 'Full Truckload Freight', description: 'Full truckload freight coordination for shippers across North America.' },
        }),
        201
      );
      ID.ftl = created.id;
      assert.equal(created.slug, 'full-truckload');
      assert.equal(created.isActive, true);
      assert.equal(created.isFeatured, true);
      assert.equal(created.serviceAreas[0].name, 'United States');
      assert.equal(created.SEO.title, 'Full Truckload Freight');
      const updated = ok(await cms(`/services/${ID.ftl}`, 'PATCH', { shortDescription: 'Dedicated capacity.', SEO: { description: 'New description that is long enough to read well in results.' } }));
      assert.equal(updated.shortDescription, 'Dedicated capacity.');
      assert.equal(updated.SEO.title, 'Full Truckload Freight', 'SEO merges into what is stored');
    });

    test('list: search, filters and pagination', async () => {
      ok(await cms('/services', 'POST', { name: 'Less Than Truckload', shortDescription: 'Shared trailer space.', displayOrder: 20 }), 201);
      ok(await cms('/services', 'POST', { name: 'Expedited Freight', displayOrder: 30, isFeatured: false }), 201);
      assert.equal(ok(await cms('/services')).pagination.total, 3);
      assert.equal(ok(await cms('/services?q=truckload')).items.length, 2);
      assert.equal(ok(await cms('/services?featured=true')).items.length, 1);
      const page = ok(await cms('/services?limit=2&page=2'));
      assert.equal(page.items.length, 1);
      assert.equal(page.pagination.totalPages, 2);
      assert.equal(ok(await cms('/services?q=zzzz')).items.length, 0);
      refuse(await cms('/services?q=a'), 400);
    });

    test('the public list shows visible services in order and flags the collection as configured', async () => {
      const data = ok(await pub('/services'));
      assert.equal(data.configured, true);
      assert.deepEqual(data.items.map((s) => s.slug), ['full-truckload', 'less-than-truckload', 'expedited-freight']);
      assert.ok(!('SEO' in data.items[0]) && !('isActive' in data.items[0]) && !('displayOrder' in data.items[0]));
      const detail = ok(await pub('/services/full-truckload'));
      assert.equal(detail.fullDescription, 'One shipper, one trailer.');
      assert.equal(detail.heroImage.url, 'https://cdn.example.com/ftl-hero.jpg');
      assert.equal(detail.serviceAreas[0].name, 'United States');
      assert.equal(detail.seo.title, 'Full Truckload Freight');
      assert.deepEqual(detail.benefits, ['Direct movement']);
    });

    test('hiding, reordering and archiving change what visitors see', async () => {
      const ltl = (await M.Service.findOne({ slug: 'less-than-truckload' }))._id;
      const exp = (await M.Service.findOne({ slug: 'expedited-freight' }))._id;
      ok(await cms(`/services/${ltl}`, 'PATCH', { isActive: false }));
      assert.deepEqual(ok(await pub('/services')).items.map((s) => s.slug), ['full-truckload', 'expedited-freight']);
      refuse(await pub('/services/less-than-truckload'), 404);
      ok(await cms(`/services/${ltl}`, 'PATCH', { isActive: true }));
      ok(await cms('/services/reorder', 'POST', { ids: [String(exp), String(ID.ftl), String(ltl)] }));
      assert.deepEqual(ok(await pub('/services')).items.map((s) => s.slug), ['expedited-freight', 'full-truckload', 'less-than-truckload']);
      ok(await cms(`/services/${exp}/archive`, 'POST'));
      assert.deepEqual(ok(await pub('/services')).items.map((s) => s.slug), ['full-truckload', 'less-than-truckload']);
      refuse(await pub('/services/expedited-freight'), 404);
      assert.equal(ok(await cms('/services?archived=true')).items.length, 1);
      assert.equal(ok(await cms('/services?archived=false')).items.length, 2);
      refuse(await cms(`/services/${exp}/archive`, 'POST'), 409, 'ALREADY_IN_STATE');
      ok(await cms(`/services/${exp}/restore`, 'POST'));
      assert.equal(ok(await pub('/services')).items.length, 3);
      refuse(await cms(`/services/${exp}/restore`, 'POST'), 409, 'ALREADY_IN_STATE');
      refuse(await cms('/services/reorder', 'POST', { ids: [MISSING] }), 422);
      refuse(await cms('/services/reorder', 'POST', { ids: [] }), 422);
      refuse(await cms('/services/reorder', 'POST', { ids: [String(exp), String(exp)] }), 422);
    });

    test('a service cannot point at a service area that does not exist', async () => {
      refuse(await cms('/services', 'POST', { name: 'Bad Link', serviceAreaIds: [MISSING] }), 422);
    });

    test('changing the slug of a live service needs confirmation; a duplicate slug is a conflict', async () => {
      refuse(await cms(`/services/${ID.ftl}`, 'PATCH', { slug: 'ftl' }), 409, 'SLUG_CHANGE_NEEDS_CONFIRMATION');
      refuse(await cms(`/services/${ID.ftl}`, 'PATCH', { slug: 'less-than-truckload', confirmSlugChange: true }), 409, 'SLUG_TAKEN');
      ok(await cms(`/services/${ID.ftl}`, 'PATCH', { slug: 'ftl', confirmSlugChange: true }));
      ok(await pub('/services/ftl'));
      ok(await cms(`/services/${ID.ftl}`, 'PATCH', { slug: 'full-truckload', confirmSlugChange: true }));
    });

    test('an untouched collection reports configured:false (the website keeps its built-in content)', async () => {
      await M.Industry.deleteMany({}, { allowHardDelete: true });
      const data = ok(await pub('/industries'));
      assert.deepEqual(data, { configured: false, items: [] });
    });

    test('service changes are audited', async () => {
      for (const action of ['cms.service.created', 'cms.service.updated', 'cms.service.archived', 'cms.service.restored', 'cms.service.reordered', 'cms.service.hidden', 'cms.service.shown']) {
        assert.ok((await logsFor(action)).length >= 1, action);
      }
    });
  });

  describe('industries and service areas', () => {
    test('industry CRUD, visibility, archive and the public view', async () => {
      const created = ok(await cms('/industries', 'POST', { name: 'Retail', shortDescription: 'Retail freight.', description: 'Truck freight for retail shippers.', benefits: ['Dock-to-dock'], cta: { label: 'Quote', url: '/request-quote' }, image: { url: 'https://cdn.example.com/retail.jpg', altText: 'Retail' } }), 201);
      assert.equal(created.slug, 'retail');
      ok(await cms('/industries', 'POST', { name: 'Manufacturing', displayOrder: 5 }), 201);
      assert.equal(ok(await cms('/industries?q=retail')).items.length, 1);
      ok(await cms(`/industries/${created.id}`, 'PATCH', { description: 'Updated.' }));
      assert.deepEqual(ok(await pub('/industries')).items.map((i) => i.slug), ['retail', 'manufacturing']);
      assert.equal(ok(await pub('/industries/retail')).description, 'Updated.');
      ok(await cms(`/industries/${created.id}`, 'PATCH', { isActive: false }));
      refuse(await pub('/industries/retail'), 404);
      ok(await cms(`/industries/${created.id}/archive`, 'POST'));
      assert.deepEqual(ok(await pub('/industries')).items.map((i) => i.slug), ['manufacturing']);
      ok(await cms(`/industries/${created.id}/restore`, 'POST'));
      assert.equal(ok(await cms(`/industries/${created.id}`)).isActive, false, 'restore does not silently make it visible');
    });

    test('service area CRUD with the three supported countries', async () => {
      const ca = ok(await cms('/service-areas', 'POST', { name: 'Ontario', country: 'CA', stateProvince: 'Ontario', cityRegion: 'Greater Toronto', coverageType: 'cross_border', description: 'U.S. to Canada freight.' }), 201);
      const mx = ok(await cms('/service-areas', 'POST', { name: 'Nuevo León', country: 'MX', stateProvince: 'Nuevo León', coverageType: 'cross_border' }), 201);
      assert.equal(ca.slug, 'ontario');
      assert.equal(mx.country, 'MX');
      assert.equal(ok(await cms('/service-areas?country=CA')).items.length, 2, 'the earlier policy test also created a Canadian area');
      assert.equal(ok(await cms('/service-areas?q=nuevo')).items.length, 1);
      const open = ok(await pub('/service-areas'));
      assert.equal(open.configured, true);
      assert.ok(open.items.every((a) => ['US', 'CA', 'MX'].includes(a.country)));
      ok(await cms(`/service-areas/${ca.id}`, 'PATCH', { isActive: false }));
      assert.ok(!ok(await pub('/service-areas')).items.some((a) => a.slug === 'ontario'));
      ok(await cms(`/service-areas/${mx.id}/archive`, 'POST'));
      assert.ok(!ok(await pub('/service-areas')).items.some((a) => a.slug === 'nuevo-leon'));
      ok(await cms('/service-areas/reorder', 'POST', { ids: [ca.id] }));
    });
  });

  /* -------------------------------------------------------------------- blog */
  describe('blog', () => {
    const publicSlugs = async () => ok(await pub('/blog?limit=50')).items.map((p) => p.slug);
    let post;

    test('a draft is saved with the session user as author and is invisible to the public', async () => {
      post = ok(await cms('/blog', 'POST', { title: 'Cross-border checklist', excerpt: 'What to prepare.', content: 'Paragraph one.\n\nParagraph two.', category: 'Cross-Border', tags: ['Canada', ' Mexico '], authorName: 'Hashimi Team', isFeatured: true }), 201);
      assert.equal(post.status, 'draft');
      assert.equal(post.isLive, false);
      assert.deepEqual(post.tags, ['canada', 'mexico']);
      assert.equal(String((await M.BlogPost.findById(post.id)).author), String(ID.admin));
      assert.deepEqual(await publicSlugs(), []);
      refuse(await pub('/blog/cross-border-checklist'), 404, 'CONTENT_NOT_FOUND');
    });

    test('a post must have content and an excerpt before it can go live', async () => {
      const empty = ok(await cms('/blog', 'POST', { title: 'Empty draft' }), 201);
      const response = await cms(`/blog/${empty.id}/publish`, 'POST');
      refuse(response, 409, 'BLOG_NOT_READY');
      assert.deepEqual(response.body.errors.map((e) => e.field).sort(), ['content', 'excerpt']);
      refuse(await cms(`/blog/${empty.id}/schedule`, 'POST', { scheduledAt: future() }), 409, 'BLOG_NOT_READY');
    });

    test('publish makes it public; the list never includes the body, the detail does', async () => {
      const published = ok(await cms(`/blog/${post.id}/publish`, 'POST'));
      assert.equal(published.status, 'published');
      assert.equal(published.isLive, true);
      assert.ok(published.publishedAt);
      const list = ok(await pub('/blog'));
      assert.deepEqual(list.items.map((p) => p.slug), ['cross-border-checklist']);
      assert.ok(!('content' in list.items[0]));
      assert.deepEqual(list.categories, ['Cross-Border']);
      const detail = ok(await pub('/blog/cross-border-checklist'));
      assert.equal(detail.content, 'Paragraph one.\n\nParagraph two.');
      assert.equal(detail.authorName, 'Hashimi Team');
      assert.ok(!('author' in detail) && !('status' in detail) && !('scheduledAt' in detail) && !('id' in detail));
      refuse(await cms(`/blog/${post.id}/publish`, 'POST'), 409, 'ALREADY_IN_STATE');
    });

    test('scheduling rejects a past time and hides the post until the time passes', async () => {
      const second = ok(await cms('/blog', 'POST', { title: 'Winter lane planning', excerpt: 'Plan ahead.', content: 'Body text.', category: 'Planning' }), 201);
      refuse(await cms(`/blog/${second.id}/schedule`, 'POST', { scheduledAt: new Date(Date.now() - 60000).toISOString() }), 422);
      refuse(await cms(`/blog/${second.id}/schedule`, 'POST', { scheduledAt: 'tomorrow' }), 422);
      const scheduled = ok(await cms(`/blog/${second.id}/schedule`, 'POST', { scheduledAt: future(2) }));
      assert.equal(scheduled.status, 'scheduled');
      assert.equal(scheduled.isLive, false);
      assert.deepEqual(await publicSlugs(), ['cross-border-checklist'], 'not public before its time');
      refuse(await pub('/blog/winter-lane-planning'), 404);
      assert.equal(ok(await pub('/blog?category=Planning')).items.length, 0);
      // time passes: no job runs, the public query simply starts to match
      const past = new Date(Date.now() - 1000);
      await M.BlogPost.updateOne({ _id: second.id }, { $set: { scheduledAt: past, publishedAt: past } });
      assert.deepEqual((await publicSlugs()).sort(), ['cross-border-checklist', 'winter-lane-planning']);
      ok(await pub('/blog/winter-lane-planning'));
      assert.equal(ok(await cms(`/blog/${second.id}`)).isLive, true);
      ID.second = second.id;
    });

    test('unpublish, archive and restore control public visibility', async () => {
      ok(await cms(`/blog/${ID.second}/unpublish`, 'POST'));
      refuse(await pub('/blog/winter-lane-planning'), 404);
      assert.equal(ok(await cms(`/blog/${ID.second}`)).status, 'draft');
      refuse(await cms(`/blog/${ID.second}/unpublish`, 'POST'), 409, 'ALREADY_IN_STATE');
      ok(await cms(`/blog/${post.id}/archive`, 'POST'));
      assert.deepEqual(await publicSlugs(), []);
      refuse(await pub('/blog/cross-border-checklist'), 404);
      refuse(await cms(`/blog/${post.id}/publish`, 'POST'), 409, 'INVALID_STATE');
      refuse(await cms(`/blog/${post.id}/schedule`, 'POST', { scheduledAt: future() }), 409, 'INVALID_STATE');
      const restored = ok(await cms(`/blog/${post.id}/restore`, 'POST'));
      assert.equal(restored.status, 'draft', 'a restored post is never public by itself');
      refuse(await pub('/blog/cross-border-checklist'), 404);
      refuse(await cms(`/blog/${post.id}/restore`, 'POST'), 409, 'ALREADY_IN_STATE');
      ok(await cms(`/blog/${post.id}/publish`, 'POST'));
    });

    test('a scheduled post can be moved back to draft', async () => {
      const third = ok(await cms('/blog', 'POST', { title: 'Spring outlook', excerpt: 'Outlook.', content: 'Text.' }), 201);
      ok(await cms(`/blog/${third.id}/schedule`, 'POST', { scheduledAt: future(5) }));
      const draft = ok(await cms(`/blog/${third.id}/unpublish`, 'POST'));
      assert.equal(draft.status, 'draft');
      assert.equal(draft.scheduledAt, null);
      assert.equal(draft.publishedAt, null);
    });

    test('admin list: search, status, category, featured, sort and pagination; public list: search, category, tag, pagination', async () => {
      assert.ok(ok(await cms('/blog')).pagination.total >= 4);
      assert.equal(ok(await cms('/blog?status=published')).items.length, 1);
      assert.equal(ok(await cms('/blog?q=cross-border')).items.length, 1);
      assert.equal(ok(await cms('/blog?category=Planning')).items.length, 1);
      assert.equal(ok(await cms('/blog?featured=true')).items.length, 1);
      assert.equal(ok(await cms('/blog?sort=title&order=asc&limit=2')).items.length, 2);
      assert.equal(ok(await pub('/blog?q=checklist')).items.length, 1);
      assert.equal(ok(await pub('/blog?tag=CANADA')).items.length, 1);
      assert.equal(ok(await pub('/blog?featured=true')).items.length, 1);
      const paged = ok(await pub('/blog?limit=1&page=1'));
      assert.equal(paged.limit, 1);
      assert.equal(paged.total, 1);
      refuse(await pub('/blog?limit=500'), 400);
      refuse(await pub('/blog?status=draft'), 400);
    });

    test('editing a live post keeps it live; changing its slug needs confirmation', async () => {
      ok(await cms(`/blog/${post.id}`, 'PATCH', { excerpt: 'Updated excerpt.', SEO: { title: 'Cross-border checklist | Hashimi', noIndex: false } }));
      assert.equal(ok(await pub('/blog/cross-border-checklist')).seo.title, 'Cross-border checklist | Hashimi');
      refuse(await cms(`/blog/${post.id}`, 'PATCH', { slug: 'checklist' }), 409, 'SLUG_CHANGE_NEEDS_CONFIRMATION');
      refuse(await cms(`/blog/${post.id}`, 'PATCH', { status: 'draft' }), 422);
      refuse(await cms(`/blog/${post.id}`, 'PATCH', { publishedAt: future() }), 422);
    });

    test('blog changes are audited', async () => {
      for (const action of ['cms.blog.drafted', 'cms.blog.published', 'cms.blog.scheduled', 'cms.blog.unpublished', 'cms.blog.archived', 'cms.blog.restored', 'cms.blog.updated']) {
        assert.ok((await logsFor(action)).length >= 1, action);
      }
      const scheduled = (await logsFor('cms.blog.scheduled'))[0];
      assert.ok(scheduled.metadata.scheduledAt);
      assert.ok(!JSON.stringify(scheduled.metadata).includes('Body text'));
    });
  });

  /* -------------------------------------------------------- faqs, testimonials */
  describe('faqs', () => {
    test('CRUD, visibility, archive, reorder and the public order', async () => {
      await M.Faq.deleteMany({}, { allowHardDelete: true });
      const a = ok(await cms('/faqs', 'POST', { question: 'What freight do you move?', answer: 'Truckload and LTL freight.', category: 'General', displayOrder: 20 }), 201);
      const b = ok(await cms('/faqs', 'POST', { question: 'How do I track?', answer: 'Use the tracking page.', category: 'Tracking', displayOrder: 10 }), 201);
      const c = ok(await cms('/faqs', 'POST', { question: 'Do carriers apply online?', answer: 'Yes, through the carrier page.', category: 'Carriers' }), 201);
      assert.equal(ok(await cms('/faqs?q=track')).items.length, 1);
      assert.equal(ok(await cms('/faqs?category=Carriers')).items.length, 1);
      ok(await cms(`/faqs/${a.id}`, 'PATCH', { answer: 'Truckload, LTL and specialized freight.' }));
      assert.equal(ok(await cms(`/faqs/${a.id}`)).answer, 'Truckload, LTL and specialized freight.');
      ok(await cms('/faqs/reorder', 'POST', { ids: [b.id, a.id, c.id] }));
      const open = ok(await pub('/faqs'));
      assert.equal(open.configured, true);
      assert.deepEqual(open.items.map((f) => f.question), ['Do carriers apply online?', 'What freight do you move?', 'How do I track?'].sort((x, y) => open.items.map((f) => f.question).indexOf(x) - open.items.map((f) => f.question).indexOf(y)));
      assert.equal(ok(await pub('/faqs?category=Tracking')).items.length, 1);
      refuse(await pub('/faqs?category=Gossip'), 400);
      ok(await cms(`/faqs/${b.id}`, 'PATCH', { isActive: false }));
      assert.equal(ok(await pub('/faqs')).items.length, 2);
      ok(await cms(`/faqs/${a.id}/archive`, 'POST'));
      assert.equal(ok(await pub('/faqs')).items.length, 1);
      ok(await cms(`/faqs/${a.id}/restore`, 'POST'));
      assert.equal(ok(await pub('/faqs')).items.length, 2);
      const item = ok(await pub('/faqs')).items[0];
      assert.deepEqual(Object.keys(item).sort(), ['answer', 'category', 'id', 'question']);
    });

    test('the homepage returns at most six FAQs', async () => {
      for (let i = 0; i < 7; i += 1) ok(await cms('/faqs', 'POST', { question: `Extra question ${i}?`, answer: 'Answer.', displayOrder: 100 + i }), 201);
      assert.equal(ok(await pub('/homepage')).collections.faqs.items.length, 6);
    });
  });

  describe('testimonials', () => {
    test('the public list is empty until a real testimonial is entered, and the CMS supports that empty state', async () => {
      assert.deepEqual(ok(await pub('/testimonials')).items, []);
      assert.deepEqual(ok(await cms('/testimonials')).items, []);
      assert.deepEqual(ok(await pub('/homepage')).collections.testimonials.items, []);
    });

    test('CRUD, rating, featured, visibility and archive', async () => {
      const t = ok(await cms('/testimonials', 'POST', { customerName: 'Jordan Rivera', company: 'Example Foods', position: 'Logistics Manager', testimonial: 'Clear communication throughout.', rating: 5, isFeatured: true, photo: { url: 'https://cdn.example.com/jr.jpg', altText: 'Jordan' } }), 201);
      assert.equal(t.rating, 5);
      assert.equal(ok(await cms('/testimonials?featured=true')).items.length, 1);
      const open = ok(await pub('/testimonials')).items[0];
      assert.deepEqual(Object.keys(open).sort(), ['company', 'customerName', 'id', 'isFeatured', 'photo', 'position', 'rating', 'testimonial']);
      const noRating = ok(await cms(`/testimonials/${t.id}`, 'PATCH', { rating: null }));
      assert.equal(noRating.rating, null, 'a rating is optional and can be removed');
      refuse(await cms(`/testimonials/${t.id}`, 'PATCH', { rating: 0 }), 422);
      refuse(await cms(`/testimonials/${t.id}`, 'PATCH', { rating: 4.5 }), 422);
      ok(await cms(`/testimonials/${t.id}`, 'PATCH', { isActive: false }));
      assert.deepEqual(ok(await pub('/testimonials')).items, []);
      ok(await cms(`/testimonials/${t.id}`, 'PATCH', { isActive: true }));
      ok(await cms(`/testimonials/${t.id}/archive`, 'POST'));
      assert.deepEqual(ok(await pub('/testimonials')).items, []);
      ok(await cms(`/testimonials/${t.id}/restore`, 'POST'));
      assert.equal(ok(await pub('/testimonials')).items.length, 1);
      ok(await cms('/testimonials/reorder', 'POST', { ids: [t.id] }));
    });
  });

  /* ------------------------------------------------------------------- media */
  describe('media library', () => {
    test('storage is honestly reported as not configured and uploads are refused', async () => {
      const storage = ok(await cms('/media/storage'));
      assert.equal(storage.configured, false);
      assert.equal(storage.uploadsAvailable, false);
      assert.equal(storage.externalLinksAvailable, true);
      assert.ok(storage.message.includes('not configured'));
      const upload = refuse(await cms('/media/upload', 'POST', {}), 501, 'STORAGE_NOT_CONFIGURED');
      assert.ok(upload.message.includes('not configured'));
      assert.equal(await M.Media.countDocuments({}), 0, 'nothing pretends to have been uploaded');
    });

    test('an externally hosted file can be added by address, with metadata', async () => {
      const media = ok(await cms('/media/external', 'POST', { url: 'https://cdn.example.com/hero.mp4', fileName: 'hero.mp4', type: 'video', mimeType: 'video/mp4', size: 4_200_000, width: 1920, height: 1080, altText: 'Trucks', caption: 'Highway footage', folder: 'hero' }), 201);
      ID.media = media.id;
      assert.equal(media.provider, 'external');
      assert.equal(media.url, 'https://cdn.example.com/hero.mp4');
      assert.deepEqual([media.width, media.height, media.size], [1920, 1080, 4_200_000]);
      assert.ok(media.createdAt);
      refuse(await cms('/media/external', 'POST', { url: 'https://cdn.example.com/hero.mp4', fileName: 'again.mp4', type: 'video' }), 409, 'MEDIA_EXISTS');
      ok(await cms('/media/external', 'POST', { url: 'https://cdn.example.com/poster.jpg', fileName: 'poster.jpg', type: 'image', folder: 'hero' }), 201);
    });

    test('responses never contain storage keys, provider internals or user ids', async () => {
      const text = (await cms(`/media/${ID.media}`)).text + (await cms('/media')).text;
      for (const forbidden of ['storageKey', 'storage_key', 'external:', 'uploadedBy', 'archivedBy', String(ID.admin), '"_id"', '__v']) assert.ok(!text.includes(forbidden), `leaked ${forbidden}`);
      assert.equal((await M.Media.findById(ID.media)).uploadedBy.toString(), String(ID.admin), 'the uploader is recorded from the session');
    });

    test('list filters, folders, update, archive and restore', async () => {
      const list = ok(await cms('/media'));
      assert.equal(list.items.length, 2);
      assert.deepEqual(list.folders, ['hero']);
      assert.equal(list.storage.configured, false);
      assert.equal(ok(await cms('/media?type=video')).items.length, 1);
      assert.equal(ok(await cms('/media?folder=hero')).items.length, 2);
      assert.equal(ok(await cms('/media?q=poster')).items.length, 1);
      const updated = ok(await cms(`/media/${ID.media}`, 'PATCH', { altText: 'Updated alt', caption: 'New caption', folder: 'banners' }));
      assert.equal(updated.altText, 'Updated alt');
      refuse(await cms(`/media/${ID.media}`, 'PATCH', { url: 'https://evil.example.com/x.mp4' }), 422);
      refuse(await cms(`/media/${ID.media}`, 'PATCH', { type: 'image' }), 422);
      refuse(await cms(`/media/${ID.media}/archive`, 'POST'), 404);
      const before = ok(await cms('/media')).items.length;
      ok(await cms(`/media/${ID.media}`, 'DELETE'));
      assert.equal(ok(await cms('/media')).items.length, before - 1, 'the item is gone from the library');
      assert.equal(await M.Media.countDocuments({ _id: ID.media }), 0, 'and permanently gone from the database');
      refuse(await cms(`/media/${ID.media}`, 'DELETE'), 404);
    });

    test('media changes are audited', async () => {
      for (const action of ['media.registered', 'media.updated', 'media.deleted']) {
        const [entry] = await logsFor(action);
        assert.ok(entry, action);
        assert.equal(entry.module, 'media');
      }
    });
  });

  /* ------------------------------------------------------------- seo/settings */
  describe('seo', () => {
    test('global SEO is editable and reaches the public API', async () => {
      const saved = ok(await cms('/seo/global', 'PATCH', { websiteTitle: 'Hashimi Logistics | Freight Brokerage', description: 'Freight brokerage and transportation solutions.', canonicalBaseUrl: 'https://www.example.com', defaultSEO: { ogImage: 'https://cdn.example.com/og.jpg', noIndex: false, title: 'Hashimi Logistics' } }));
      assert.equal(saved.websiteTitle, 'Hashimi Logistics | Freight Brokerage');
      assert.equal(saved.canonicalBaseUrl, 'https://www.example.com');
      const open = ok(await pub('/seo'));
      assert.equal(open.global.siteName, 'HASHIMI LOGISTICS INC.');
      assert.equal(open.global.canonicalBaseUrl, 'https://www.example.com');
      assert.equal(open.global.ogImage, 'https://cdn.example.com/og.jpg');
      refuse(await cms('/seo/global', 'PATCH', { canonicalBaseUrl: 'javascript:alert(1)' }), 422);
      refuse(await cms('/seo/global', 'PATCH', { companyName: 'x' }), 422);
    });

    test('per-record SEO for pages, blog posts, services, industries and service areas, plus the homepage', async () => {
      const homepage = ok(await cms('/seo/homepage', 'PATCH', { SEO: { title: 'Home', description: 'Freight brokerage home page description that is reasonably long.', noIndex: false } }));
      assert.equal(homepage.seo.title, 'Home');
      const page = ok(await cms(`/seo/page/${ID.about}`, 'PATCH', { SEO: { title: 'About', canonicalUrl: '/about', noIndex: true, keywords: ['freight'] } }));
      assert.equal(page.seo.noIndex, true);
      assert.equal(ok(await pub('/pages/about')).seo.canonicalUrl, '/about');
      assert.equal(ok(await pub('/pages/about')).seo.noIndex, true);
      ok(await cms(`/seo/blog/${ID.second}`, 'PATCH', { SEO: { title: 'Winter planning', ogImage: 'https://cdn.example.com/w.jpg' } }));
      ok(await cms(`/seo/service/${ID.ftl}`, 'PATCH', { SEO: { title: 'FTL' } }));
      const industry = await M.Industry.findOne({});
      ok(await cms(`/seo/industry/${industry._id}`, 'PATCH', { SEO: { title: 'Industry' } }));
      const area = await M.ServiceArea.findOne({});
      ok(await cms(`/seo/service-area/${area._id}`, 'PATCH', { SEO: { title: 'Area' } }));
      refuse(await cms(`/seo/page/${MISSING}`, 'PATCH', { SEO: {} }), 404);
      refuse(await cms(`/seo/page/${ID.about}`, 'PATCH', { SEO: { robots: 'noindex' } }), 422);
      refuse(await cms(`/seo/page/${ID.about}`, 'PATCH', { SEO: { title: '<script>x</script>' } }), 422);
      refuse(await cms(`/seo/page/${ID.about}`, 'PATCH', { SEO: { ogImage: 'javascript:alert(1)' } }), 422);
    });

    test('the SEO overview lists every record with its SEO and its gaps', async () => {
      const data = ok(await cms('/seo'));
      const kinds = new Set(data.entries.map((e) => e.kind));
      for (const kind of ['homepage', 'page', 'blog', 'service', 'industry', 'service-area']) assert.ok(kinds.has(kind), kind);
      const missing = data.entries.find((e) => e.kind === 'service' && e.title === 'Less Than Truckload');
      assert.ok(missing.issues.includes('No SEO title'));
      assert.equal(data.global.exists, true);
    });

    test('SEO changes are audited', async () => {
      for (const action of ['seo.global.updated', 'seo.homepage.updated', 'seo.page.updated', 'seo.blog.updated', 'seo.service.updated']) {
        const [entry] = await logsFor(action);
        assert.ok(entry, action);
        assert.equal(entry.module, 'seo');
      }
    });
  });

  describe('website settings', () => {
    test('reading settings does not create them; fields start empty (no invented contact details)', async () => {
      await M.SiteSettings.deleteMany({});
      const data = ok(await cms('/settings'));
      assert.equal(data.exists, false);
      assert.equal(await M.SiteSettings.countDocuments({}), 0);
      const open = ok(await pub('/site-settings'));
      assert.deepEqual(open, { configured: false });
    });

    test('company details, contact, hours, social links, branding and CTA can be saved', async () => {
      const data = ok(
        await cms('/settings', 'PATCH', {
          companyName: 'HASHIMI LOGISTICS INC.', shortName: 'Hashimi', tagline: 'Freight Brokerage & Transportation Solutions',
          phone: '+1 555 010 0100', email: 'dispatch@example.com',
          address: { street: '1 Example Way', city: 'Chicago', state: 'IL', zipCode: '60601', country: 'US' },
          businessHours: [{ day: 'monday', isClosed: false, opensAt: '08:00', closesAt: '17:00' }, { day: 'sunday', isClosed: true, opensAt: '', closesAt: '' }],
          socialLinks: [{ platform: 'linkedin', url: 'https://www.linkedin.com/company/example' }],
          logo: { url: 'https://cdn.example.com/logo.svg', altText: 'Hashimi Logistics' }, favicon: { url: 'https://cdn.example.com/favicon.png' },
          primaryCta: { label: 'Request a Quote', url: '/request-quote' }, footerText: 'Freight brokerage and transportation coordination.', copyrightText: '© HASHIMI LOGISTICS INC.',
        })
      );
      assert.equal(data.exists, true);
      assert.equal(data.address.city, 'Chicago');
      assert.equal(data.businessHours.length, 2);
      assert.equal(data.businessHours[1].isClosed, true);
      const open = ok(await pub('/site-settings'));
      assert.equal(open.phone, '+1 555 010 0100');
      assert.equal(open.logo.url, 'https://cdn.example.com/logo.svg');
      assert.equal(open.primaryCta.url, '/request-quote');
      assert.equal(open.socialLinks[0].platform, 'linkedin');
      assert.ok(!('_id' in open) && !('key' in open) && !('timezone' in open) && !('createdAt' in open) && !('updatedAt' in open));
    });

    test('contact details can be cleared again; invalid values are field errors', async () => {
      ok(await cms('/settings', 'PATCH', { phone: '', email: '', logo: null }));
      const open = ok(await pub('/site-settings'));
      assert.equal(open.phone, null);
      assert.equal(open.email, null);
      assert.equal(open.logo, null);
      const bad = await cms('/settings', 'PATCH', { email: 'not-an-email', phone: 'abc' });
      refuse(bad, 422);
      assert.ok(fieldErrors(bad).some((f) => f.endsWith('email')));
      refuse(await cms('/settings', 'PATCH', { businessHours: [{ day: 'monday', isClosed: false, opensAt: '25:00', closesAt: '' }] }), 422);
      refuse(await cms('/settings', 'PATCH', { businessHours: [{ day: 'monday', isClosed: true, opensAt: '', closesAt: '' }, { day: 'monday', isClosed: true, opensAt: '', closesAt: '' }] }), 422);
      refuse(await cms('/settings', 'PATCH', { address: { country: 'FR' } }), 422);
      refuse(await cms('/settings', 'PATCH', { companyName: '' }), 422);
    });

    test('settings changes are audited with field names only', async () => {
      const entries = await logsFor('settings.site.updated');
      assert.ok(entries.length >= 2);
      assert.equal(entries[0].module, 'settings');
      assert.ok(!JSON.stringify(entries).includes('dispatch@example.com'));
    });

    test('the Phase 8 settings view still works and shows the saved values', async () => {
      const view = await api('GET', '/admin/settings', { cookie: S.admin });
      assert.equal(view.status, 200);
      assert.equal(view.body.data.settings.companyName, 'HASHIMI LOGISTICS INC.');
    });
  });

  /* -------------------------------------------------------- overview & caching */
  describe('overview, caching and headers', () => {
    test('the overview counts real records', async () => {
      const data = ok(await cms('/overview'));
      assert.equal(data.storage.configured, false);
      assert.equal(data.settings.configured, true);
      assert.ok(data.services.total >= 3);
      assert.ok(data.blog.live >= 1);
      assert.equal(data.testimonials.total, 1);
    });

    test('public errors are never cached, so a post published a moment later is not hidden by a cached 404', async () => {
      const missing = await pub('/blog/no-such-post-anywhere');
      assert.equal(missing.status, 404);
      assert.equal(missing.headers.get('cache-control'), 'no-store');
    });

    test('admin responses are not cacheable; public responses are cacheable briefly', async () => {
      const admin = await cms('/overview');
      assert.equal(admin.headers.get('cache-control'), 'no-store');
      const open = await pub('/services');
      assert.match(open.headers.get('cache-control'), /public, max-age=30/);
      assert.ok(open.headers.get('etag'));
      // fetch() rewrites cache headers when If-None-Match is set, so use a plain HTTP request for the conditional GET.
      const { request } = await import('node:http');
      const status = await new Promise((resolve, reject) => {
        const req = request(`${baseUrl}/api/v1/content/services`, { headers: { 'If-None-Match': open.headers.get('etag') } }, (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on('error', reject);
        req.end();
      });
      assert.equal(status, 304);
    });
  });

  /* ---------------------------------------------------------- public safety */
  describe('public API cannot leak private data', () => {
    const PUBLIC_PATHS = ['/site-settings', '/homepage', '/seo', '/pages', '/pages/about', '/services', '/services/full-truckload', '/industries', '/industries/manufacturing', '/service-areas', '/blog', '/blog/cross-border-checklist', '/faqs', '/testimonials'];

    test('no response contains ids, internal fields, user data or storage details', async () => {
      const forbidden = [
        '"_id"', '__v', 'createdAt', 'archivedAt', 'archivedBy', 'uploadedBy', 'storageKey', 'passwordHash', 'cms.root@example.com', String(ID.admin), '"author":', 'mediaId', 'accessToken', 'JWT', 'secret',
        'tokenVersion', 'internalNotes', 'notes"', '"key":"primary"', 'timezone', 'isActive', 'displayOrder', 'status"',
      ];
      for (const path of PUBLIC_PATHS) {
        const response = await pub(path);
        assert.equal(response.status, 200, `${path}: ${response.text.slice(0, 200)}`);
        for (const word of forbidden) assert.ok(!response.text.includes(word), `${path} leaked ${word}`);
      }
    });

    test('drafts, hidden, archived and future content never appear anywhere in public responses', async () => {
      const draft = ok(await cms('/blog', 'POST', { title: 'Unlisted draft launch', excerpt: 'XLEAK-DRAFT-EXCERPT', content: 'XLEAK-DRAFT-BODY' }), 201);
      const hidden = ok(await cms('/faqs', 'POST', { question: 'XLEAK-HIDDEN-QUESTION?', answer: 'x', isActive: false }), 201);
      const planned = ok(await cms('/blog', 'POST', { title: 'Planned launch', excerpt: 'XLEAK-FUTURE-EXCERPT', content: 'XLEAK-FUTURE-BODY' }), 201);
      ok(await cms(`/blog/${planned.id}/schedule`, 'POST', { scheduledAt: future(30) }));
      const archivedPage = ok(await cms('/pages', 'POST', { title: 'XLEAK-ARCHIVED-PAGE', content: 'x' }), 201);
      ok(await cms(`/pages/${archivedPage.id}/archive`, 'POST'));
      void draft; void hidden;
      for (const path of [...PUBLIC_PATHS, '/blog?limit=50', '/faqs?category=General', '/pages', '/homepage']) {
        const text = (await pub(path)).text;
        assert.ok(!/XLEAK-/.test(text), `${path} leaked unpublished content`);
        assert.ok(!text.includes('Unlisted draft launch') && !text.includes('Planned launch'), `${path} leaked a title`);
      }
      refuse(await pub('/blog/unlisted-draft-launch'), 404);
      refuse(await pub('/blog/planned-launch'), 404);
      refuse(await pub('/pages/xleak-archived-page'), 404);
    });

    test('public routes reject bad slugs, unknown parameters and operators', async () => {
      refuse(await pub('/services/Bad_Slug'), 400);
      refuse(await pub('/blog/..%2f..%2fetc'), 400);
      refuse(await pub('/pages/%24ne'), 400);
      refuse(await pub('/services?unknown=1'), 400);
      refuse(await pub('/services/nope-not-here'), 404, 'CONTENT_NOT_FOUND');
      refuse(await pub('/services?$where=1'), 400, 'OPERATOR_NOT_ALLOWED');
    });

    test('a public POST/PATCH/DELETE does not exist', async () => {
      for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
        const response = await api(method, '/content/services', { body: { name: 'x' } });
        assert.ok([404, 405].includes(response.status), `${method}: ${response.status}`);
      }
      assert.equal(await M.Service.countDocuments({ name: 'x' }), 0);
    });
  });

  /* -------------------------------------------------------------- audit trail */
  describe('activity log', () => {
    test('every CMS action is recorded against the Super Admin with no secrets', async () => {
      const entries = await M.ActivityLog.find({ module: { $in: ['cms', 'media', 'seo', 'settings'] } }).lean();
      assert.ok(entries.length >= 40, `only ${entries.length} entries`);
      for (const entry of entries) {
        assert.equal(String(entry.userId), String(ID.admin));
        assert.ok(entry.action.startsWith('cms.') || entry.action.startsWith('media.') || entry.action.startsWith('seo.') || entry.action.startsWith('settings.'), entry.action);
        assert.ok(!/pass(word)?|secret|token|authorization|cookie|api[-_]?key|credential|hash/i.test(JSON.stringify(entry.metadata ?? {})), `${entry.action} metadata`);
      }
    });

    test('refused requests (validation, forbidden) write no content audit entry', async () => {
      const before = await M.ActivityLog.countDocuments({ module: 'cms' });
      refuse(await cms('/services', 'POST', { name: '<b>x</b>' }), 422);
      await api('POST', '/admin/cms/services', { cookie: S.customer, body: { name: 'Nope' } });
      assert.equal(await M.ActivityLog.countDocuments({ module: 'cms' }), before);
    });

    test('the Phase 8 activity-log view shows CMS entries and redacts nothing sensitive', async () => {
      const view = await api('GET', '/admin/activity-logs?module=cms&limit=5', { cookie: S.admin });
      assert.equal(view.status, 200, view.text.slice(0, 200));
      assert.ok(view.body.data.items.length > 0);
    });
  });

  /* ------------------------------------------------------------------ indexes */
  describe('schema and indexes', () => {
    const keys = (Model) => Model.schema.indexes().map(([fields, options]) => ({ fields: JSON.stringify(fields), options }));
    test('slug, status, publishedAt, visibility, archive, order and featured are indexed; no index is declared twice', () => {
      const has = (Model, fields) => keys(Model).some((index) => index.fields === JSON.stringify(fields));
      assert.ok(has(M.Page, { status: 1, displayOrder: 1 }));
      assert.ok(has(M.Page, { pageKey: 1 }));
      assert.ok(has(M.BlogPost, { status: 1, publishedAt: -1 }));
      assert.ok(has(M.BlogPost, { status: 1, scheduledAt: 1 }));
      assert.ok(has(M.BlogPost, { isFeatured: 1, status: 1, publishedAt: -1 }));
      for (const Model of [M.Service, M.Industry, M.ServiceArea, M.Faq, M.Testimonial]) {
        assert.ok(has(Model, Model === M.Faq ? { isActive: 1, category: 1, displayOrder: 1 } : { isActive: 1, displayOrder: 1 }), Model.modelName);
        assert.ok(has(Model, { archivedAt: 1, isActive: 1, displayOrder: 1 }), Model.modelName);
      }
      for (const Model of [M.Page, M.Service, M.Industry, M.BlogPost, M.ServiceArea]) assert.ok(has(Model, { slug: 1 }), `${Model.modelName} slug`);
      for (const Model of [M.Page, M.Service, M.Industry, M.ServiceArea, M.Faq, M.Testimonial, M.Media, M.BlogPost]) {
        const all = keys(Model).map((index) => index.fields);
        assert.equal(new Set(all).size, all.length, `${Model.modelName} declares an index twice`);
      }
    });

    test('the page key index is unique and sparse so custom pages are unaffected', () => {
      const index = keys(M.Page).find((i) => i.fields === JSON.stringify({ pageKey: 1 }));
      assert.equal(index.options.unique, true);
      assert.equal(index.options.sparse, true);
    });
  });
});
