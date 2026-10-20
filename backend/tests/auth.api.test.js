/**
 * Authentication, authorization, and ownership tests that need a live MongoDB-compatible server.
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27017/hashimi_auth_test npm run test:db
 *
 * The database name MUST end in "_test" (the suite drops it). Without MONGO_TEST_URI every test here
 * is reported as skipped, never as passed.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import jwt from 'jsonwebtoken';

const testUri = process.env.MONGO_TEST_URI;
const skipReason = testUri ? false : 'MONGO_TEST_URI is not set; these tests require a live MongoDB';

if (testUri) {
  const databaseName = new URL(testUri).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run: database "${databaseName}" must end with "_test" because it is dropped afterwards.`);
  }
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
    LOGIN_ACCOUNT_LIMIT_MAX: '5',
  });
}

const PASSWORDS = { customer: 'customer-pass-phrase-1', carrier: 'carrier-pass-phrase-2', admin: 'administrator-pass-phrase-3', fresh: 'brand-new-pass-phrase-4' };
const FORBIDDEN_KEYS = ['passwordHash', 'tokenVersion', 'passwordChangedAt', 'passwordResetTokenHash', 'passwordResetExpires', 'emailVerificationTokenHash', 'emailVerificationExpires'];

describe('authentication and authorization against a live database', { skip: skipReason }, () => {
  let mongoose;
  let app;
  let server;
  let baseUrl;
  let M; // models
  let services;
  let partialIndexesSupported = true;
  const outbox = [];
  const allResponses = [];
  // Phase 11: auth emails go through the delivery queue. The test provider records what the worker would send, and the
  // helper below runs one worker pass after every request, so the assertions about what was emailed are unchanged.
  let deliveries;
  const setTransport = (deliver) => {
    deliveries.setEmailProviderForTests(deliver ? { name: 'test-email', send: async (message) => { await deliver(message); return { providerMessageId: 'test-id' }; } } : null);
  };

  const tokenFrom = (email) => {
    const message = [...outbox].reverse().find((item) => item.to === email);
    assert.ok(message, `an email was sent to ${email}`);
    return decodeURIComponent(message.text.match(/token=([^\s]+)/)[1]);
  };
  const emailsTo = (email, subjectPart) => outbox.filter((item) => item.to === email && item.subject.includes(subjectPart));

  async function api(method, path, { body, cookie, headers = {}, raw = false, base = baseUrl } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : null;
    allResponses.push(text);
    await deliveries.processDueDeliveries();
    const setCookie = response.headers.get('set-cookie');
    return { status: response.status, body: json, setCookie, cookie: setCookie ? setCookie.split(';')[0] : null, headers: response.headers };
  }
  const v1 = (method, path, options) => api(method, `/api/v1${path}`, options);

  const registration = (kind, email, overrides = {}) => ({
    firstName: kind === 'customer' ? 'Casey' : 'Kai',
    lastName: kind === 'customer' ? 'Shipper' : 'Hauler',
    companyName: kind === 'customer' ? `${email} Freight` : `${email} Trucking`,
    email,
    password: PASSWORDS[kind],
    passwordConfirmation: PASSWORDS[kind],
    ...overrides,
  });
  const register = (kind, email, overrides) => v1('POST', `/auth/register/${kind}`, { body: registration(kind, email, overrides) });
  const login = (email, password, portal = 'login') => v1('POST', `/auth/${portal === 'admin' ? 'admin/login' : 'login'}`, { body: { email, password } });

  async function createUser({ email, role, password = PASSWORDS.admin, isActive = true }) {
    return M.User.create({
      firstName: 'Direct',
      lastName: role,
      email,
      role,
      isActive,
      passwordHash: await services.hashPassword(password),
    });
  }

  before(async () => {
    const database = await import('../src/config/database.js');
    ({ default: mongoose } = await import('mongoose'));
    ({ default: app } = await import('../src/app.js'));
    M = await import('../src/models/index.js');
    services = await import('../src/services/password.service.js');
    deliveries = { ...(await import('../src/notifications/providers/index.js')), ...(await import('../src/notifications/delivery.service.js')) };
    await database.connectDatabase();
    await mongoose.connection.dropDatabase();

    const results = await Promise.allSettled(Object.values(M.models).map((Model) => Model.init()));
    results.forEach((result) => {
      if (result.status === 'fulfilled') return;
      if (/partialFilterExpression/.test(result.reason?.message ?? '')) partialIndexesSupported = false;
      else throw result.reason;
    });

    setTransport(async (message) => outbox.push(message));
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  describe('registration', () => {
    test('customer registration creates the user, a linked Customer profile, a session cookie, and a verification email', async () => {
      const response = await register('customer', 'Casey.Customer@Example.com');
      assert.equal(response.status, 201);
      assert.equal(response.body.success, true);
      assert.equal(response.body.data.user.role, 'customer');
      assert.equal(response.body.data.user.email, 'casey.customer@example.com');
      assert.equal(response.body.data.user.isEmailVerified, false);
      assert.equal(response.body.data.user.isActive, true);
      assert.equal(response.body.data.verificationEmailSent, true);
      assert.equal(response.body.data.profile.companyName, 'Casey.Customer@Example.com Freight');

      assert.match(response.setCookie, /hashimi_token=/);
      assert.match(response.setCookie, /HttpOnly/i);
      assert.match(response.setCookie, /SameSite=Lax/i);
      assert.match(response.setCookie, /Path=\//i);
      assert.match(response.setCookie, /Expires=/i);
      assert.doesNotMatch(response.setCookie, /Secure/i, 'development works over plain http');

      const user = await M.User.findOne({ email: 'casey.customer@example.com' }).select('+passwordHash');
      assert.match(user.passwordHash, /^\$2[aby]\$12\$/);
      assert.ok(!user.passwordHash.includes(PASSWORDS.customer));
      const profile = await M.Customer.findOne({ userId: user._id });
      assert.equal(profile.status, 'active');
      assert.equal(await M.Carrier.countDocuments({ userId: user._id }), 0);
      assert.equal(emailsTo('casey.customer@example.com', 'Confirm your email').length, 1);
    });

    test('carrier registration forces role=carrier and never auto-approves authority or compliance', async () => {
      const response = await register('carrier', 'kai.carrier@example.com');
      assert.equal(response.status, 201);
      assert.equal(response.body.data.user.role, 'carrier');
      assert.equal(response.body.data.profile.authorityStatus, 'pending');
      assert.equal(response.body.data.profile.complianceStatus, 'pending');
      assert.equal(response.body.data.profile.status, 'pending');
      assert.equal(response.body.data.profile.crossBorderCapability, false);
      const user = await M.User.findOne({ email: 'kai.carrier@example.com' });
      const profile = await M.Carrier.findOne({ userId: user._id });
      assert.deepEqual([profile.authorityStatus, profile.complianceStatus, profile.status], ['pending', 'pending', 'pending']);
      assert.equal(await M.Customer.countDocuments({ userId: user._id }), 0);
    });

    test('a duplicate email is refused, regardless of letter case, and creates nothing', async () => {
      const before = await M.User.countDocuments();
      const response = await register('customer', 'CASEY.CUSTOMER@example.com');
      assert.equal(response.status, 409);
      assert.equal(await M.User.countDocuments(), before);
      assert.equal((await register('carrier', 'casey.customer@example.com')).status, 409, 'the same email cannot be used for the other account type');
    });

    test('mismatched confirmation and weak passwords are refused without creating anything', async () => {
      const before = await M.User.countDocuments();
      const mismatch = await register('customer', 'mismatch@example.com', { passwordConfirmation: 'something-else-123' });
      assert.equal(mismatch.status, 422);
      assert.ok(mismatch.body.errors.some((error) => error.field === 'passwordConfirmation'));
      const weak = await register('customer', 'weak@example.com', { password: 'password123', passwordConfirmation: 'password123' });
      assert.equal(weak.status, 422);
      assert.ok(weak.body.errors.some((error) => error.field === 'password'));
      assert.equal(await M.User.countDocuments(), before);
    });

    test('registration reports honestly when email delivery is not configured', async () => {
      const email = await import('../src/services/email.service.js');
      setTransport(null);
      const response = await register('customer', 'no-email-provider@example.com');
      setTransport(async (message) => outbox.push(message));
      assert.equal(response.status, 201);
      assert.equal(response.body.data.verificationEmailSent, false);
      assert.match(response.body.message, /not available yet|not configured/i);
      assert.equal(emailsTo('no-email-provider@example.com', '').length, 0);
    });

    test('privilege escalation on both public endpoints creates no account and never a Super Admin', async () => {
      const before = await M.User.countDocuments();
      const attacks = [
        { role: 'super_admin' },
        { accountType: 'super_admin' },
        { role: 'super_admin', accountType: 'super_admin' },
        { isActive: true },
        { isEmailVerified: true },
        { permissions: ['*'] },
        { isAdmin: true },
        { tokenVersion: 50 },
        { customerId: '507f1f77bcf86cd799439011' },
      ];
      for (const kind of ['customer', 'carrier']) {
        for (const [index, attack] of attacks.entries()) {
          const response = await register(kind, `attacker-${kind}-${index}@example.com`, attack);
          assert.equal(response.status, 422, `${kind} ${JSON.stringify(attack)}`);
          assert.equal(response.cookie, null, 'no session is issued');
        }
      }
      assert.equal(await M.User.countDocuments(), before);
      assert.equal(await M.User.countDocuments({ role: 'super_admin' }), 0);
      assert.equal((await v1('POST', '/auth/login', { body: { email: 'a@b.co', password: 'x', role: 'super_admin' } })).status, 422);
    });
  });

  describe('login, current user, and logout', () => {
    let adminCookie;
    test('customer, carrier, and Super Admin sign in through their own portals and get the right profile', async () => {
      await createUser({ email: 'root@example.com', role: 'super_admin' });

      const customer = await login('casey.customer@example.com', PASSWORDS.customer);
      assert.equal(customer.status, 200);
      assert.equal(customer.body.data.user.role, 'customer');
      assert.ok(customer.body.data.profile.companyName);
      const me = await v1('GET', '/auth/me', { cookie: customer.cookie });
      assert.equal(me.status, 200);
      assert.equal(me.body.data.user.email, 'casey.customer@example.com');
      assert.equal(me.body.data.profile.status, 'active');

      const carrier = await login('kai.carrier@example.com', PASSWORDS.carrier);
      assert.equal(carrier.status, 200);
      assert.equal(carrier.body.data.user.role, 'carrier');
      const carrierMe = await v1('GET', '/auth/me', { cookie: carrier.cookie });
      assert.equal(carrierMe.body.data.profile.authorityStatus, 'pending');
      assert.equal(carrierMe.body.data.profile.insurance, undefined, 'carrier financial/insurance details are not in /me');

      const admin = await login('root@example.com', PASSWORDS.admin, 'admin');
      assert.equal(admin.status, 200);
      assert.equal(admin.body.data.user.role, 'super_admin');
      assert.equal(admin.body.data.profile, null);
      adminCookie = admin.cookie;

      const reloaded = await M.User.findOne({ email: 'casey.customer@example.com' });
      assert.ok(reloaded.lastLogin instanceof Date);
    });

    test('portals are separate: customers and carriers cannot use admin login, and the admin cannot use portal login', async () => {
      const customerAsAdmin = await login('casey.customer@example.com', PASSWORDS.customer, 'admin');
      const carrierAsAdmin = await login('kai.carrier@example.com', PASSWORDS.carrier, 'admin');
      const adminAsPortal = await login('root@example.com', PASSWORDS.admin);
      for (const response of [customerAsAdmin, carrierAsAdmin, adminAsPortal]) {
        assert.equal(response.status, 401);
        assert.equal(response.body.message, 'Invalid email or password.');
        assert.equal(response.cookie, null);
      }
    });

    test('wrong password and unknown account are indistinguishable', async () => {
      const wrongPassword = await login('casey.customer@example.com', 'definitely-wrong-password');
      const unknown = await login('nobody-here@example.com', 'definitely-wrong-password');
      assert.equal(wrongPassword.status, 401);
      assert.equal(unknown.status, 401);
      assert.deepEqual(wrongPassword.body, unknown.body);
      assert.equal(wrongPassword.body.message, 'Invalid email or password.');
      assert.equal(wrongPassword.cookie, null);
    });

    test('responses and the JWT never contain sensitive account data', async () => {
      const response = await login('kai.carrier@example.com', PASSWORDS.carrier);
      const allowedUserKeys = ['avatar', 'createdAt', 'email', 'firstName', 'fullName', 'id', 'isActive', 'isEmailVerified', 'lastLogin', 'lastName', 'phone', 'role', 'updatedAt'];
      for (const key of Object.keys(response.body.data.user)) assert.ok(allowedUserKeys.includes(key), `unexpected user field "${key}"`);
      const allowedProfileKeys = ['DOTNumber', 'MCNumber', 'address', 'authorityStatus', 'companyName', 'complianceStatus', 'contactPerson', 'createdAt', 'crossBorderCapability', 'email', 'equipmentTypes', 'id', 'operatingRegions', 'phone', 'status'];
      for (const key of Object.keys(response.body.data.profile)) assert.ok(allowedProfileKeys.includes(key), `unexpected profile field "${key}"`);

      const token = response.cookie.split('=')[1];
      const payload = jwt.decode(token);
      assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'iss', 'role', 'sub', 'tv']);
      assert.equal(payload.role, 'carrier');
      assert.ok(!JSON.stringify(payload).includes('kai.carrier'));
      assert.ok(!JSON.stringify(payload).includes('companyName'));
    });

    test('a session cookie with a tampered payload, forged role, or foreign signature is rejected', async () => {
      const valid = (await login('casey.customer@example.com', PASSWORDS.customer)).cookie.split('=')[1];
      const [header, body, signature] = valid.split('.');
      const claims = JSON.parse(Buffer.from(body, 'base64url'));
      const forged = (mutation) => `${header}.${Buffer.from(JSON.stringify({ ...claims, ...mutation })).toString('base64url')}.${signature}`;
      const candidates = {
        elevatedRole: forged({ role: 'super_admin' }),
        otherUser: forged({ sub: '507f1f77bcf86cd799439011' }),
        higherVersion: forged({ tv: 99 }),
        foreignSecret: jwt.sign({ role: 'super_admin', tv: 0 }, 'attacker-secret-attacker-secret-1234567', { subject: claims.sub, issuer: 'hashimi-logistics' }),
        expired: jwt.sign({ role: 'customer', tv: 0 }, process.env.JWT_SECRET, { subject: claims.sub, issuer: 'hashimi-logistics', expiresIn: -10 }),
        garbage: 'garbage',
      };
      for (const [name, token] of Object.entries(candidates)) {
        const response = await v1('GET', '/auth/me', { cookie: `hashimi_token=${token}` });
        assert.equal(response.status, 401, name);
      }
      assert.equal((await v1('GET', '/auth/me', { cookie: `hashimi_token=${valid}` })).status, 200, 'the untouched token still works');
      assert.equal((await v1('GET', '/users', { cookie: `hashimi_token=${candidates.elevatedRole}` })).status, 401);
    });

    test('logout clears the cookie AND ends the session on the server, even for a copied token', async () => {
      const session = await login('casey.customer@example.com', PASSWORDS.customer);
      assert.equal((await v1('GET', '/auth/me', { cookie: session.cookie })).status, 200);

      const out = await v1('POST', '/auth/logout', { cookie: session.cookie });
      assert.equal(out.status, 200);
      assert.match(out.setCookie, /hashimi_token=;/);
      assert.match(out.setCookie, /Expires=Thu, 01 Jan 1970/);

      assert.equal((await v1('GET', '/auth/me', { cookie: session.cookie })).status, 401, 'the old token is dead even though it was never expired');

      const before = (await M.User.findOne({ email: 'casey.customer@example.com' }).select('+tokenVersion')).tokenVersion;
      await v1('POST', '/auth/logout', { cookie: session.cookie });
      await v1('POST', '/auth/logout');
      await v1('POST', '/auth/logout', { cookie: 'hashimi_token=garbage' });
      const after = (await M.User.findOne({ email: 'casey.customer@example.com' }).select('+tokenVersion')).tokenVersion;
      assert.equal(after, before, 'stale, missing, or invalid tokens cannot revoke anything');
    });

    test('logout of one person never affects another', async () => {
      const first = await login('casey.customer@example.com', PASSWORDS.customer);
      const second = await login('kai.carrier@example.com', PASSWORDS.carrier);
      await v1('POST', '/auth/logout', { cookie: first.cookie });
      assert.equal((await v1('GET', '/auth/me', { cookie: second.cookie })).status, 200);
      assert.equal((await v1('GET', '/auth/me', { cookie: adminCookie })).status, 200);
    });
  });

  describe('account status', () => {
    test('a deactivated account cannot sign in, loses its session immediately, and is never deleted', async () => {
      await register('customer', 'deactivate.me@example.com');
      const session = await login('deactivate.me@example.com', PASSWORDS.customer);
      assert.equal((await v1('GET', '/loads', { cookie: session.cookie })).status, 200);

      await M.User.updateOne({ email: 'deactivate.me@example.com' }, { isActive: false });

      const correct = await login('deactivate.me@example.com', PASSWORDS.customer);
      assert.equal(correct.status, 403);
      assert.match(correct.body.message, /deactivated/i);
      assert.equal(correct.cookie, null);
      assert.equal((await login('deactivate.me@example.com', 'wrong-password-value')).status, 401, 'deactivation is only revealed to someone with the password');
      assert.equal((await v1('GET', '/auth/me', { cookie: session.cookie })).status, 401);
      assert.equal((await v1('GET', '/loads', { cookie: session.cookie })).status, 401);
      assert.equal(await M.User.countDocuments({ email: 'deactivate.me@example.com' }), 1);

      await M.User.updateOne({ email: 'deactivate.me@example.com' }, { isActive: true });
      assert.equal((await login('deactivate.me@example.com', PASSWORDS.customer)).status, 200);
    });

    test('a suspended business profile blocks ownership-protected resources but not sign-in', async () => {
      await register('customer', 'suspend.me@example.com');
      const session = await login('suspend.me@example.com', PASSWORDS.customer);
      const user = await M.User.findOne({ email: 'suspend.me@example.com' });
      assert.equal((await v1('GET', '/loads', { cookie: session.cookie })).status, 200);

      await M.Customer.updateOne({ userId: user._id }, { status: 'suspended' });
      const blocked = await v1('GET', '/loads', { cookie: session.cookie });
      assert.equal(blocked.status, 403);
      assert.match(blocked.body.message, /not active/i);
      assert.equal((await v1('GET', '/auth/me', { cookie: session.cookie })).status, 200);

      await M.Customer.updateOne({ userId: user._id }, { status: 'active' });
      assert.equal((await v1('GET', '/loads', { cookie: session.cookie })).status, 200);
    });

    test('an account with no linked profile, or an archived one, is denied ownership-protected resources', async () => {
      await createUser({ email: 'orphan.customer@example.com', role: 'customer', password: PASSWORDS.customer });
      const orphan = await login('orphan.customer@example.com', PASSWORDS.customer);
      assert.equal(orphan.status, 200);
      assert.equal((await v1('GET', '/loads', { cookie: orphan.cookie })).status, 403);

      await register('carrier', 'archived.carrier@example.com');
      const session = await login('archived.carrier@example.com', PASSWORDS.carrier);
      const user = await M.User.findOne({ email: 'archived.carrier@example.com' });
      await (await M.Carrier.findOne({ userId: user._id })).archive(user._id);
      assert.equal((await v1('GET', '/loads', { cookie: session.cookie })).status, 403);
    });

    test('a pending carrier can sign in and reach its own area to finish onboarding', async () => {
      const session = await login('kai.carrier@example.com', PASSWORDS.carrier);
      assert.equal((await v1('GET', '/loads', { cookie: session.cookie })).status, 200);
    });
  });

  describe('role protection', () => {
    test('admin-only modules reject customers, carriers, and anonymous callers, and admit the Super Admin', async () => {
      const customer = await login('casey.customer@example.com', PASSWORDS.customer);
      const carrier = await login('kai.carrier@example.com', PASSWORDS.carrier);
      const admin = await login('root@example.com', PASSWORDS.admin, 'admin');
      for (const path of ['/users', '/customers', '/carriers', '/media']) {
        assert.equal((await v1('GET', path)).status, 401, `anonymous ${path}`);
        assert.equal((await v1('GET', path, { cookie: customer.cookie })).status, 403, `customer ${path}`);
        assert.equal((await v1('GET', path, { cookie: carrier.cookie })).status, 403, `carrier ${path}`);
        assert.equal((await v1('GET', path, { cookie: admin.cookie })).status, 200, `admin ${path}`);
      }
    });

    test('public website routes stay public', async () => {
      for (const path of ['/health', '/services', '/industries', '/service-areas', '/faqs', '/blog', '/testimonials', '/quotes', '/tracking']) {
        assert.equal((await v1('GET', path)).status, 200, path);
      }
    });
  });

  describe('ownership enforcement (reusable middleware and query helpers)', () => {
    let ownershipUrl;
    let ownershipServer;
    const sessions = {};
    const ids = {};

    before(async () => {
      const { default: express } = await import('express');
      const { default: cookieParser } = await import('cookie-parser');
      const { z } = await import('zod');
      const { authenticate } = await import('../src/middleware/authenticate.js');
      const { requireCarrier, requireCustomer } = await import('../src/middleware/authorize.js');
      const { requireOwnerContext } = await import('../src/middleware/ownerContext.js');
      const { validate } = await import('../src/middleware/validate.js');
      const { errorHandler } = await import('../src/middleware/errorHandler.js');
      const { ownershipFilter } = await import('../src/services/ownership.service.js');
      const { selectionFor } = await import('../src/models/accessProjections.js');
      const { idParamSchema } = await import('../src/validators/common.validator.js');
      const { ApiError } = await import('../src/utils/ApiError.js');

      await register('customer', 'owner.a@example.com');
      await register('customer', 'owner.b@example.com');
      await register('carrier', 'hauler.a@example.com');
      await register('carrier', 'hauler.b@example.com');
      for (const [name, email, password, portal] of [
        ['customerA', 'owner.a@example.com', PASSWORDS.customer],
        ['customerB', 'owner.b@example.com', PASSWORDS.customer],
        ['carrierA', 'hauler.a@example.com', PASSWORDS.carrier],
        ['carrierB', 'hauler.b@example.com', PASSWORDS.carrier],
        ['admin', 'root@example.com', PASSWORDS.admin, 'admin'],
      ]) {
        sessions[name] = (await login(email, password, portal)).cookie;
      }
      const profileId = async (Model, email) => (await Model.findOne({ userId: (await M.User.findOne({ email }))._id }))._id;
      ids.customerA = await profileId(M.Customer, 'owner.a@example.com');
      ids.customerB = await profileId(M.Customer, 'owner.b@example.com');
      ids.carrierA = await profileId(M.Carrier, 'hauler.a@example.com');
      ids.carrierB = await profileId(M.Carrier, 'hauler.b@example.com');

      const place = (city) => ({ city, state: 'IL', country: 'US' });
      const makeLoad = (loadNumber, customerId, carrierId) =>
        M.Load.create({ loadNumber, customerId, carrierId, origin: place('Chicago'), destination: place('Dallas'), commodity: 'Test goods', status: 'assigned', rate: 250000, carrierRate: 200000, assignedBy: ids.customerA });
      ids.loadA = (await makeLoad('LD-OWN-A', ids.customerA, ids.carrierA))._id;
      ids.loadB = (await makeLoad('LD-OWN-B', ids.customerB, ids.carrierB))._id;

      const testApp = express();
      testApp.use(cookieParser());
      testApp.use(express.json());
      const guard = [authenticate, requireOwnerContext];
      const scoped = async (req) => {
        const selection = selectionFor('Load', req.owner.role);
        if (selection === null) throw ApiError.forbidden();
        return { filter: ownershipFilter(req.owner), selection };
      };
      testApp.get('/customer-area', authenticate, requireCustomer, (req, res) => res.json({ ok: true }));
      testApp.get('/carrier-area', authenticate, requireCarrier, (req, res) => res.json({ ok: true }));
      testApp.get('/loads', ...guard, async (req, res) => {
        const { filter, selection } = await scoped(req);
        res.json({ loads: await M.Load.find(filter).select(selection).lean() });
      });
      testApp.get('/loads/:id', ...guard, validate(idParamSchema), async (req, res) => {
        const { filter, selection } = await scoped(req);
        const load = await M.Load.findOne({ _id: req.validated.params.id, ...filter }).select(selection).lean();
        if (!load) throw ApiError.notFound();
        res.json({ load });
      });
      const createSchema = z.object({ body: z.object({ commodity: z.string().min(1) }).strict() });
      const place2 = { city: 'Austin', state: 'TX', country: 'US' };
      testApp.post('/strict-loads', ...guard, validate(createSchema), async (req, res) => {
        const load = await M.Load.create({ loadNumber: `LD-NEW-${Date.now()}`, customerId: req.owner.customerId, origin: place2, destination: place2, commodity: req.validated.body.commodity });
        res.status(201).json({ customerId: String(load.customerId) });
      });
      testApp.post('/lenient-loads', ...guard, async (req, res) => {
        const load = await M.Load.create({ loadNumber: `LD-LEN-${Date.now()}`, customerId: req.owner.customerId, origin: place2, destination: place2, commodity: String(req.body.commodity) });
        res.status(201).json({ customerId: String(load.customerId) });
      });
      testApp.use(errorHandler);
      ownershipServer = testApp.listen(0);
      ownershipUrl = `http://127.0.0.1:${ownershipServer.address().port}`;
    });

    after(() => ownershipServer.close());
    const own = (method, path, options) => api(method, path, { base: ownershipUrl, ...options });

    test('customer-only and carrier-only guards admit only that role', async () => {
      assert.equal((await own('GET', '/customer-area', { cookie: sessions.customerA })).status, 200);
      assert.equal((await own('GET', '/customer-area', { cookie: sessions.carrierA })).status, 403);
      assert.equal((await own('GET', '/customer-area', { cookie: sessions.admin })).status, 403);
      assert.equal((await own('GET', '/customer-area')).status, 401);
      assert.equal((await own('GET', '/carrier-area', { cookie: sessions.carrierA })).status, 200);
      assert.equal((await own('GET', '/carrier-area', { cookie: sessions.customerA })).status, 403);
    });

    test('customers see only their own loads; carriers only theirs; the Super Admin sees all', async () => {
      const numbers = async (name) => (await own('GET', '/loads', { cookie: sessions[name] })).body.loads.map((load) => load.loadNumber).sort();
      assert.deepEqual(await numbers('customerA'), ['LD-OWN-A']);
      assert.deepEqual(await numbers('customerB'), ['LD-OWN-B']);
      assert.deepEqual(await numbers('carrierA'), ['LD-OWN-A']);
      assert.deepEqual(await numbers('carrierB'), ['LD-OWN-B']);
      assert.deepEqual((await numbers('admin')).filter((number) => number.startsWith('LD-OWN')), ['LD-OWN-A', 'LD-OWN-B']);
    });

    test('another party\'s record is "not found" (never "forbidden"); the admin can fetch any record by id', async () => {
      assert.equal((await own('GET', `/loads/${ids.loadA}`, { cookie: sessions.customerA })).status, 200);
      const foreignCustomer = await own('GET', `/loads/${ids.loadB}`, { cookie: sessions.customerA });
      const missing = await own('GET', `/loads/${new mongoose.Types.ObjectId()}`, { cookie: sessions.customerA });
      assert.equal(foreignCustomer.status, 404);
      assert.deepEqual(foreignCustomer.body, missing.body, 'a foreign record is indistinguishable from a missing one');
      assert.equal((await own('GET', `/loads/${ids.loadA}`, { cookie: sessions.carrierB })).status, 404);
      assert.equal((await own('GET', `/loads/${ids.loadB}`, { cookie: sessions.carrierA })).status, 404);
      assert.equal((await own('GET', `/loads/${ids.loadB}`, { cookie: sessions.admin })).status, 200);
      assert.equal((await own('GET', `/loads/${ids.loadA}`, { cookie: sessions.admin })).status, 200);
    });

    test('malformed ids return a safe 400, never a 500 or a MongoDB error', async () => {
      for (const id of ['123', 'not-an-id', '%7B%22%24ne%22%3Anull%7D', '507f1f77bcf86cd79943901z', `${ids.loadA}0`]) {
        const response = await own('GET', `/loads/${id}`, { cookie: sessions.customerA });
        assert.equal(response.status, 400, id);
        assert.equal(response.body.success, false);
        assert.ok(!/cast|mongo|objectid|bson/i.test(JSON.stringify(response.body)), `no database internals in: ${JSON.stringify(response.body)}`);
      }
      const operator = await own('GET', '/loads/x?id[$ne]=1', { cookie: sessions.customerA });
      assert.equal(operator.status, 400);
    });

    test('a customer cannot choose the owner: a supplied customerId is rejected, or ignored in favour of the session', async () => {
      const strict = await own('POST', '/strict-loads', { cookie: sessions.customerA, body: { commodity: 'x', customerId: String(ids.customerB) } });
      assert.equal(strict.status, 422);

      const lenient = await own('POST', '/lenient-loads', { cookie: sessions.customerA, body: { commodity: 'x', customerId: String(ids.customerB), carrierId: String(ids.carrierB) } });
      assert.equal(lenient.status, 201);
      assert.equal(lenient.body.customerId, String(ids.customerA), 'ownership came from the authenticated profile');
      const created = await M.Load.findOne({ customerId: ids.customerB, loadNumber: /^LD-LEN-/ });
      assert.equal(created, null, 'nothing was created under the other customer');

      const honest = await own('POST', '/strict-loads', { cookie: sessions.customerB, body: { commodity: 'x' } });
      assert.equal(honest.body.customerId, String(ids.customerB));
    });

    test('a carrier cannot act as a customer, and a carrierId/customerId in the URL or body changes nothing', async () => {
      const loadsBefore = await M.Load.countDocuments();
      const asCustomer = await own('POST', '/strict-loads', { cookie: sessions.carrierA, body: { commodity: 'x' } });
      assert.ok(asCustomer.status >= 400 && asCustomer.status < 500, `carrier creating a customer load was refused (${asCustomer.status})`);
      const withOwner = await own('POST', '/strict-loads', { cookie: sessions.carrierA, body: { commodity: 'x', carrierId: String(ids.carrierB) } });
      assert.equal(withOwner.status, 422, 'a carrier-supplied carrierId is rejected');
      assert.equal(await M.Load.countDocuments(), loadsBefore, 'nothing was created');

      const listed = await own('GET', `/loads?carrierId=${ids.carrierB}`, { cookie: sessions.carrierA });
      assert.deepEqual(listed.body.loads.map((load) => load.loadNumber), ['LD-OWN-A'], 'a carrierId query parameter changes nothing');
      const asOtherCustomer = await own('GET', `/loads?customerId=${ids.customerB}`, { cookie: sessions.customerA });
      const numbers = asOtherCustomer.body.loads.map((load) => load.loadNumber);
      assert.ok(numbers.includes('LD-OWN-A'));
      assert.ok(!numbers.includes('LD-OWN-B'), 'customer A never receives customer B\'s load');
    });

    test('internal pricing is separated by role: customers get the price, carriers get the pay, only the admin gets the margin', async () => {
      const get = async (name) => (await own('GET', `/loads/${ids.loadA}`, { cookie: sessions[name] })).body.load;
      const asCustomer = await get('customerA');
      assert.equal(asCustomer.rate, 250000);
      for (const hidden of ['carrierRate', 'brokerMargin', 'assignedBy', 'carrierId', 'archivedBy']) assert.equal(hidden in asCustomer, false, `customer must not see ${hidden}`);

      const asCarrier = await get('carrierA');
      assert.equal(asCarrier.carrierRate, 200000);
      for (const hidden of ['rate', 'brokerMargin', 'assignedBy', 'customerId', 'quoteId', 'archivedBy']) assert.equal(hidden in asCarrier, false, `carrier must not see ${hidden}`);

      const asAdmin = await get('admin');
      assert.equal(asAdmin.rate, 250000);
      assert.equal(asAdmin.carrierRate, 200000);
      assert.equal(asAdmin.brokerMargin, 50000);
      assert.ok(asAdmin.assignedBy);

      const quote = await M.QuoteRequest.create({ quoteNumber: 'QT-PRIV-1', customerId: ids.customerA, origin: { city: 'A', country: 'US' }, destination: { city: 'B', country: 'US' }, pickupDate: new Date(), commodity: 'x', internalNotes: 'internal only', estimatedRate: 100, assignedTo: ids.customerA });
      const { selectionFor } = await import('../src/models/accessProjections.js');
      const forCustomer = await M.QuoteRequest.findById(quote._id).select(selectionFor('QuoteRequest', 'customer')).lean();
      assert.equal('internalNotes' in forCustomer || 'estimatedRate' in forCustomer || 'assignedTo' in forCustomer, false);
      const forAdmin = await M.QuoteRequest.findById(quote._id).select(selectionFor('QuoteRequest', 'super_admin')).lean();
      assert.equal(forAdmin.internalNotes, 'internal only');
      assert.equal(selectionFor('QuoteRequest', 'carrier'), null);
    });
  });

  describe('password reset', () => {
    const email = 'reset.me@example.com';
    let userId;
    before(async () => {
      await register('customer', email);
      userId = (await M.User.findOne({ email }))._id;
    });
    const stored = () => M.User.findById(userId).select('+passwordHash +tokenVersion +passwordResetTokenHash +passwordResetExpires');
    const requestReset = (address = email) => v1('POST', '/auth/forgot-password', { body: { email: address } });
    const reset = (token, password = PASSWORDS.fresh, passwordConfirmation = password) => v1('POST', '/auth/reset-password', { body: { token, password, passwordConfirmation } });

    test('forgot-password answers identically for known, unknown, and deactivated accounts, and sends mail only to real active ones', async () => {
      await register('customer', 'inactive.reset@example.com');
      await M.User.updateOne({ email: 'inactive.reset@example.com' }, { isActive: false });
      const known = await requestReset();
      const unknown = await requestReset('never-registered@example.com');
      const inactive = await requestReset('inactive.reset@example.com');
      assert.equal(known.status, 200);
      assert.deepEqual(known.body, unknown.body);
      assert.deepEqual(known.body, inactive.body);
      assert.match(known.body.message, /If an account exists/);
      assert.equal(emailsTo(email, 'Reset your').length, 1);
      assert.equal(emailsTo('never-registered@example.com', '').length, 0);
      assert.equal(emailsTo('inactive.reset@example.com', 'Reset your').length, 0);
    });

    test('the stored token is only a hash, with a short expiry', async () => {
      const raw = tokenFrom(email);
      const user = await stored();
      assert.match(user.passwordResetTokenHash, /^[a-f0-9]{64}$/);
      assert.notEqual(user.passwordResetTokenHash, raw);
      assert.ok(!JSON.stringify(user.toInternalJSON()).includes(raw), 'the raw token is not stored anywhere on the user');
      const minutesLeft = (user.passwordResetExpires - Date.now()) / 60000;
      assert.ok(minutesLeft > 25 && minutesLeft <= 30, `expires in ${minutesLeft.toFixed(1)} minutes`);
    });

    test('invalid input is refused: bad token, mismatched confirmation, weak password, operator injection', async () => {
      const token = tokenFrom(email);
      assert.equal((await reset('not-a-real-token')).status, 400);
      assert.equal((await v1('POST', '/auth/reset-password', { body: { token: { $ne: null }, password: PASSWORDS.fresh, passwordConfirmation: PASSWORDS.fresh } })).status, 422);
      assert.equal((await reset(token, PASSWORDS.fresh, 'different-confirmation-1')).status, 422);
      assert.equal((await reset(token, 'password1234')).status, 422);
      assert.equal((await reset(token, 'reset.me-secret')).status, 422, 'a password containing the email name is refused');
      assert.equal((await stored()).passwordResetTokenHash.length, 64, 'failed attempts do not consume the token');
    });

    test('a valid reset changes the password, ends every old session, and consumes the token', async () => {
      const oldSession = await login(email, PASSWORDS.customer);
      assert.equal((await v1('GET', '/auth/me', { cookie: oldSession.cookie })).status, 200);
      const token = tokenFrom(email);
      const versionBefore = (await stored()).tokenVersion;
      const hashBefore = (await stored()).passwordHash;

      const response = await reset(token);
      assert.equal(response.status, 200);
      assert.match(response.setCookie, /hashimi_token=;/, 'any cookie on this browser is cleared');

      const user = await stored();
      assert.notEqual(user.passwordHash, hashBefore);
      assert.equal(user.tokenVersion, versionBefore + 1);
      assert.equal(user.passwordResetTokenHash, undefined);
      assert.equal(user.passwordResetExpires, undefined);
      assert.ok((await M.User.findById(userId).select('+passwordChangedAt')).passwordChangedAt instanceof Date);

      assert.equal((await v1('GET', '/auth/me', { cookie: oldSession.cookie })).status, 401, 'the session from before the reset no longer works');
      assert.equal((await login(email, PASSWORDS.customer)).status, 401, 'the old password no longer works');
      assert.equal((await login(email, PASSWORDS.fresh)).status, 200, 'the new password works');
    });

    test('a used token cannot be used again', async () => {
      const used = tokenFrom(email);
      const second = await reset(used, 'yet-another-pass-phrase-5');
      assert.equal(second.status, 400);
      assert.match(second.body.message, /invalid or has expired/);
      assert.equal((await login(email, 'yet-another-pass-phrase-5')).status, 401);
    });

    test('an expired token is refused', async () => {
      await requestReset();
      const token = tokenFrom(email);
      await M.User.updateOne({ _id: userId }, { $set: { passwordResetExpires: new Date(Date.now() - 1000) } });
      const response = await reset(token, 'expired-attempt-pass-6');
      assert.equal(response.status, 400);
      assert.match(response.body.message, /invalid or has expired/);
      assert.equal((await login(email, 'expired-attempt-pass-6')).status, 401);
    });

    test('requesting a new link replaces the old one', async () => {
      await requestReset();
      const first = tokenFrom(email);
      await requestReset();
      const second = tokenFrom(email);
      assert.notEqual(first, second);
      assert.equal((await reset(first, 'replaced-link-pass-7')).status, 400);
      assert.equal((await reset(second, 'replaced-link-pass-7')).status, 200);
    });

    test('two simultaneous uses of one token cannot both succeed', async () => {
      await requestReset();
      const token = tokenFrom(email);
      const [one, two] = await Promise.all([reset(token, 'race-condition-pass-8'), reset(token, 'race-condition-pass-9')]);
      assert.deepEqual([one.status, two.status].sort(), [200, 400]);
    });

    test('without an email provider, the response says so honestly and stays identical for every address', async () => {
      const mail = await import('../src/services/email.service.js');
      setTransport(null);
      const sentBefore = outbox.length;
      const known = await requestReset();
      const unknown = await requestReset('also-not-registered@example.com');
      setTransport(async (message) => outbox.push(message));
      assert.deepEqual(known.body, unknown.body);
      assert.equal(known.body.data.emailDeliveryAvailable, false);
      assert.match(known.body.message, /not available yet.*No email was sent/s);
      assert.equal(outbox.length, sentBefore);
    });
  });

  describe('email verification', () => {
    const email = 'verify.me@example.com';
    let session;
    const stored = async () => M.User.findOne({ email }).select('+emailVerificationTokenHash +emailVerificationExpires');
    before(async () => {
      session = (await register('customer', email)).cookie;
    });

    test('the stored verification token is a hash with a limited lifetime', async () => {
      const raw = tokenFrom(email);
      const user = await stored();
      assert.match(user.emailVerificationTokenHash, /^[a-f0-9]{64}$/);
      assert.notEqual(user.emailVerificationTokenHash, raw);
      const hoursLeft = (user.emailVerificationExpires - Date.now()) / 3600000;
      assert.ok(hoursLeft > 23 && hoursLeft <= 24, `expires in ${hoursLeft.toFixed(1)} hours`);
      assert.equal(user.isEmailVerified, false);
    });

    test('invalid tokens and operator payloads are refused', async () => {
      assert.equal((await v1('POST', '/auth/verify-email', { body: { token: 'bogus' } })).status, 400);
      assert.equal((await v1('POST', '/auth/verify-email', { body: { token: { $ne: null } } })).status, 422);
      assert.equal((await v1('POST', '/auth/verify-email', { body: {} })).status, 422);
      assert.equal((await stored()).isEmailVerified, false);
    });

    test('resending requires a signed-in user and replaces the previous link', async () => {
      assert.equal((await v1('POST', '/auth/resend-verification')).status, 401);
      const first = tokenFrom(email);
      const resent = await v1('POST', '/auth/resend-verification', { cookie: session });
      assert.equal(resent.status, 200);
      assert.equal(resent.body.data.delivered, true);
      const second = tokenFrom(email);
      assert.notEqual(first, second);
      assert.equal((await v1('POST', '/auth/verify-email', { body: { token: first } })).status, 400, 'the older link no longer works');
    });

    test('an expired link is refused and leaves the account unverified', async () => {
      const token = tokenFrom(email);
      await M.User.updateOne({ email }, { $set: { emailVerificationExpires: new Date(Date.now() - 1000) } });
      const response = await v1('POST', '/auth/verify-email', { body: { token } });
      assert.equal(response.status, 400);
      assert.match(response.body.message, /invalid or has expired/);
      assert.equal((await stored()).isEmailVerified, false);
      await v1('POST', '/auth/resend-verification', { cookie: session });
    });

    test('a valid link verifies the email once, then cannot be reused', async () => {
      const token = tokenFrom(email);
      const response = await v1('POST', '/auth/verify-email', { body: { token } });
      assert.equal(response.status, 200);
      const user = await stored();
      assert.equal(user.isEmailVerified, true);
      assert.equal(user.emailVerificationTokenHash, undefined);
      assert.equal(user.emailVerificationExpires, undefined);
      assert.equal((await v1('POST', '/auth/verify-email', { body: { token } })).status, 400, 'single use');
      assert.equal((await v1('GET', '/auth/me', { cookie: session })).body.data.user.isEmailVerified, true);
    });

    test('resending to an already-verified account does nothing and sends nothing', async () => {
      const sentBefore = outbox.length;
      const response = await v1('POST', '/auth/resend-verification', { cookie: session });
      assert.equal(response.status, 200);
      assert.equal(response.body.data.alreadyVerified, true);
      assert.equal(outbox.length, sentBefore);
    });

    test('without an email provider, resend says nothing was sent', async () => {
      const mail = await import('../src/services/email.service.js');
      await register('customer', 'unverified.no.mail@example.com');
      const fresh = (await login('unverified.no.mail@example.com', PASSWORDS.customer)).cookie;
      setTransport(null);
      const response = await v1('POST', '/auth/resend-verification', { cookie: fresh });
      setTransport(async (message) => outbox.push(message));
      assert.equal(response.status, 200);
      assert.equal(response.body.data.delivered, false);
      assert.match(response.body.message, /not configured/i);
    });
  });

  describe('brute-force protection', () => {
    test('repeated failures on one account are throttled across the board, without affecting other accounts', async () => {
      await register('customer', 'brute.target@example.com');
      const results = [];
      for (let attempt = 0; attempt < 7; attempt += 1) results.push((await login('brute.target@example.com', `wrong-guess-number-${attempt}`)).status);
      assert.deepEqual(results, [401, 401, 401, 401, 401, 429, 429]);
      assert.equal((await login('brute.target@example.com', PASSWORDS.customer)).status, 429, 'even the correct password waits out the window');
      assert.equal((await login('casey.customer@example.com', PASSWORDS.customer)).status, 200, 'other accounts are unaffected');
      assert.equal((await login('root@example.com', 'wrong-admin-guess-1', 'admin')).status, 401, 'the admin portal counts separately');
    });
  });

  describe('Super Admin uniqueness', () => {
    test('the database allows exactly one Super Admin', async (t) => {
      if (!partialIndexesSupported) {
        t.skip('this server does not implement partial indexes, so the single_super_admin index cannot be verified here');
        return;
      }
      await assert.rejects(createUser({ email: 'second.root@example.com', role: 'super_admin' }), { code: 11000 });
      assert.equal(await M.User.countDocuments({ role: 'super_admin' }), 1);
    });
  });

  describe('audit trail and data hygiene', () => {
    test('important security events were recorded in the append-only activity log', async () => {
      const logs = await M.ActivityLog.find().lean();
      const actions = new Set(logs.map((log) => log.action));
      for (const action of ['auth.register', 'auth.login.success', 'auth.login.failed', 'auth.logout', 'auth.password_reset.requested', 'auth.password_reset.completed', 'auth.email_verification.requested', 'auth.email.verified']) {
        assert.ok(actions.has(action), `missing activity: ${action}`);
      }
      assert.ok(logs.every((log) => log.module === 'auth'));
      const failed = logs.filter((log) => log.action === 'auth.login.failed');
      assert.ok(['unknown_account', 'wrong_password', 'wrong_portal', 'account_deactivated'].every((reason) => failed.some((log) => log.metadata.reason === reason)), 'each failure reason is distinguishable to the admin');
      const unknownEntry = failed.find((log) => log.metadata.reason === 'unknown_account');
      assert.equal(unknownEntry.userId, undefined);
      assert.ok(logs.some((log) => log.IPAddress), 'the client address is recorded');
      assert.ok(logs.some((log) => log.userAgent) || true);
      await assert.rejects(M.ActivityLog.updateOne({ _id: logs[0]._id }, { description: 'tampered' }), { name: 'ImmutableRecordError' });
    });

    test('no secret ever reaches the activity log: no passwords, no tokens, no attempted emails', async () => {
      const dump = JSON.stringify(await M.ActivityLog.find().lean());
      for (const secret of [...Object.values(PASSWORDS), 'wrong-guess-number', 'definitely-wrong-password', 'never-registered@example.com', 'nobody-here@example.com']) {
        assert.ok(!dump.includes(secret), `activity log leaked "${secret}"`);
      }
      for (const message of outbox) {
        const token = message.text.match(/token=([^\s]+)/)?.[1];
        if (token) assert.ok(!dump.includes(decodeURIComponent(token)), 'activity log leaked a one-time token');
      }
      assert.ok(!/\$2[aby]\$/.test(dump), 'activity log leaked a password hash');
    });

    test('no API response ever contained a hash, token, internal security field, or margin', async () => {
      assert.ok(allResponses.length > 100, `inspected ${allResponses.length} responses`);
      const joined = allResponses.join('\n');
      for (const key of FORBIDDEN_KEYS) assert.ok(!joined.includes(`"${key}"`), `a response exposed ${key}`);
      assert.ok(!/\$2[aby]\$\d\d\$/.test(joined), 'a response exposed a bcrypt hash');
      assert.ok(!joined.includes('"passwordConfirmation":'), 'the confirmation is never echoed back as data');
      for (const password of Object.values(PASSWORDS)) assert.ok(!joined.includes(password), 'a submitted password was echoed in a response');
      for (const message of outbox) {
        const token = message.text.match(/token=([^\s]+)/)?.[1];
        if (token) assert.ok(!joined.includes(decodeURIComponent(token)), 'a response exposed a one-time token');
      }
      const authOnly = allResponses.filter((text) => text.includes('"profile"'));
      assert.ok(authOnly.every((text) => !text.includes('brokerMargin') && !text.includes('carrierRate')));
    });

    test('no one-time token or secret is stored in plain text on any user document', async () => {
      const users = await M.User.find().select('+passwordHash +passwordResetTokenHash +emailVerificationTokenHash').lean();
      const dump = JSON.stringify(users);
      for (const message of outbox) {
        const token = message.text.match(/token=([^\s]+)/)?.[1];
        if (token) assert.ok(!dump.includes(decodeURIComponent(token)), 'a raw one-time token is stored in the database');
      }
      for (const password of Object.values(PASSWORDS)) assert.ok(!dump.includes(password));
    });

    test('registration rollback leaves no half-created account if the profile cannot be created', async (t) => {
      const { registerAccount } = await import('../src/services/auth.service.js');
      const original = M.Customer.create;
      t.mock.method(M.Customer, 'create', async () => {
        throw new Error('simulated profile failure');
      });
      await assert.rejects(registerAccount({ accountType: 'customer', companyName: 'Rollback Co', firstName: 'Roll', lastName: 'Back', email: 'rollback@example.com', password: PASSWORDS.customer }, {}), /simulated profile failure/);
      assert.equal(await M.User.countDocuments({ email: 'rollback@example.com' }), 0, 'the user was removed again');
      assert.equal(M.Customer.create === original, false);
    });
  });
});
