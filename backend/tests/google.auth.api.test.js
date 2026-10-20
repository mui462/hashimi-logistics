/**
 * Google Sign-In and portal-aware sign-in, against a live MongoDB-compatible server.
 *
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27017/hashimi_google_auth_test node --test tests/google.auth.api.test.js
 *
 * The database name MUST end in "_test" (the suite drops it); without MONGO_TEST_URI every test is skipped, never passed.
 *
 * The Google provider is MOCKED: ID tokens are signed with a throw-away RSA key and Google's key endpoint is replaced by that
 * key. The real verification code (signature, issuer, audience, expiry, verified email) and every account rule run unchanged,
 * but no request is made to Google, so this is not an end-to-end OAuth test.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import jwt from 'jsonwebtoken';

const testUri = process.env.MONGO_TEST_URI;
const skipReason = testUri ? false : 'MONGO_TEST_URI is not set; these tests require a live MongoDB';
const CLIENT_ID = 'test-client-123.apps.googleusercontent.com';

if (testUri) {
  const databaseName = new URL(testUri).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) throw new Error(`Refusing to run: database "${databaseName}" must end with "_test" because it is dropped afterwards.`);
  Object.assign(process.env, {
    NODE_ENV: 'development',
    MONGO_URI: testUri,
    JWT_SECRET: 'api-test-secret-api-test-secret-api-test-1234',
    CLIENT_URL: 'http://localhost:5173',
    GOOGLE_CLIENT_ID: CLIENT_ID,
    AUTH_RATE_LIMIT_MAX: '10000',
    RESET_EMAIL_LIMIT_MAX: '100000',
    GLOBAL_RATE_LIMIT_MAX: '100000',
    LOGIN_ACCOUNT_LIMIT_MAX: '10000',
  });
}

const PASSWORD = 'customer-pass-phrase-1';

describe('Google Sign-In and portal-aware sign-in', { skip: skipReason }, () => {
  let mongoose;
  let app;
  let server;
  let baseUrl;
  let M;
  let hashPassword;
  let google;
  let privateKey;
  let jwk;
  let sequence = 0;

  const call = async (method, path, { body, cookie } = {}) => {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const setCookie = response.headers.get('set-cookie');
    return { status: response.status, body: text ? JSON.parse(text) : null, text, cookie: setCookie ? setCookie.split(';')[0] : null };
  };

  const uniqueEmail = (label) => `${label}.${(sequence += 1)}@example.com`;
  /** A signed Google-style ID token. Claims and signing options can be overridden to build each kind of bad token. */
  const mint = ({ email, sub = `google-sub-${(sequence += 1)}`, claims = {}, key = privateKey, kid = 'test-key', expiresIn = 300, algorithm = 'RS256' } = {}) =>
    jwt.sign({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub, email, email_verified: true, given_name: 'Gina', family_name: 'Googler', ...claims }, key, { algorithm, keyid: kid, expiresIn });

  const googleLogin = (credential, portal) => call('POST', '/auth/google/login', { body: { credential, portal } });
  const googleRegister = (kind, credential, extra = {}) => call('POST', `/auth/google/register/${kind}`, { body: { credential, companyName: 'Gina Freight Co', ...extra } });
  const passwordLogin = (email, password, portal) => call('POST', '/auth/login', { body: { email, password, ...(portal ? { portal } : {}) } });
  const userByEmail = (email) => M.User.findOne({ email }).select('+googleSubject +passwordHash');

  before(async () => {
    const database = await import('../src/config/database.js');
    ({ default: mongoose } = await import('mongoose'));
    ({ default: app } = await import('../src/app.js'));
    M = await import('../src/models/index.js');
    ({ hashPassword } = await import('../src/services/password.service.js'));
    google = await import('../src/services/googleIdentity.service.js');
    await database.connectDatabase();
    await mongoose.connection.dropDatabase();
    await Promise.allSettled(Object.values(M.models).map((Model) => Model.init()));

    const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = pair.privateKey;
    jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
    google.setGoogleKeyFetcherForTests(async () => [jwk]);

    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    google.setGoogleKeyFetcherForTests(null);
    server.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  async function createPasswordUser({ email, role, isEmailVerified = true, isActive = true }) {
    const user = await M.User.create({ firstName: 'Pat', lastName: 'Password', email, role, isActive, isEmailVerified, passwordHash: await hashPassword(PASSWORD) });
    if (role === 'customer') await M.Customer.create({ userId: user._id, companyName: `${email} Co`, contactPerson: 'Pat Password' });
    if (role === 'carrier') await M.Carrier.create({ userId: user._id, companyName: `${email} Trucking`, contactPerson: 'Pat Password' });
    return user;
  }

  describe('configuration endpoint', () => {
    test('reports Google as enabled with only the public client ID', async () => {
      const response = await call('GET', '/auth/google/config');
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.data, { enabled: true, clientId: CLIENT_ID });
      assert.doesNotMatch(response.text, /secret/i);
    });
  });

  describe('registering with Google', () => {
    test('a customer is created with the customer role, a verified email, a Google link and no usable password', async () => {
      const email = uniqueEmail('new.customer');
      const response = await googleRegister('customer', mint({ email }));
      assert.equal(response.status, 201);
      assert.equal(response.body.data.user.role, 'customer');
      assert.equal(response.body.data.user.isEmailVerified, true);
      assert.equal(response.body.data.profile.companyName, 'Gina Freight Co');
      assert.match(response.cookie, /^hashimi_token=/);
      const user = await userByEmail(email);
      assert.ok(user.googleSubject);
      assert.equal(await M.Customer.countDocuments({ userId: user._id }), 1);
      assert.equal(await M.Carrier.countDocuments({ userId: user._id }), 0);
      assert.equal((await passwordLogin(email, PASSWORD)).status, 401, 'there is no password to guess');
      assert.ok(!JSON.stringify(response.body).includes('googleSubject'), 'the Google subject is never returned');
    });

    test('a carrier is created with the carrier role and is still pending approval (Google does not bypass onboarding)', async () => {
      const email = uniqueEmail('new.carrier');
      const response = await googleRegister('carrier', mint({ email }));
      assert.equal(response.status, 201);
      assert.equal(response.body.data.user.role, 'carrier');
      assert.deepEqual([response.body.data.profile.status, response.body.data.profile.authorityStatus, response.body.data.profile.complianceStatus], ['pending', 'pending', 'pending']);
      const eligibility = await call('GET', '/carrier/loads', { cookie: response.cookie });
      assert.notEqual(eligibility.status, 403, 'carrier routes are reachable; load-board access is still gated by approval');
    });

    test('a role, account type or email in the body is refused, so a client cannot choose privileges or another identity', async () => {
      const email = uniqueEmail('smuggle');
      for (const extra of [{ role: 'super_admin' }, { accountType: 'super_admin' }, { isEmailVerified: true }, { email: 'someone.else@example.com' }]) {
        const response = await googleRegister('customer', mint({ email }), extra);
        assert.equal(response.status, 422, JSON.stringify(extra));
      }
      assert.equal(await M.User.countDocuments({ email }), 0);
    });

    test('an email that already has an account is refused with a conflict and nothing is changed', async () => {
      const email = uniqueEmail('taken');
      await createPasswordUser({ email, role: 'customer' });
      const response = await googleRegister('carrier', mint({ email }));
      assert.equal(response.status, 409);
      const user = await userByEmail(email);
      assert.equal(user.role, 'customer');
      assert.equal(user.googleSubject, undefined);
      assert.equal(await M.Carrier.countDocuments({ userId: user._id }), 0);
    });

    test('the same Google account cannot register twice', async () => {
      const sub = 'dup-sub';
      assert.equal((await googleRegister('customer', mint({ email: uniqueEmail('dup.a'), sub }))).status, 201);
      assert.notEqual((await googleRegister('customer', mint({ email: uniqueEmail('dup.b'), sub }))).status, 201);
    });
  });

  describe('identity verification', () => {
    const bad = {
      'wrong audience': (email) => mint({ email, claims: { aud: 'someone-else.apps.googleusercontent.com' } }),
      'wrong issuer': (email) => mint({ email, claims: { iss: 'https://evil.example.com' } }),
      'expired': (email) => mint({ email, expiresIn: -60 }),
      'unverified email': (email) => mint({ email, claims: { email_verified: false } }),
      'missing email': (email) => mint({ email, claims: { email: undefined } }),
      'signed by a different key': (email) => mint({ email, key: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey }),
      'unknown key id': (email) => mint({ email, kid: 'not-a-google-key' }),
      'HS256 forged with the public key material': (email) => jwt.sign({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'x', email, email_verified: true }, JSON.stringify(jwk), { algorithm: 'HS256', keyid: 'test-key' }),
      'unsigned (alg none)': (email) => `${Buffer.from('{"alg":"none","typ":"JWT","kid":"test-key"}').toString('base64url')}.${Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: 'x', email, email_verified: true })).toString('base64url')}.`,
      'not a token at all': () => 'this is definitely not a json web token',
    };

    for (const [label, build] of Object.entries(bad)) {
      test(`registration and sign-in both reject: ${label}`, async () => {
        const email = uniqueEmail('badtoken');
        await createPasswordUser({ email: `existing.${email}`, role: 'customer' });
        const register = await googleRegister('customer', build(email));
        assert.equal(register.status, 401);
        const login = await googleLogin(build(`existing.${email}`), 'customer');
        assert.equal(login.status, 401);
        assert.equal(login.cookie, null, 'no session cookie');
        assert.equal(await M.User.countDocuments({ email }), 0);
        assert.equal((await userByEmail(`existing.${email}`)).googleSubject, undefined, 'nothing was linked');
      });
    }
  });

  describe('signing in with Google', () => {
    test('someone who has not registered gets ACCOUNT_NOT_FOUND and no account or session is created', async () => {
      const email = uniqueEmail('stranger');
      const response = await googleLogin(mint({ email }), 'customer');
      assert.equal(response.status, 404);
      assert.equal(response.body.code, 'ACCOUNT_NOT_FOUND');
      assert.equal(response.cookie, null);
      assert.equal(await M.User.countDocuments({ email }), 0);
    });

    test('a Google-registered customer signs in at the customer portal and reaches customer APIs only', async () => {
      const email = uniqueEmail('cust.google');
      const sub = `sub-${email}`;
      assert.equal((await googleRegister('customer', mint({ email, sub }))).status, 201);
      const response = await googleLogin(mint({ email, sub }), 'customer');
      assert.equal(response.status, 200);
      assert.equal(response.body.data.user.role, 'customer');
      assert.equal((await call('GET', '/customer/profile', { cookie: response.cookie })).status, 200);
      for (const path of ['/carrier/profile', '/admin/customers', '/admin/cms/settings', '/finance/invoices', '/operations/loads']) {
        assert.equal((await call('GET', path, { cookie: response.cookie })).status, 403, path);
      }
    });

    test('a Google-registered carrier signs in at the carrier portal and reaches carrier APIs only', async () => {
      const email = uniqueEmail('carrier.google');
      const sub = `sub-${email}`;
      assert.equal((await googleRegister('carrier', mint({ email, sub }))).status, 201);
      const response = await googleLogin(mint({ email, sub }), 'carrier');
      assert.equal(response.status, 200);
      assert.equal(response.body.data.user.role, 'carrier');
      assert.equal((await call('GET', '/carrier/profile', { cookie: response.cookie })).status, 200);
      for (const path of ['/customer/profile', '/admin/carriers', '/admin/cms/settings', '/finance/invoices', '/operations/loads']) {
        assert.equal((await call('GET', path, { cookie: response.cookie })).status, 403, path);
      }
    });

    test('the portal never changes a role: a customer at the carrier portal (and the reverse) is refused without a session', async () => {
      const customer = uniqueEmail('swap.customer');
      const carrier = uniqueEmail('swap.carrier');
      await googleRegister('customer', mint({ email: customer, sub: `sub-${customer}` }));
      await googleRegister('carrier', mint({ email: carrier, sub: `sub-${carrier}` }));
      const a = await googleLogin(mint({ email: customer, sub: `sub-${customer}` }), 'carrier');
      const b = await googleLogin(mint({ email: carrier, sub: `sub-${carrier}` }), 'customer');
      for (const response of [a, b]) {
        assert.equal(response.status, 403);
        assert.equal(response.cookie, null);
      }
      assert.equal((await userByEmail(customer)).role, 'customer');
      assert.equal((await userByEmail(carrier)).role, 'carrier');
      assert.equal(await M.Carrier.countDocuments({ userId: (await userByEmail(customer))._id }), 0);
      assert.equal(await M.Customer.countDocuments({ userId: (await userByEmail(carrier))._id }), 0);
    });

    test('portal must be customer or carrier; a privileged or unknown value is a validation error', async () => {
      const email = uniqueEmail('portal');
      for (const portal of ['super_admin', 'admin', '', undefined]) {
        const response = await googleLogin(mint({ email }), portal);
        assert.equal(response.status, 422, String(portal));
      }
    });

    test('a deactivated account cannot sign in with Google', async () => {
      const email = uniqueEmail('inactive');
      const sub = `sub-${email}`;
      await googleRegister('customer', mint({ email, sub }));
      await M.User.updateOne({ email }, { isActive: false });
      const response = await googleLogin(mint({ email, sub }), 'customer');
      assert.equal(response.status, 403);
      assert.equal(response.cookie, null);
    });
  });

  describe('linking Google to an existing account', () => {
    test('an existing account with a verified email is linked on first Google sign-in, keeping its role', async () => {
      const email = uniqueEmail('verified.link');
      await createPasswordUser({ email, role: 'carrier', isEmailVerified: true });
      const response = await googleLogin(mint({ email, sub: `sub-${email}` }), 'carrier');
      assert.equal(response.status, 200);
      assert.equal(response.body.data.user.role, 'carrier');
      assert.equal((await userByEmail(email)).googleSubject, `sub-${email}`);
      assert.equal((await passwordLogin(email, PASSWORD, 'carrier')).status, 200, 'the password still works');
    });

    test('an account whose email this site has not verified is never linked', async () => {
      const email = uniqueEmail('unverified.link');
      await createPasswordUser({ email, role: 'customer', isEmailVerified: false });
      const response = await googleLogin(mint({ email }), 'customer');
      assert.equal(response.status, 403);
      assert.equal(response.cookie, null);
      assert.equal((await userByEmail(email)).googleSubject, undefined);
    });

    test('an account already linked to a different Google identity cannot be taken over by another Google account', async () => {
      const email = uniqueEmail('takeover');
      await createPasswordUser({ email, role: 'customer' });
      assert.equal((await googleLogin(mint({ email, sub: 'original-owner' }), 'customer')).status, 200);
      const attack = await googleLogin(mint({ email, sub: 'someone-else' }), 'customer');
      assert.equal(attack.status, 401);
      assert.equal(attack.cookie, null);
      assert.equal((await userByEmail(email)).googleSubject, 'original-owner');
    });

    test('a Super Admin can never sign in or be linked through Google', async () => {
      const email = uniqueEmail('root');
      await M.User.create({ firstName: 'Root', lastName: 'Admin', email, role: 'super_admin', isEmailVerified: true, passwordHash: await hashPassword(PASSWORD) });
      for (const portal of ['customer', 'carrier']) {
        const response = await googleLogin(mint({ email, sub: 'admin-sub' }), portal);
        assert.equal(response.status, 401);
        assert.equal(response.cookie, null);
      }
      assert.equal((await userByEmail(email)).googleSubject, undefined);
      assert.equal(await M.User.countDocuments({ role: 'super_admin' }), 1);
      assert.equal((await googleRegister('customer', mint({ email }))).status, 409);
    });
  });

  describe('portal-aware password sign-in', () => {
    test('the portal narrows who may sign in; a wrong portal is the same generic 401 as a wrong password', async () => {
      const customer = uniqueEmail('pw.customer');
      const carrier = uniqueEmail('pw.carrier');
      await createPasswordUser({ email: customer, role: 'customer' });
      await createPasswordUser({ email: carrier, role: 'carrier' });
      assert.equal((await passwordLogin(customer, PASSWORD, 'customer')).status, 200);
      assert.equal((await passwordLogin(carrier, PASSWORD, 'carrier')).status, 200);
      const a = await passwordLogin(customer, PASSWORD, 'carrier');
      const b = await passwordLogin(carrier, PASSWORD, 'customer');
      const wrong = await passwordLogin(customer, 'not-the-password', 'customer');
      for (const response of [a, b]) {
        assert.equal(response.status, 401);
        assert.equal(response.cookie, null);
        assert.equal(response.body.message, wrong.body.message);
      }
    });

    test('without a portal the shared page still signs both roles in, and the role always comes from the account', async () => {
      const email = uniqueEmail('pw.noportal');
      await createPasswordUser({ email, role: 'carrier' });
      const response = await passwordLogin(email, PASSWORD);
      assert.equal(response.status, 200);
      assert.equal(response.body.data.user.role, 'carrier');
    });

    test('a role or unknown portal in the sign-in body is rejected', async () => {
      const email = uniqueEmail('pw.role');
      await createPasswordUser({ email, role: 'customer' });
      assert.equal((await call('POST', '/auth/login', { body: { email, password: PASSWORD, role: 'super_admin' } })).status, 422);
      assert.equal((await call('POST', '/auth/login', { body: { email, password: PASSWORD, portal: 'super_admin' } })).status, 422);
    });

    test('the admin sign-in is unchanged: customers and carriers cannot use it, and the portal field does not widen it', async () => {
      const customer = uniqueEmail('admin.attempt');
      await createPasswordUser({ email: customer, role: 'customer' });
      assert.equal((await call('POST', '/auth/admin/login', { body: { email: customer, password: PASSWORD } })).status, 401);
      assert.equal((await call('POST', '/auth/admin/login', { body: { email: customer, password: PASSWORD, portal: 'customer' } })).status, 401);
      const adminEmail = uniqueEmail('admin.ok');
      const adminUser = (await M.User.findOne({ role: 'super_admin' })) ?? (await M.User.create({ firstName: 'Root', lastName: 'Admin', email: adminEmail, role: 'super_admin', isEmailVerified: true, passwordHash: await hashPassword(PASSWORD) }));
      const response = await call('POST', '/auth/admin/login', { body: { email: adminUser.email, password: PASSWORD } });
      assert.equal(response.status, 200);
      assert.equal(response.body.data.user.role, 'super_admin');
      assert.equal((await call('GET', '/admin/customers', { cookie: response.cookie })).status, 200);
    });
  });

  describe('sessions', () => {
    test('logout ends a Google session for good, and an unauthenticated request is refused', async () => {
      const email = uniqueEmail('logout');
      const sub = `sub-${email}`;
      const registered = await googleRegister('customer', mint({ email, sub }));
      assert.equal((await call('GET', '/auth/me', { cookie: registered.cookie })).status, 200);
      assert.equal((await call('POST', '/auth/logout', { cookie: registered.cookie })).status, 200);
      assert.equal((await call('GET', '/auth/me', { cookie: registered.cookie })).status, 401, 'the old token no longer works');
      assert.equal((await call('GET', '/customer/profile')).status, 401);
    });
  });
});
