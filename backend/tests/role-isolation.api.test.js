/**
 * Role isolation, carrier approval and email-verification gating, against a live MongoDB-compatible server.
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27017/hashimi_roles_test node --test tests/role-isolation.api.test.js
 *
 * The database name MUST end in "_test" (the suite drops it); without MONGO_TEST_URI every test is skipped, never passed.
 * Every administrative route is discovered from the real routers and probed as a guest, a customer and a carrier.
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
    JWT_SECRET: 'api-test-secret-api-test-secret-api-test-1234',
    CLIENT_URL: 'http://localhost:5173',
    AUTH_RATE_LIMIT_MAX: '100000',
    GLOBAL_RATE_LIMIT_MAX: '100000',
    LOGIN_ACCOUNT_LIMIT_MAX: '100000',
    QUOTE_IP_LIMIT_MAX: '100000',
    RESET_EMAIL_LIMIT_MAX: '100000',
  });
}

const PASS = 'long-enough-pass-phrase-1';
const SOME_ID = '000000000000000000000001';

describe('role isolation, carrier approval and verification gating', { skip: skipReason }, () => {
  let mongoose;
  let app;
  let server;
  let baseUrl;
  let M;
  let hashPassword;
  const S = {}; // session cookies
  const ID = {};

  const call = async (method, path, { body, cookie } = {}) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    const text = await response.text();
    const setCookie = response.headers.get('set-cookie');
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { status: response.status, body: json, text, cookie: setCookie ? setCookie.split(';')[0] : null };
  };
  const v1 = (method, path, options) => call(method, `/api/v1${path}`, options);

  const register = (kind, email, key) =>
    v1('POST', `/auth/register/${kind}`, { body: { firstName: 'Test', lastName: key, companyName: `${key} Co`, email, password: PASS, passwordConfirmation: PASS } });
  const quote = () => ({
    origin: { city: 'Chicago', state: 'IL', zipCode: '60601', country: 'US' },
    destination: { city: 'Dallas', state: 'TX', country: 'US' },
    pickupDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    equipmentType: 'Dry Van', commodity: 'Packaged goods', weight: { value: 8000, unit: 'lb' }, quantity: 12, pallets: 6,
    specialInstructions: 'Dock appointment required.', contactInformation: { name: 'Casey A', email: 'dock@example.com', phone: '312-555-0100' },
  });

  before(async () => {
    const database = await import('../src/config/database.js');
    ({ default: mongoose } = await import('mongoose'));
    ({ default: app } = await import('../src/app.js'));
    M = await import('../src/models/index.js');
    ({ hashPassword } = await import('../src/services/password.service.js'));
    await database.connectDatabase();
    await mongoose.connection.dropDatabase();
    await Promise.allSettled(Object.values(M.models).map((Model) => Model.init()));
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Super Admin (created directly: there is no public way to make one).
    ID.admin = (await M.User.create({ firstName: 'Root', lastName: 'Admin', email: 'root@example.com', role: 'super_admin', isEmailVerified: true, passwordHash: await hashPassword(PASS) }))._id;
    S.admin = (await v1('POST', '/auth/admin/login', { body: { email: 'root@example.com', password: PASS } })).cookie;

    for (const [key, kind, email] of [['custA', 'customer', 'a.customer@example.com'], ['custB', 'customer', 'b.customer@example.com'], ['custU', 'customer', 'u.customer@example.com'], ['carrP', 'carrier', 'p.carrier@example.com'], ['carrQ', 'carrier', 'q.carrier@example.com']]) {
      const response = await register(kind, email, key);
      assert.equal(response.status, 201, `${key} registered`);
      S[key] = response.cookie;
      ID[key] = response.body.data.user.id ?? response.body.data.user._id;
    }
    // Customers A and B have confirmed their email; custU has not. Carrier P stays pending; carrier Q is the one the admin will act on.
    await M.User.updateMany({ email: { $in: ['a.customer@example.com', 'b.customer@example.com', 'p.carrier@example.com', 'q.carrier@example.com'] } }, { isEmailVerified: true });
    ID.carrierPDoc = (await M.Carrier.findOne({ userId: ID.carrP }))._id;
    ID.carrierQDoc = (await M.Carrier.findOne({ userId: ID.carrQ }))._id;
  });

  after(async () => {
    server.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  const refused = (response, label) => assert.ok([401, 403].includes(response.status), `${label}: expected 401/403, got ${response.status}`);

  describe('every Super Admin route, discovered from the real routers', () => {
    const MOUNTS = [
      ['/admin/cms', '../src/cms/cms.routes.js'],
      ['/admin', '../src/admin/admin.routes.js'],
      ['/operations', '../src/operations/operations.routes.js'],
      ['/finance', '../src/finance/finance.routes.js'],
    ];
    let probes;

    before(async () => {
      probes = [];
      for (const [mount, file] of MOUNTS) {
        const { default: router } = await import(file);
        for (const layer of router.stack.filter((item) => item.route)) {
          const path = layer.route.path.replace(/:[A-Za-z]+/g, SOME_ID);
          for (const method of Object.keys(layer.route.methods).filter((name) => name !== '_all')) probes.push({ method: method.toUpperCase(), url: `/api/v1${mount}${path === '/' ? '' : path}` });
        }
      }
    });

    test('the sweep really covers a large set of routes (admin, CMS, operations and finance)', () => {
      assert.ok(probes.length > 100, `only ${probes.length} routes discovered`);
      for (const prefix of ['/api/v1/admin/cms', '/api/v1/admin/carriers', '/api/v1/operations', '/api/v1/finance']) assert.ok(probes.some((probe) => probe.url.startsWith(prefix)), prefix);
      assert.ok(probes.some((probe) => probe.method !== 'GET'), 'write routes are included');
    });

    test('a guest gets 401 on all of them', async () => {
      for (const probe of probes) {
        const response = await call(probe.method, probe.url, { body: probe.method === 'GET' ? undefined : {} });
        assert.equal(response.status, 401, `${probe.method} ${probe.url}`);
      }
    });

    for (const who of ['custA', 'carrP']) {
      test(`${who === 'custA' ? 'a customer' : 'a carrier'} gets 403 on all of them, with no data in the response`, async () => {
        for (const probe of probes) {
          const response = await call(probe.method, probe.url, { cookie: S[who], body: probe.method === 'GET' ? undefined : {} });
          assert.equal(response.status, 403, `${probe.method} ${probe.url}`);
          assert.equal(response.body?.data, undefined, `${probe.method} ${probe.url} returned data`);
        }
      });
    }

    test('the Super Admin gets through the guard on every read route (nothing is 401 or 403)', async () => {
      for (const probe of probes.filter((item) => item.method === 'GET')) {
        const response = await call('GET', probe.url, { cookie: S.admin });
        assert.ok(![401, 403].includes(response.status), `GET ${probe.url} -> ${response.status}`);
      }
    });

    test('alternate spellings of an admin path cannot bypass the guard (case, trailing slash, encoding, dot segments, double slash)', async () => {
      const variants = ['/api/v1/ADMIN/customers', '/api/v1/Admin/carriers/', '/api/v1/admin//customers', '/api/v1/%61dmin/customers', '/api/v1/admin/./customers', '/api/v1/admin/cms/../customers', '/api/v1/OPERATIONS/loads', '/api/v1/finance/summary/', '/api/V1/admin/customers', '/api/v1/admin/customers%2F', '/api/v1/admin/customers;x=1'];
      for (const url of variants) {
        for (const who of [null, 'custA', 'carrP']) {
          const response = await call('GET', url, { cookie: who ? S[who] : undefined });
          assert.ok(response.status !== 200, `${who ?? 'guest'} ${url} -> ${response.status}`);
          assert.equal(response.body?.data?.items, undefined, `${who ?? 'guest'} ${url} leaked a list`);
        }
      }
    });

    test('the other role-gated areas also refuse the wrong role', async () => {
      refused(await v1('GET', '/customer/dashboard', { cookie: S.carrP }), 'carrier -> customer dashboard');
      refused(await v1('GET', '/carrier/dashboard', { cookie: S.custA }), 'customer -> carrier dashboard');
      refused(await v1('GET', '/carrier/account-status', { cookie: S.custA }), 'customer -> carrier status');
      refused(await v1('POST', '/customer/quotes', { cookie: S.carrP, body: quote() }), 'carrier -> create quote');
      refused(await v1('GET', '/customer/dashboard', { cookie: S.admin }), 'admin -> customer dashboard');
      refused(await v1('GET', '/carrier/dashboard', { cookie: S.admin }), 'admin -> carrier dashboard');
      for (const path of ['/users', '/customers', '/carriers', '/media']) {
        for (const who of ['custA', 'carrP']) assert.equal((await v1('GET', path, { cookie: S[who] })).status, 403, `${who} ${path}`);
      }
    });
  });

  describe('sign-in restrictions per portal', () => {
    const login = (email, portal) => v1('POST', '/auth/login', { body: { email, password: PASS, ...(portal ? { portal } : {}) } });

    test('customer portal accepts only customers; carrier portal accepts only carriers; neither accepts the Super Admin', async () => {
      assert.equal((await login('a.customer@example.com', 'customer')).status, 200);
      assert.equal((await login('p.carrier@example.com', 'carrier')).status, 200);
      for (const [email, portal] of [['p.carrier@example.com', 'customer'], ['a.customer@example.com', 'carrier'], ['root@example.com', 'customer'], ['root@example.com', 'carrier'], ['root@example.com', undefined]]) {
        const response = await login(email, portal);
        assert.equal(response.status, 401, `${email} at ${portal ?? 'shared'} page`);
        assert.equal(response.cookie, null);
      }
    });

    test('the admin sign-in accepts only the Super Admin', async () => {
      for (const email of ['a.customer@example.com', 'p.carrier@example.com']) {
        const response = await v1('POST', '/auth/admin/login', { body: { email, password: PASS } });
        assert.equal(response.status, 401, email);
        assert.equal(response.cookie, null);
      }
      assert.equal((await v1('POST', '/auth/admin/login', { body: { email: 'root@example.com', password: PASS } })).status, 200);
    });

    test('there is no public way to register a Super Admin, and role fields in registration are refused', async () => {
      for (const kind of ['admin', 'super_admin', 'superadmin', 'staff']) {
        const response = await v1('POST', `/auth/register/${kind}`, { body: { firstName: 'A', lastName: 'B', companyName: 'C', email: `x.${kind}@example.com`, password: PASS, passwordConfirmation: PASS } });
        assert.equal(response.status, 404, kind);
      }
      for (const extra of [{ role: 'super_admin' }, { accountType: 'super_admin' }, { isAdmin: true }, { status: 'active' }, { authorityStatus: 'active' }]) {
        const response = await v1('POST', '/auth/register/carrier', { body: { firstName: 'A', lastName: 'B', companyName: 'C', email: 'sneaky@example.com', password: PASS, passwordConfirmation: PASS, ...extra } });
        assert.equal(response.status, 422, JSON.stringify(extra));
      }
      assert.equal(await M.User.countDocuments({ email: 'sneaky@example.com' }), 0);
      assert.equal(await M.User.countDocuments({ role: 'super_admin' }), 1);
    });
  });

  describe('no self-promotion and no self-approval', () => {
    test('customers and carriers cannot change their role, verification or approval fields through their profile', async () => {
      const attempts = [{ role: 'super_admin' }, { accountType: 'super_admin' }, { isActive: true }, { isEmailVerified: true }, { status: 'active' }, { authorityStatus: 'active' }, { complianceStatus: 'approved' }, { approvalStatus: 'approved' }, { userId: String(ID.admin) }];
      for (const who of ['custA', 'carrP']) {
        for (const extra of attempts) {
          const response = await v1('PATCH', `/${who.startsWith('cust') ? 'customer' : 'carrier'}/profile`, { cookie: S[who], body: { firstName: 'Same', ...extra } });
          assert.equal(response.status, 422, `${who} ${JSON.stringify(extra)}`);
        }
      }
      assert.equal((await M.User.findById(ID.custA)).role, 'customer');
      assert.equal((await M.User.findById(ID.carrP)).role, 'carrier');
      const carrier = await M.Carrier.findById(ID.carrierPDoc);
      assert.deepEqual([carrier.status, carrier.authorityStatus, carrier.complianceStatus], ['pending', 'pending', 'pending']);
    });

    test('a carrier cannot approve itself or another carrier, and a customer cannot approve anyone', async () => {
      for (const who of ['carrP', 'custA']) {
        for (const action of ['approve', 'reject', 'suspend', 'reactivate']) {
          for (const target of [ID.carrierPDoc, ID.carrierQDoc]) {
            const response = await v1('POST', `/admin/carriers/${target}/${action}`, { cookie: S[who], body: action === 'reject' ? { reason: 'no' } : {} });
            assert.equal(response.status, 403, `${who} ${action} ${target}`);
          }
        }
        assert.equal((await v1('POST', `/admin/carrier-applications/${SOME_ID}/decision`, { cookie: S[who], body: { decision: 'approved' } })).status, 403);
      }
      for (const id of [ID.carrierPDoc, ID.carrierQDoc]) {
        const carrier = await M.Carrier.findById(id);
        assert.deepEqual([carrier.status, carrier.authorityStatus, carrier.complianceStatus], ['pending', 'pending', 'pending']);
      }
    });

    test('a customer cannot read another customer’s private record (404, not 403), and cannot change it', async () => {
      const created = await v1('POST', '/customer/quotes', { cookie: S.custA, body: quote() });
      assert.equal(created.status, 201);
      const quoteId = created.body.data.quote.id ?? created.body.data.quote._id;
      assert.equal((await v1('GET', `/customer/quotes/${quoteId}`, { cookie: S.custA })).status, 200);
      assert.equal((await v1('GET', `/customer/quotes/${quoteId}`, { cookie: S.custB })).status, 404);
      assert.equal((await v1('POST', `/customer/quotes/${quoteId}/decline`, { cookie: S.custB, body: {} })).status, 404);
      assert.equal((await v1('GET', '/customer/quotes', { cookie: S.custB })).body.data.items.length, 0, 'B sees none of A’s quotes');
    });
  });

  describe('customer email verification', () => {
    test('an unverified customer can sign in and read their dashboard, but cannot create or accept quotes until verified', async () => {
      assert.equal((await v1('GET', '/customer/dashboard', { cookie: S.custU })).status, 200);
      assert.equal((await v1('GET', '/customer/profile', { cookie: S.custU })).status, 200);
      const blocked = await v1('POST', '/customer/quotes', { cookie: S.custU, body: quote() });
      assert.equal(blocked.status, 403);
      assert.equal(blocked.body.code, 'EMAIL_NOT_VERIFIED');
      const accept = await v1('POST', `/customer/quotes/${SOME_ID}/accept`, { cookie: S.custU, body: {} });
      assert.equal(accept.status, 403);
      assert.equal(accept.body.code, 'EMAIL_NOT_VERIFIED');
      assert.equal(await M.QuoteRequest.countDocuments({ customerId: (await M.Customer.findOne({ userId: ID.custU }))._id }), 0);
    });

    test('verification cannot be granted from the request, but takes effect immediately once the account is verified', async () => {
      assert.equal((await v1('PATCH', '/customer/profile', { cookie: S.custU, body: { isEmailVerified: true } })).status, 422);
      assert.equal((await v1('POST', '/customer/quotes', { cookie: S.custU, body: { ...quote(), isEmailVerified: true } })).status, 403);
      await M.User.updateOne({ _id: ID.custU }, { isEmailVerified: true });
      assert.equal((await v1('POST', '/customer/quotes', { cookie: S.custU, body: quote() })).status, 201);
    });
  });

  describe('carrier approval workflow', () => {
    const status = (who) => v1('GET', '/carrier/account-status', { cookie: S[who] });
    const loadBoard = (who) => v1('GET', '/carrier/loads', { cookie: S[who] });

    test('a new carrier is pending: it can use its dashboard and profile, sees why, and the load board stays locked', async () => {
      assert.equal((await v1('GET', '/carrier/dashboard', { cookie: S.carrP })).status, 200);
      assert.equal((await v1('GET', '/carrier/profile', { cookie: S.carrP })).status, 200);
      const info = (await status('carrP')).body.data;
      assert.equal(info.approvalStatus, 'pending');
      assert.equal(info.canAccessLoadBoard, false);
      assert.match(info.message, /pending approval/);
      const board = (await loadBoard('carrP')).body.data;
      assert.deepEqual(board.items, []);
      assert.equal(board.eligibility.eligible, false);
      assert.equal((await v1('GET', `/carrier/loads/${SOME_ID}`, { cookie: S.carrP })).status, 404);
    });

    test('rejections need a reason, and invalid or forged bodies are refused before anything changes', async () => {
      assert.equal((await v1('POST', `/admin/carriers/${ID.carrierQDoc}/reject`, { cookie: S.admin, body: {} })).status, 422);
      assert.equal((await v1('POST', `/admin/carriers/${ID.carrierQDoc}/approve`, { cookie: S.admin, body: { status: 'active' } })).status, 422);
      assert.equal((await v1('POST', `/admin/carriers/not-an-id/approve`, { cookie: S.admin, body: {} })).status, 400);
      assert.equal((await v1('POST', `/admin/carriers/${SOME_ID}/approve`, { cookie: S.admin, body: {} })).status, 404);
      assert.equal((await status('carrQ')).body.data.approvalStatus, 'pending');
    });

    test('the Super Admin approves a pending carrier: status, board access and the audit log all follow', async () => {
      const response = await v1('POST', `/admin/carriers/${ID.carrierQDoc}/approve`, { cookie: S.admin, body: {} });
      assert.equal(response.status, 200);
      assert.equal(response.body.data.approvalStatus, 'approved');
      const info = (await status('carrQ')).body.data;
      assert.equal(info.approvalStatus, 'approved');
      assert.equal(info.canAccessLoadBoard, true);
      assert.equal((await loadBoard('carrQ')).body.data.eligibility.eligible, true);
      const log = await M.ActivityLog.findOne({ action: 'admin.carrier.approve', entityId: ID.carrierQDoc });
      assert.ok(log, 'the approval is audited');
      assert.equal(String(log.userId), String(ID.admin));
      assert.equal((await status('carrP')).body.data.approvalStatus, 'pending', 'another carrier is unaffected');
    });

    test('an approved carrier can use carrier features, but still nothing administrative', async () => {
      for (const path of ['/carrier/dashboard', '/carrier/profile', '/carrier/loads', '/carrier/my-loads', '/carrier/shipments', '/carrier/documents', '/carrier/payments']) {
        assert.equal((await v1('GET', path, { cookie: S.carrQ })).status, 200, path);
      }
      assert.equal((await v1('GET', '/admin/carriers', { cookie: S.carrQ })).status, 403);
      assert.equal((await v1('POST', `/admin/carriers/${ID.carrierPDoc}/approve`, { cookie: S.carrQ, body: {} })).status, 403);
    });

    test('approving an already approved carrier is refused as an invalid transition', async () => {
      const response = await v1('POST', `/admin/carriers/${ID.carrierQDoc}/approve`, { cookie: S.admin, body: {} });
      assert.equal(response.status, 409);
      assert.equal(response.body.code, 'INVALID_APPROVAL_TRANSITION');
    });

    test('suspended: portal data is blocked but the carrier can still see why; reactivation restores the approval', async () => {
      assert.equal((await v1('POST', `/admin/carriers/${ID.carrierQDoc}/suspend`, { cookie: S.admin, body: { reason: 'Insurance lapsed' } })).status, 200);
      assert.equal((await v1('GET', '/carrier/dashboard', { cookie: S.carrQ })).status, 403);
      assert.equal((await loadBoard('carrQ')).status, 403);
      const info = (await status('carrQ')).body.data;
      assert.equal(info.approvalStatus, 'suspended');
      assert.equal(info.canAccessLoadBoard, false);
      assert.equal((await v1('POST', `/admin/carriers/${ID.carrierQDoc}/reactivate`, { cookie: S.admin, body: {} })).status, 200);
      assert.equal((await status('carrQ')).body.data.approvalStatus, 'approved');
      assert.equal((await v1('GET', '/carrier/dashboard', { cookie: S.carrQ })).status, 200);
    });

    test('rejected: the carrier keeps a pending-style dashboard, is told it was not approved, and the board stays locked; it can be approved later', async () => {
      assert.equal((await v1('POST', `/admin/carriers/${ID.carrierQDoc}/reject`, { cookie: S.admin, body: { reason: 'Authority could not be verified' } })).status, 200);
      const info = (await status('carrQ')).body.data;
      assert.equal(info.approvalStatus, 'rejected');
      assert.match(info.message, /not approved/);
      assert.equal((await loadBoard('carrQ')).body.data.eligibility.eligible, false);
      const log = await M.ActivityLog.findOne({ action: 'admin.carrier.reject', entityId: ID.carrierQDoc });
      assert.equal(log.metadata.reason, 'Authority could not be verified');
      assert.equal((await v1('POST', `/admin/carriers/${ID.carrierQDoc}/approve`, { cookie: S.admin, body: {} })).status, 200);
      assert.equal((await status('carrQ')).body.data.approvalStatus, 'approved');
    });

    test('deactivated: an inactive carrier is blocked from portal data and reported as deactivated; a deactivated login is refused and live sessions end', async () => {
      await M.Carrier.updateOne({ _id: ID.carrierQDoc }, { status: 'inactive' });
      assert.equal((await v1('GET', '/carrier/dashboard', { cookie: S.carrQ })).status, 403);
      assert.equal((await status('carrQ')).body.data.approvalStatus, 'deactivated');
      assert.equal((await v1('POST', `/admin/carriers/${ID.carrierQDoc}/reactivate`, { cookie: S.admin, body: {} })).status, 200);
      await M.User.updateOne({ _id: ID.carrQ }, { isActive: false });
      assert.equal((await v1('GET', '/carrier/dashboard', { cookie: S.carrQ })).status, 401, 'the live session ended');
      const login = await v1('POST', '/auth/login', { body: { email: 'q.carrier@example.com', password: PASS, portal: 'carrier' } });
      assert.equal(login.status, 403);
      assert.equal(login.cookie, null);
      await M.User.updateOne({ _id: ID.carrQ }, { isActive: true });
    });

    test('carrier applications: only the Super Admin decides; a rejection needs a reason; a decision is final and audited', async () => {
      const application = await M.CarrierApplication.create({ companyName: 'Applicant Haulage', contactPerson: 'Appl Icant', email: 'apply@example.com', phone: '555-010-0000' });
      const decide = (cookie, body) => v1('POST', `/admin/carrier-applications/${application._id}/decision`, { cookie, body });
      assert.equal((await decide(S.custA, { decision: 'approved' })).status, 403);
      assert.equal((await decide(S.carrP, { decision: 'approved' })).status, 403);
      assert.equal((await decide(undefined, { decision: 'approved' })).status, 401);
      assert.equal((await decide(S.admin, { decision: 'rejected' })).status, 422);
      assert.equal((await decide(S.admin, { decision: 'pending' })).status, 422);
      assert.equal((await decide(S.admin, { decision: 'under_review' })).status, 200);
      const approved = await decide(S.admin, { decision: 'approved' });
      assert.equal(approved.status, 200);
      assert.equal(approved.body.data.status, 'approved');
      assert.equal((await decide(S.admin, { decision: 'rejected', rejectionReason: 'changed my mind' })).status, 409);
      const stored = await M.CarrierApplication.findById(application._id);
      assert.equal(String(stored.reviewedBy), String(ID.admin));
      assert.ok(await M.ActivityLog.findOne({ action: 'admin.carrier_application.approved', entityId: application._id }));
    });
  });
});
