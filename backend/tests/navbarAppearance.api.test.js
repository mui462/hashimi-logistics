/**
 * Navbar appearance settings (Website CMS -> Navbar appearance): Super Admin only, strict validation, stored on the one
 * SiteSettings record without touching any other setting, and always served to the public site as a complete, safe set.
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27017/hashimi_navbar_test npm test
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
    JWT_SECRET: 'navbar-test-secret-navbar-test-secret-navbar-1234',
    CLIENT_URL: 'http://localhost:5173',
    AUTH_RATE_LIMIT_MAX: '10000',
    GLOBAL_RATE_LIMIT_MAX: '100000',
    LOGIN_ACCOUNT_LIMIT_MAX: '500',
  });
}

const PASS = { admin: 'administrator-pass-phrase-1', customer: 'customer-pass-phrase-2', carrier: 'carrier-pass-phrase-3' };
const PATH = '/admin/cms/settings/navbar-appearance';

describe('navbar appearance settings', { skip: skipReason }, () => {
  let mongoose;
  let server;
  let baseUrl;
  let M;
  let hashPassword;
  let DEFAULTS;
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
  const copy = () => JSON.parse(JSON.stringify(DEFAULTS));
  const custom = () => {
    const value = copy();
    value.hero.backgroundColor = '#1a1a1a';
    value.hero.backgroundOpacity = 50;
    value.hero.blur = 12;
    value.scrolled.backgroundColor = '#202020';
    value.scrolled.scrollThreshold = 80;
    value.quoteButton.backgroundColor = '#C9A045';
    return value;
  };
  const publicAppearance = async () => (await api('GET', '/content/site-settings')).body.data.navbarAppearance;

  before(async () => {
    const database = await import('../src/config/database.js');
    ({ default: mongoose } = await import('mongoose'));
    const { default: app } = await import('../src/app.js');
    M = await import('../src/models/index.js');
    ({ hashPassword } = await import('../src/services/password.service.js'));
    ({ DEFAULT_NAVBAR_APPEARANCE: DEFAULTS } = await import('../src/cms/navbarAppearance.js'));
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

  test('with no settings record the public answer is unchanged ({ configured: false }); once one exists it carries the complete defaults', async () => {
    assert.equal(await M.SiteSettings.countDocuments({}), 0);
    const response = await api('GET', '/content/site-settings');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, { configured: false }, 'the website falls back to its built-in defaults');
    await M.SiteSettings.getPrimary();
    assert.deepEqual(await publicAppearance(), DEFAULTS);
    await M.SiteSettings.deleteMany({});
    assert.equal(DEFAULTS.hero.backgroundColor, '#111111');
    assert.equal(DEFAULTS.quoteButton.backgroundColor, '#D8AD54');
  });

  test('only the Super Admin can read, save or reset it (enforced by the API)', async () => {
    for (const [method, path, body] of [['GET', PATH], ['PUT', PATH, custom()], ['POST', `${PATH}/reset`, {}]]) {
      assert.equal((await api(method, path, { body })).status, 401, `${method} anonymous`);
      assert.equal((await api(method, path, { body, cookie: S.customer })).status, 403, `${method} customer`);
      assert.equal((await api(method, path, { body, cookie: S.carrier })).status, 403, `${method} carrier`);
    }
    assert.equal(await M.SiteSettings.countDocuments({}), 0, 'refused saves created or changed nothing');
    const read = await api('GET', PATH, { cookie: S.admin });
    assert.equal(read.status, 200);
    assert.equal(read.headers.get('cache-control'), 'no-store');
    assert.deepEqual(read.body.data.appearance, DEFAULTS);
    assert.deepEqual(read.body.data.defaults, DEFAULTS);
    assert.equal(read.body.data.isDefault, true);
  });

  test('a valid save is stored on the one settings record, served to the public site, and leaves other settings alone', async () => {
    assert.equal((await api('PATCH', '/admin/cms/settings', { cookie: S.admin, body: { companyName: 'Kept Company Name', tagline: 'Kept tagline' } })).status, 200);
    const saved = await api('PUT', PATH, { cookie: S.admin, body: custom() });
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.body.data.isDefault, false);
    assert.equal(saved.body.data.appearance.hero.backgroundColor, '#1A1A1A', 'colours are normalised to upper case');
    assert.equal(await M.SiteSettings.countDocuments({}), 1, 'no second settings record');

    const site = (await api('GET', '/content/site-settings')).body.data;
    assert.equal(site.companyName, 'Kept Company Name');
    assert.equal(site.tagline, 'Kept tagline');
    assert.equal(site.navbarAppearance.hero.backgroundOpacity, 50);
    assert.equal(site.navbarAppearance.hero.blur, 12);
    assert.equal(site.navbarAppearance.scrolled.scrollThreshold, 80);
    assert.equal(site.navbarAppearance.quoteButton.backgroundColor, '#C9A045');
    assert.ok(await M.ActivityLog.findOne({ action: 'settings.navbar_appearance.updated' }).lean(), 'the change is audited');
  });

  test('anything other than #RRGGBB colours, in-range whole numbers and true/false is refused, and nothing changes', async () => {
    const before = await publicAppearance();
    const cases = [
      ['short hex', (v) => { v.hero.textColor = '#fff'; }],
      ['named colour', (v) => { v.hero.textColor = 'red'; }],
      ['css injection', (v) => { v.hero.backgroundColor = '#111111;background:url(https://evil.example/x)'; }],
      ['rgba string', (v) => { v.links.hoverColor = 'rgba(0,0,0,0.5)'; }],
      ['url', (v) => { v.quoteButton.backgroundColor = 'https://evil.example'; }],
      ['markup', (v) => { v.trackButton.textColor = '<script>alert(1)</script>'; }],
      ['opacity over 100', (v) => { v.hero.backgroundOpacity = 101; }],
      ['negative opacity', (v) => { v.hero.borderOpacity = -1; }],
      ['blur over 20', (v) => { v.hero.blur = 21; }],
      ['transition over 1000', (v) => { v.scrolled.transitionMs = 5000; }],
      ['threshold over 400', (v) => { v.scrolled.scrollThreshold = 401; }],
      ['fractional number', (v) => { v.scrolled.scrollThreshold = 10.5; }],
      ['number as text', (v) => { v.hero.backgroundOpacity = '50'; }],
      ['switch as text', (v) => { v.hero.transparentEnabled = 'yes'; }],
      ['missing group', (v) => { delete v.links; }],
      ['missing field', (v) => { delete v.scrolled.backgroundColor; }],
      ['unknown group', (v) => { v.customCss = { body: 'x' }; }],
      ['unknown field', (v) => { v.hero.style = 'color:red'; }],
    ];
    for (const [label, mutate] of cases) {
      const body = custom();
      mutate(body);
      const response = await api('PUT', PATH, { cookie: S.admin, body });
      assert.equal(response.status, 422, label);
    }
    const operator = custom();
    operator.hero = { $set: { textColor: '#000000' } };
    assert.equal((await api('PUT', PATH, { cookie: S.admin, body: operator })).status, 400, 'operator keys are refused');
    assert.deepEqual(await publicAppearance(), before);
  });

  test('a damaged stored value never reaches the website: that field falls back to its default', async () => {
    await M.SiteSettings.collection.updateOne({ key: 'primary' }, { $set: { 'navbarAppearance.hero.textColor': 'red;}*{display:none', 'navbarAppearance.scrolled.transitionMs': 99999, 'navbarAppearance.links': 'oops' } });
    const appearance = await publicAppearance();
    assert.equal(appearance.hero.textColor, DEFAULTS.hero.textColor);
    assert.equal(appearance.scrolled.transitionMs, DEFAULTS.scrolled.transitionMs);
    assert.deepEqual(appearance.links, DEFAULTS.links);
    assert.equal(appearance.hero.backgroundOpacity, 50, 'valid saved values are kept');
  });

  test('reset restores the approved defaults and keeps every other website setting', async () => {
    const reset = await api('POST', `${PATH}/reset`, { cookie: S.admin, body: {} });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.data.isDefault, true);
    assert.deepEqual(reset.body.data.appearance, DEFAULTS);
    const site = (await api('GET', '/content/site-settings')).body.data;
    assert.deepEqual(site.navbarAppearance, DEFAULTS);
    assert.equal(site.companyName, 'Kept Company Name');
    assert.equal(site.tagline, 'Kept tagline');
    const stored = await M.SiteSettings.findOne({ key: 'primary' }).lean();
    assert.equal(stored.navbarAppearance, undefined, 'the saved appearance is removed, not overwritten with copies of the defaults');
    assert.ok(await M.ActivityLog.findOne({ action: 'settings.navbar_appearance.reset' }).lean());
  });

  test('the admin settings response does not carry the navbar appearance or anything private into the public payload', async () => {
    const site = await api('GET', '/content/site-settings');
    for (const word of ['updatedAt', 'isDefault', 'defaults', '_id', 'archivedBy']) assert.ok(!JSON.stringify(site.body.data.navbarAppearance).includes(word), word);
  });
});
