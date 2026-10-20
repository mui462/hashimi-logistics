/**
 * Stage 4: website theme (SiteSettings.themeAppearance) and homepage section appearance (Homepage.<section>.appearance).
 * Super Admin only, presets and validated values only, stored on the existing records without touching anything else.
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27017/hashimi_theme_test npm test
 *
 * The database name MUST end in "_test" (the suite drops it). Without MONGO_TEST_URI every test is skipped, not passed.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

const testUri = process.env.MONGO_TEST_URI;
const skipReason = testUri ? false : 'MONGO_TEST_URI is not set; these tests require a live MongoDB';

if (testUri) {
  const databaseName = new URL(testUri).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) throw new Error(`Refusing to run: database "${databaseName}" must end with "_test" because it is dropped afterwards.`);
  Object.assign(process.env, {
    NODE_ENV: 'development',
    MONGO_URI: testUri,
    JWT_SECRET: 'theme-test-secret-theme-test-secret-theme-1234',
    CLIENT_URL: 'http://localhost:5173',
    AUTH_RATE_LIMIT_MAX: '10000',
    GLOBAL_RATE_LIMIT_MAX: '100000',
    LOGIN_ACCOUNT_LIMIT_MAX: '500',
  });
}

const PASS = { admin: 'administrator-pass-phrase-1', customer: 'customer-pass-phrase-2', carrier: 'carrier-pass-phrase-3' };
const THEME = '/admin/cms/settings/theme-appearance';

describe('website theme and homepage section appearance', { skip: skipReason }, () => {
  let mongoose;
  let server;
  let baseUrl;
  let M;
  let hashPassword;
  let DEFAULT_THEME;
  let DEFAULT_NAVBAR;
  const S = {};

  async function api(method, path, { body, cookie } = {}) {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const setCookie = response.headers.get('set-cookie');
    return { status: response.status, text, body: text ? JSON.parse(text) : null, cookie: setCookie ? setCookie.split(';')[0] : null, headers: response.headers };
  }
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const customTheme = () => {
    const theme = copy(DEFAULT_THEME);
    theme.colors.accentColor = '#c9a045';
    theme.colors.surfaceColor = '#fafaf9';
    theme.layout.cornerRadius = 'soft';
    theme.layout.contentWidth = 'wide';
    theme.motion.preset = 'subtle';
    theme.motion.durationMs = 450;
    theme.motion.staggerMs = 60;
    return theme;
  };

  before(async () => {
    const database = await import('../src/config/database.js');
    ({ default: mongoose } = await import('mongoose'));
    const { default: app } = await import('../src/app.js');
    M = await import('../src/models/index.js');
    ({ hashPassword } = await import('../src/services/password.service.js'));
    ({ DEFAULT_THEME_APPEARANCE: DEFAULT_THEME } = await import('../src/cms/themeAppearance.js'));
    ({ DEFAULT_NAVBAR_APPEARANCE: DEFAULT_NAVBAR } = await import('../src/cms/navbarAppearance.js'));
    await database.connectDatabase();
    await mongoose.connection.dropDatabase();
    const results = await Promise.allSettled(Object.values(M.models).map((Model) => Model.init()));
    results.forEach((result) => {
      if (result.status === 'rejected' && !/partialFilterExpression/.test(result.reason?.message ?? '')) throw result.reason;
    });
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    for (const [key, role, email] of [['admin', 'super_admin', 'root@example.com'], ['customer', 'customer', 'cust@example.com'], ['carrier', 'carrier', 'haul@example.com']]) {
      const user = await M.User.create({ firstName: 'Direct', lastName: role, email, role, passwordHash: await hashPassword(PASS[key]) });
      if (role === 'customer') await M.Customer.create({ userId: user._id, companyName: 'Cust Co' });
      if (role === 'carrier') await M.Carrier.create({ userId: user._id, companyName: 'Haul Co' });
      const login = await api('POST', role === 'super_admin' ? '/auth/admin/login' : '/auth/login', { body: { email, password: PASS[key] } });
      assert.equal(login.status, 200, `${key} signs in`);
      S[key] = login.cookie;
    }
  });

  after(async () => {
    server?.close();
    await mongoose?.connection.dropDatabase();
    await mongoose?.disconnect();
  });

  describe('website theme', () => {
    test('only the Super Admin can read, save or reset it (enforced by the API)', async () => {
      for (const [method, path, body] of [['GET', THEME], ['PUT', THEME, customTheme()], ['POST', `${THEME}/reset`, {}]]) {
        assert.equal((await api(method, path, { body })).status, 401, `${method} anonymous`);
        assert.equal((await api(method, path, { body, cookie: S.customer })).status, 403, `${method} customer`);
        assert.equal((await api(method, path, { body, cookie: S.carrier })).status, 403, `${method} carrier`);
      }
      assert.equal(await M.SiteSettings.countDocuments({}), 0, 'refused calls created nothing');
      const read = await api('GET', THEME, { cookie: S.admin });
      assert.equal(read.status, 200);
      assert.deepEqual(read.body.data.theme, DEFAULT_THEME);
      assert.equal(read.body.data.isDefault, true);
      assert.equal(DEFAULT_THEME.colors.darkestColor, '#111111', 'the defaults are the current neutral charcoal palette');
    });

    test('a valid save is stored on the one settings record and served publicly, without touching the navbar or other settings', async () => {
      assert.equal((await api('PATCH', '/admin/cms/settings', { cookie: S.admin, body: { companyName: 'Kept Company' } })).status, 200);
      const saved = await api('PUT', THEME, { cookie: S.admin, body: customTheme() });
      assert.equal(saved.status, 200, saved.text);
      assert.equal(saved.body.data.theme.colors.accentColor, '#C9A045');
      assert.equal(await M.SiteSettings.countDocuments({}), 1);
      const site = (await api('GET', '/content/site-settings')).body.data;
      assert.equal(site.companyName, 'Kept Company');
      assert.equal(site.themeAppearance.layout.cornerRadius, 'soft');
      assert.equal(site.themeAppearance.motion.preset, 'subtle');
      assert.deepEqual(site.navbarAppearance, DEFAULT_NAVBAR, 'navbar settings are a separate, untouched source');
      assert.ok(await M.ActivityLog.findOne({ action: 'settings.theme_appearance.updated' }).lean());
    });

    test('only #RRGGBB colours, listed presets and in-range whole numbers are accepted; nothing changes on refusal', async () => {
      const before = (await api('GET', '/content/site-settings')).body.data.themeAppearance;
      const cases = [
        ['named colour', (t) => { t.colors.accentColor = 'gold'; }],
        ['css injection', (t) => { t.colors.surfaceColor = '#ffffff;}body{display:none'; }],
        ['short hex', (t) => { t.colors.darkColor = '#111'; }],
        ['url', (t) => { t.colors.borderColor = 'url(https://evil.example/x)'; }],
        ['unknown preset', (t) => { t.layout.cornerRadius = 'pill'; }],
        ['free-form width', (t) => { t.layout.contentWidth = '100vw'; }],
        ['unknown motion preset', (t) => { t.motion.preset = 'wild'; }],
        ['duration too long', (t) => { t.motion.durationMs = 5000; }],
        ['duration too short', (t) => { t.motion.durationMs = 50; }],
        ['stagger too long', (t) => { t.motion.staggerMs = 151; }],
        ['fractional', (t) => { t.motion.durationMs = 450.5; }],
        ['missing group', (t) => { delete t.layout; }],
        ['extra field', (t) => { t.colors.customCss = 'x'; }],
        ['extra group', (t) => { t.scripts = { onload: 'alert(1)' }; }],
      ];
      for (const [label, mutate] of cases) {
        const body = customTheme();
        mutate(body);
        assert.equal((await api('PUT', THEME, { cookie: S.admin, body })).status, 422, label);
      }
      assert.deepEqual((await api('GET', '/content/site-settings')).body.data.themeAppearance, before);
    });

    test('a damaged stored value falls back to its default; reset removes only the theme', async () => {
      await M.SiteSettings.collection.updateOne({ key: 'primary' }, { $set: { 'themeAppearance.colors.accentColor': 'red;}*{x', 'themeAppearance.motion.durationMs': 99999 } });
      const theme = (await api('GET', '/content/site-settings')).body.data.themeAppearance;
      assert.equal(theme.colors.accentColor, DEFAULT_THEME.colors.accentColor);
      assert.equal(theme.motion.durationMs, DEFAULT_THEME.motion.durationMs);
      assert.equal(theme.layout.cornerRadius, 'soft', 'valid saved values are kept');

      const reset = await api('POST', `${THEME}/reset`, { cookie: S.admin, body: {} });
      assert.equal(reset.status, 200);
      assert.deepEqual(reset.body.data.theme, DEFAULT_THEME);
      const stored = await M.SiteSettings.findOne({ key: 'primary' }).lean();
      assert.equal(stored.themeAppearance, undefined);
      assert.equal(stored.companyName, 'Kept Company');
    });
  });

  describe('homepage section appearance', () => {
    test('presets are saved with the section through the existing homepage editor API, without touching content, visibility, order or the hero overlay', async () => {
      const seed = await api('PATCH', '/admin/cms/homepage', {
        cookie: S.admin,
        body: {
          hero: { overlay: { color: '#000000', opacity: 0.1, isActive: true } },
          sectionOrder: ['faq', 'services', 'trust', 'whyChooseUs', 'howItWorks', 'industries', 'crossBorder', 'serviceAreas', 'stats', 'testimonials', 'finalCTA'],
          servicesSection: { title: 'Our services', isActive: true },
          faq: { title: 'Questions', isActive: false },
        },
      });
      assert.equal(seed.status, 200, seed.text);
      const saved = await api('PATCH', '/admin/cms/homepage', {
        cookie: S.admin,
        body: {
          servicesSection: { title: 'Our services', isActive: true, appearance: { background: 'glass', spacing: 'spacious', animation: 'fade' } },
          whyChooseUs: { title: 'Why us', appearance: { background: 'light', cardStyle: 'glass' } },
          faq: { title: 'Questions', isActive: false, appearance: { background: 'muted', spacing: 'compact', animation: 'none' } },
        },
      });
      assert.equal(saved.status, 200, saved.text);
      const admin = (await api('GET', '/admin/cms/homepage', { cookie: S.admin })).body.data;
      assert.deepEqual(admin.servicesSection.appearance, { background: 'glass', spacing: 'spacious', animation: 'fade', cardStyle: 'default' });
      assert.equal(admin.servicesSection.title, 'Our services');
      assert.equal(admin.faq.isActive, false, 'visibility kept');
      assert.equal(admin.sectionOrder[0], 'faq', 'order kept');
      assert.equal(admin.hero.overlay.opacity, 0.1, 'saved hero overlay kept');

      const home = (await api('GET', '/content/homepage')).body.data;
      assert.deepEqual(home.services.appearance, { background: 'glass', spacing: 'spacious', animation: 'fade', cardStyle: 'default' });
      assert.equal(home.whyChooseUs.appearance.cardStyle, 'glass');
      assert.deepEqual(home.stats.appearance, { background: 'default', spacing: 'standard', animation: 'default', cardStyle: 'default' }, 'unsaved sections keep their built-in look');
      assert.equal(home.hero.overlay.opacity, 0.1);
    });

    test('each section accepts only the presets it supports; arbitrary values and styles are refused', async () => {
      const before = (await api('GET', '/admin/cms/homepage', { cookie: S.admin })).body.data;
      const cases = [
        ['faq cannot be dark (its text is dark)', { faq: { appearance: { background: 'dark' } } }],
        ['trust has no background control', { trust: { appearance: { background: 'muted' } } }],
        ['services has no card style', { servicesSection: { appearance: { cardStyle: 'glass' } } }],
        ['unknown background', { industries: { appearance: { background: 'navy' } } }],
        ['unknown spacing', { industries: { appearance: { spacing: '200px' } } }],
        ['unknown animation', { industries: { appearance: { animation: 'spin' } } }],
        ['free-form style', { industries: { appearance: { style: 'color:red' } } }],
        ['colour value', { industries: { appearance: { background: '#000000' } } }],
      ];
      for (const [label, body] of cases) {
        assert.equal((await api('PATCH', '/admin/cms/homepage', { cookie: S.admin, body })).status, 422, label);
      }
      assert.deepEqual((await api('GET', '/admin/cms/homepage', { cookie: S.admin })).body.data, before);
    });

    test('customers and carriers cannot change the homepage', async () => {
      const body = { servicesSection: { appearance: { background: 'dark' } } };
      assert.equal((await api('PATCH', '/admin/cms/homepage', { body })).status, 401);
      assert.equal((await api('PATCH', '/admin/cms/homepage', { body, cookie: S.customer })).status, 403);
      assert.equal((await api('PATCH', '/admin/cms/homepage', { body, cookie: S.carrier })).status, 403);
    });
  });
});
