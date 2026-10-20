/** Authentication and authorization tests that need NO database. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, test } from 'node:test';
import jwt from 'jsonwebtoken';

import { fileURLToPath } from 'node:url';



Object.assign(process.env, {
  NODE_ENV: 'development',
  MONGO_URI: 'mongodb://127.0.0.1:1/unused',
  JWT_SECRET: 'static-test-secret-static-test-secret-1234',
  CLIENT_URL: 'http://localhost:5173',
});

const { env } = await import('../src/config/env.js');
const { default: app } = await import('../src/app.js');
const { authenticate } = await import('../src/middleware/authenticate.js');
const { requireCarrier, requireCustomer, requireRole, requireSuperAdmin } = await import('../src/middleware/authorize.js');
const { requireTrustedOrigin } = await import('../src/middleware/trustedOrigin.js');
const { assertOwnsRecord, ownershipFilter } = await import('../src/services/ownership.service.js');
const { generateToken, hashToken } = await import('../src/services/secureToken.service.js');
const { signAccessToken, verifyAccessToken } = await import('../src/services/token.service.js');
const { sendAuthLink, isEmailConfigured } = await import('../src/services/email.service.js');
const { setEmailProviderForTests } = await import('../src/notifications/providers/index.js');
const validators = await import('../src/validators/auth.validator.js');
const { idParamSchema, objectIdSchema } = await import('../src/validators/common.validator.js');
const { checkPassword } = await import('../src/utils/passwordPolicy.js');
const { passwordResetEmail, emailVerificationEmail } = await import('../src/templates/authEmails.js');
const mongoose = (await import('mongoose')).default;

const definedOnly = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
const VALID_ID = new mongoose.Types.ObjectId().toString();
const fakeUser = (overrides = {}) => ({ id: VALID_ID, role: 'customer', tokenVersion: 0, ...overrides });
const strongRegistration = (overrides = {}) => ({
  firstName: 'Test',
  lastName: 'Person',
  companyName: 'Test Co',
  email: 'Person@Example.com',
  password: 'a-long-enough-pass-1',
  passwordConfirmation: 'a-long-enough-pass-1',
  ...overrides,
});
const parse = (schema, body) => schema.safeParse({ body });
const failedFields = (result) => result.error.issues.map((issue) => issue.path.slice(1).join('.'));

async function callApi(method, path, { headers = {}, body } = {}) {
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
  } finally {
    server.close();
  }
}

async function runMiddleware(middleware, req) {
  let proceeded = false;
  try {
    await middleware(req, {}, () => {
      proceeded = true;
    });
    return { proceeded, error: null };
  } catch (error) {
    return { proceeded, error };
  }
}

describe('registration validation: privilege escalation and injection', () => {
  const schemas = { customer: validators.registerCustomerSchema, carrier: validators.registerCarrierSchema };

  test('a well-formed registration is accepted, normalized, and drops the confirmation', () => {
    for (const schema of Object.values(schemas)) {
      const result = parse(schema, strongRegistration());
      assert.equal(result.success, true);
      assert.equal(result.data.body.email, 'person@example.com');
      assert.equal('passwordConfirmation' in result.data.body, false, 'confirmation is never kept');
    }
  });

  test('every privilege-escalation field is rejected, not silently ignored', () => {
    const attacks = [
      { role: 'super_admin' },
      { accountType: 'super_admin' },
      { role: 'customer' },
      { isActive: true },
      { isEmailVerified: true },
      { permissions: ['*'] },
      { isAdmin: true },
      { isSuperAdmin: true },
      { tokenVersion: 99 },
      { passwordHash: 'x' },
      { customerId: '507f1f77bcf86cd799439011' },
      { carrierId: '507f1f77bcf86cd799439011' },
      { _id: '507f1f77bcf86cd799439011' },
      { __proto__: { role: 'super_admin' }, constructor: { prototype: { role: 'super_admin' } } },
    ];
    for (const [name, schema] of Object.entries(schemas)) {
      for (const attack of attacks) {
        const body = Object.assign(strongRegistration(), JSON.parse(JSON.stringify(attack)));
        const result = parse(schema, body);
        assert.equal(result.success, false, `${name}: ${JSON.stringify(attack)} must be rejected`);
      }
    }
  });

  test('the same attacks are rejected on login, reset, and verification bodies', () => {
    for (const extra of [{ role: 'super_admin' }, { accountType: 'super_admin' }, { isActive: true }]) {
      assert.equal(parse(validators.loginSchema, { email: 'a@b.co', password: 'x', ...extra }).success, false);
      assert.equal(parse(validators.forgotPasswordSchema, { email: 'a@b.co', ...extra }).success, false);
      assert.equal(parse(validators.verifyEmailSchema, { token: 'abc', ...extra }).success, false);
      assert.equal(
        parse(validators.resetPasswordSchema, { token: 't', password: 'a-long-enough-pass-1', passwordConfirmation: 'a-long-enough-pass-1', ...extra }).success,
        false
      );
    }
  });

  test('MongoDB operator injection and wrong data types are rejected', () => {
    const operators = [{ $ne: null }, { $gt: '' }, { $regex: '.*' }, { $where: '1==1' }, ['a@b.co'], 12345, true, null];
    for (const value of operators) {
      assert.equal(parse(validators.loginSchema, { email: value, password: 'x' }).success, false, `email ${JSON.stringify(value)}`);
      assert.equal(parse(validators.loginSchema, { email: 'a@b.co', password: value }).success, false, `password ${JSON.stringify(value)}`);
      assert.equal(parse(validators.forgotPasswordSchema, { email: value }).success, false);
      assert.equal(parse(validators.verifyEmailSchema, { token: value }).success, false);
      assert.equal(parse(validators.resetPasswordSchema, { token: value, password: 'a-long-enough-pass-1', passwordConfirmation: 'a-long-enough-pass-1' }).success, false);
      assert.equal(parse(validators.registerCustomerSchema, strongRegistration({ email: value })).success, false);
      assert.equal(parse(validators.registerCustomerSchema, strongRegistration({ firstName: value })).success, false);
    }
  });

  test('malformed emails, names, phone numbers, and missing fields are rejected', () => {
    for (const email of ['', 'plain', 'a@', '@b.co', 'a b@c.co', 'a@b', 'x'.repeat(260) + '@b.co']) {
      assert.equal(parse(validators.registerCustomerSchema, strongRegistration({ email })).success, false, email);
    }
    assert.equal(parse(validators.registerCustomerSchema, strongRegistration({ phone: 'call me' })).success, false);
    assert.equal(parse(validators.registerCustomerSchema, strongRegistration({ phone: '+1 (555) 010-0000' })).success, true);
    assert.equal(parse(validators.registerCustomerSchema, strongRegistration({ firstName: '   ' })).success, false);
    assert.equal(parse(validators.registerCustomerSchema, strongRegistration({ companyName: '' })).success, false);
    const { companyName: _omitted, ...withoutCompany } = strongRegistration();
    assert.equal(parse(validators.registerCarrierSchema, withoutCompany).success, false);
    assert.equal(validators.registerCustomerSchema.safeParse({}).success, false);
  });
});

describe('password policy', () => {
  test('confirmation must match, on registration and on reset', () => {
    const mismatch = parse(validators.registerCustomerSchema, strongRegistration({ passwordConfirmation: 'different-pass-123' }));
    assert.deepEqual(failedFields(mismatch), ['passwordConfirmation']);
    const reset = parse(validators.resetPasswordSchema, { token: 't', password: 'a-long-enough-pass-1', passwordConfirmation: 'nope' });
    assert.deepEqual(failedFields(reset), ['passwordConfirmation']);
    assert.equal(parse(validators.registerCustomerSchema, strongRegistration({ passwordConfirmation: undefined })).success, false);
  });

  test('rejects short, common, repeated, blank, and personal passwords', () => {
    assert.match(checkPassword('short1'), /at least 10/);
    assert.match(checkPassword('password123'), /too common/);
    assert.match(checkPassword('Password-1234'), /too common/, 'punctuation and case do not hide a common password');
    assert.match(checkPassword('1234567890'), /too common/);
    assert.match(checkPassword('aaaaaaaaaaaa'), /repeated/);
    assert.match(checkPassword('            '), /only spaces/);
    assert.match(checkPassword('janedoe-secret-1', { email: 'janedoe@example.com' }), /email/);
    assert.match(checkPassword('Smithsonian', { lastName: 'Smithsonian' }), /name/);
    assert.match(checkPassword('é'.repeat(40)), /72 bytes/);
    assert.match(checkPassword(12345678901234), /text/);
  });

  test('accepts long passphrases and ordinary strong passwords without forced complexity', () => {
    for (const password of ['correct horse battery staple', 'a-long-enough-pass-1', 'alllowercaseletters', 'ÄÖÜ-äöü-ß-12345']) {
      assert.equal(checkPassword(password, { email: 'someone@example.com' }), null, password);
    }
  });

  test('the registration schema applies the policy with the person\'s own details', () => {
    const personal = parse(validators.registerCustomerSchema, strongRegistration({ email: 'janedoe@example.com', password: 'janedoe-secret-1', passwordConfirmation: 'janedoe-secret-1' }));
    assert.deepEqual(failedFields(personal), ['password']);
    const common = parse(validators.registerCustomerSchema, strongRegistration({ password: 'password1234', passwordConfirmation: 'password1234' }));
    assert.deepEqual(failedFields(common), ['password']);
  });
});

describe('one-time tokens', () => {
  test('are random, URL-safe, long, and only their hash is derived for storage', () => {
    const issued = Array.from({ length: 500 }, generateToken);
    assert.equal(new Set(issued.map((item) => item.token)).size, 500);
    for (const { token, tokenHash } of issued) {
      assert.match(token, /^[A-Za-z0-9_-]{43}$/);
      assert.match(tokenHash, /^[a-f0-9]{64}$/);
      assert.notEqual(token, tokenHash);
      assert.equal(hashToken(token), tokenHash);
      assert.ok(!tokenHash.includes(token.slice(0, 12)));
    }
  });
});

describe('JWT contents and verification', () => {
  const sign = (payload, options = {}, secret = env.JWT_SECRET) =>
    jwt.sign(payload, secret, definedOnly({ algorithm: 'HS256', issuer: 'hashimi-logistics', subject: VALID_ID, expiresIn: '5m', ...options }));

  test('the access token contains only identity basics (no email, profile, finance, or permissions)', () => {
    const { token, expiresAt } = signAccessToken(fakeUser({ role: 'carrier', tokenVersion: 3, email: 'secret@example.com', passwordHash: 'h', rate: 1 }));
    const payload = jwt.decode(token);
    assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'iss', 'role', 'sub', 'tv']);
    assert.equal(payload.sub, VALID_ID);
    assert.equal(payload.role, 'carrier');
    assert.equal(payload.tv, 3);
    const text = JSON.stringify(payload);
    for (const forbidden of ['secret@example.com', 'passwordHash', 'rate', 'margin', 'permissions', 'email']) {
      assert.ok(!text.includes(forbidden), forbidden);
    }
    assert.ok(expiresAt.getTime() > Date.now());
    assert.equal(jwt.decode(token, { complete: true }).header.alg, 'HS256');
  });

  test('a valid token round-trips to userId, role, and tokenVersion', () => {
    const { token } = signAccessToken(fakeUser({ tokenVersion: 7 }));
    assert.deepEqual(verifyAccessToken(token), { userId: VALID_ID, role: 'customer', tokenVersion: 7 });
  });

  test('tampered, forged, expired, and malformed tokens are all rejected with one generic message', () => {
    const { token } = signAccessToken(fakeUser());
    const [header, body, signature] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), role: 'super_admin' })).toString('base64url');
    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const bad = {
      tamperedPayload: `${header}.${forgedBody}.${signature}`,
      tamperedSignature: `${header}.${body}.${signature.slice(0, -2)}xx`,
      algNone: `${noneHeader}.${body}.`,
      wrongSecret: sign({ role: 'customer', tv: 0 }, {}, 'a-completely-different-secret-value-123'),
      expired: sign({ role: 'customer', tv: 0 }, { expiresIn: -60 }),
      wrongIssuer: sign({ role: 'customer', tv: 0 }, { issuer: 'someone-else' }),
      hs512: sign({ role: 'customer', tv: 0 }, { algorithm: 'HS512' }),
      notBefore: sign({ role: 'customer', tv: 0 }, { notBefore: 3600 }),
      missingVersion: sign({ role: 'customer' }),
      stringVersion: sign({ role: 'customer', tv: '0' }),
      negativeVersion: sign({ role: 'customer', tv: -1 }),
      unknownRole: sign({ role: 'admin', tv: 0 }),
      objectRole: sign({ role: { $ne: 'x' }, tv: 0 }),
      badSubject: sign({ role: 'customer', tv: 0 }, { subject: 'not-an-object-id' }),
      operatorSubject: sign({ role: 'customer', tv: 0, sub: { $ne: null } }, { subject: undefined }),
      garbage: 'not.a.jwt',
      empty: '',
      oneSegment: 'abc',
    };
    for (const [name, value] of Object.entries(bad)) {
      assert.throws(() => verifyAccessToken(value), (error) => error.statusCode === 401 && error.message === 'Your session has expired. Please sign in again.', name);
    }
  });
});

describe('authenticate middleware (rejections that never reach the database)', () => {
  const withCookie = (value) => ({ cookies: value === undefined ? {} : { [env.COOKIE_NAME]: value } });
  const sign = (payload, options = {}, secret = env.JWT_SECRET) =>
    jwt.sign(payload, secret, definedOnly({ algorithm: 'HS256', issuer: 'hashimi-logistics', subject: VALID_ID, expiresIn: '5m', ...options }));

  test('missing, malformed, tampered, expired, and invalid cookies all fail with 401', async () => {
    const valid = signAccessToken(fakeUser()).token;
    const cases = {
      missing: withCookie(undefined),
      noCookiesObject: {},
      empty: withCookie(''),
      malformed: withCookie('abc.def.ghi'),
      tampered: withCookie(valid.slice(0, -3) + 'abc'),
      expired: withCookie(sign({ role: 'customer', tv: 0 }, { expiresIn: -30 })),
      wrongSecret: withCookie(sign({ role: 'customer', tv: 0 }, {}, 'another-secret-another-secret-123456')),
      escalatedRole: withCookie(sign({ role: 'super_admin', tv: 0 }, {}, 'another-secret-another-secret-123456')),
    };
    for (const [name, req] of Object.entries(cases)) {
      const { proceeded, error } = await runMiddleware(authenticate, req);
      assert.equal(proceeded, false, name);
      assert.equal(error.statusCode, 401, name);
      assert.ok(!/jwt|signature|malformed|algorithm|secret|token/i.test(error.message), `${name}: "${error.message}" must not describe JWT internals`);
    }
  });
});

describe('role authorization (three roles only)', () => {
  const matrix = [
    ['requireSuperAdmin', requireSuperAdmin, { super_admin: true, customer: false, carrier: false }],
    ['requireCustomer', requireCustomer, { super_admin: false, customer: true, carrier: false }],
    ['requireCarrier', requireCarrier, { super_admin: false, customer: false, carrier: true }],
    ['requireRole(customer, carrier)', requireRole('customer', 'carrier'), { super_admin: false, customer: true, carrier: true }],
  ];

  test('each guard admits exactly its roles', async () => {
    for (const [name, guard, expectations] of matrix) {
      for (const [role, allowed] of Object.entries(expectations)) {
        const { proceeded, error } = await runMiddleware(guard, { user: { role } });
        assert.equal(proceeded, allowed, `${name} / ${role}`);
        if (!allowed) assert.equal(error.statusCode, 403, `${name} / ${role}`);
      }
      const anonymous = await runMiddleware(guard, {});
      assert.equal(anonymous.error.statusCode, 401, `${name} without a user`);
    }
  });

  test('requireRole refuses invented roles when a route is defined', () => {
    for (const bad of [['admin'], ['manager'], ['super_admin', 'broker'], []]) {
      assert.throws(() => requireRole(...bad), /invalid roles/);
    }
  });
});

describe('ownership helpers', () => {
  const customerA = { role: 'customer', customerId: new mongoose.Types.ObjectId() };
  const carrierA = { role: 'carrier', carrierId: new mongoose.Types.ObjectId() };
  const admin = { role: 'super_admin' };

  test('filters scope customers and carriers to their own id, and admin to everything', () => {
    assert.deepEqual(ownershipFilter(customerA), { customerId: customerA.customerId });
    assert.deepEqual(ownershipFilter(carrierA), { carrierId: carrierA.carrierId });
    assert.deepEqual(ownershipFilter(admin), {});
    assert.throws(() => ownershipFilter({ role: 'customer' }), (error) => error.statusCode === 403);
    assert.throws(() => ownershipFilter({}), (error) => error.statusCode === 403);
  });

  test('foreign and missing records look identical: 404, never 403', () => {
    const own = { customerId: customerA.customerId };
    const foreign = { customerId: new mongoose.Types.ObjectId() };
    assert.equal(assertOwnsRecord(customerA, own), own);
    assert.equal(assertOwnsRecord(admin, foreign), foreign);
    assert.throws(() => assertOwnsRecord(customerA, foreign), (error) => error.statusCode === 404);
    assert.throws(() => assertOwnsRecord(customerA, null), (error) => error.statusCode === 404);
    assert.throws(() => assertOwnsRecord(carrierA, { customerId: customerA.customerId }), (error) => error.statusCode === 404);
    assert.throws(() => assertOwnsRecord(carrierA, { carrierId: new mongoose.Types.ObjectId() }), (error) => error.statusCode === 404);
    assert.equal(assertOwnsRecord(carrierA, { carrierId: carrierA.carrierId }).carrierId, carrierA.carrierId);
  });
});

describe('identifier validation', () => {
  test('only real 24-character hex ids pass; operators and arrays do not', () => {
    assert.equal(objectIdSchema.safeParse(VALID_ID).success, true);
    for (const bad of ['', '123', 'zzzzzzzzzzzzzzzzzzzzzzzz', VALID_ID + '0', { $ne: null }, [VALID_ID], 5, null, undefined]) {
      assert.equal(objectIdSchema.safeParse(bad).success, false, JSON.stringify(bad));
    }
    assert.equal(idParamSchema.safeParse({ params: { id: { $gt: '' } } }).success, false);
  });
});

describe('email delivery boundary', () => {
  test('reports honestly that nothing was queued or sent when no provider is configured', async () => {
    setEmailProviderForTests(null);
    assert.equal(isEmailConfigured(), false);
    const expiresAt = new Date(Date.now() + 60000);
    assert.deepEqual(await sendAuthLink({ user: { _id: 'x', email: 'a@b.co', firstName: 'A' }, kind: 'password_reset', token: 't', expiresAt }), { queued: false });
    setEmailProviderForTests(undefined);
  });

  test('a configured provider is reported as available (delivery itself is covered by notifications.delivery.test.js)', () => {
    setEmailProviderForTests({ name: 'test', send: async () => ({ providerMessageId: 'x' }) });
    assert.equal(isEmailConfigured(), true);
    setEmailProviderForTests(undefined);
  });

  test('email links point at the configured frontend and carry the token only in the query', () => {
    const reset = passwordResetEmail({ firstName: 'Ann', token: 'abc_DEF-123' });
    const verify = emailVerificationEmail({ firstName: 'Ann', token: 'abc_DEF-123' });
    assert.ok(reset.text.includes(`${env.CLIENT_URL}/reset-password?token=abc_DEF-123`));
    assert.ok(verify.text.includes(`${env.CLIENT_URL}/verify-email?token=abc_DEF-123`));
    assert.match(reset.text, /30 minutes/);
    assert.match(verify.text, /24 hours/);
  });
});

describe('trusted origin check (defense in depth for cookie auth)', () => {
  const run = (method, origin) => runMiddleware(requireTrustedOrigin, { method, get: () => origin });

  test('blocks state-changing requests from other origins; allows own origin, no origin, and reads', async () => {
    assert.equal((await run('POST', 'https://evil.example')).error.statusCode, 403);
    assert.equal((await run('DELETE', 'null')).error.statusCode, 403);
    assert.equal((await run('PATCH', 'http://localhost:5173.evil.example')).error.statusCode, 403);
    assert.equal((await run('POST', env.CLIENT_URL)).proceeded, true);
    assert.equal((await run('POST', undefined)).proceeded, true);
    assert.equal((await run('GET', 'https://evil.example')).proceeded, true);
  });
});

describe('HTTP behavior without a database', () => {
  test('auth responses are never cacheable and the API sets strict security headers', async () => {
    const response = await callApi('GET', '/auth/me');
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-powered-by'), null);
  });

  test('CORS is locked to the configured origin with credentials, never a wildcard', async () => {
    const allowed = await callApi('GET', '/health', { headers: { Origin: env.CLIENT_URL } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), env.CLIENT_URL);
    assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
    const other = await callApi('GET', '/health', { headers: { Origin: 'https://evil.example' } });
    assert.notEqual(other.headers.get('access-control-allow-origin'), '*');
    assert.notEqual(other.headers.get('access-control-allow-origin'), 'https://evil.example');
  });

  test('a cross-origin write is refused before reaching any handler', async () => {
    const response = await callApi('POST', '/auth/logout', { headers: { Origin: 'https://evil.example' } });
    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);
  });

  test('responses follow the standard shape and never leak internals', async () => {
    const malformed = await fetch(`http://127.0.0.1:${(await (async () => { const s = app.listen(0); callApi.server = s; return s.address(); })()).port}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email": ',
    });
    callApi.server.close();
    const body = await malformed.json();
    assert.equal(malformed.status, 400);
    assert.deepEqual(Object.keys(body).sort(), ['errors', 'message', 'success']);
    assert.equal(body.success, false);
    assert.ok(!/stack|at \/|node_modules|SyntaxError/.test(JSON.stringify(body)));

    const invalid = await callApi('POST', '/auth/login', { body: { email: 'nope', password: 'x' } });
    assert.equal(invalid.status, 422);
    assert.ok(Array.isArray(invalid.body.errors) && invalid.body.errors[0].field === 'email');
  });

  test('protected placeholder modules reject anonymous callers; public ones stay public', async () => {
    for (const path of ['/users', '/customers', '/carriers', '/media', '/loads', '/shipments', '/documents', '/payments', '/notifications']) {
      assert.equal((await callApi('GET', path)).status, 401, path);
    }
    for (const path of ['/health', '/services', '/faqs', '/blog', '/quotes', '/tracking']) {
      assert.equal((await callApi('GET', path)).status, 200, path);
    }
  });

  test('the old single /register endpoint and any admin registration route no longer exist', async () => {
    for (const path of ['/auth/register', '/auth/register/admin', '/auth/register/super_admin', '/auth/admin/register']) {
      assert.equal((await callApi('POST', path, { body: strongRegistration() })).status, 404, path);
    }
  });
});

describe('cookie and environment configuration (separate processes)', () => {
  const baseEnv = {
    PATH: process.env.PATH,
    MONGO_URI: 'mongodb://127.0.0.1:1/unused',
    JWT_SECRET: 'static-test-secret-static-test-secret-1234',
    CLIENT_URL: 'http://localhost:5173',
  };
  
const run = (extraEnv, code) =>
  execFileSync(
    process.execPath,
    ['--input-type=module', '-e', code],
    {
      env: {
        ...process.env,
        ...baseEnv,
        ...(extraEnv.NODE_ENV === 'production'
          ? {
              CLIENT_URL: 'https://app.example.org',
              JWT_SECRET: 'Zk3v9QpT7wXb2LmN8dRfY4sHc6JgA1eU0oIiK5tVnBqW',
            }
          : {}),
        ...extraEnv,
      },
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const cookieProbe = `
    import { setAuthCookie, clearAuthCookie } from './src/utils/authCookie.js';
    const calls = [];
    const res = { cookie: (n, v, o) => calls.push(['set', n, o]), clearCookie: (n, o) => calls.push(['clear', n, o]) };
    setAuthCookie(res, 'tok', new Date(Date.now() + 1000)); clearAuthCookie(res);
    console.log(JSON.stringify(calls));`;

  test('development cookies work without HTTPS; production cookies are Secure; all are HttpOnly', () => {
    const dev = JSON.parse(run({ NODE_ENV: 'development' }, cookieProbe));
    const prod = JSON.parse(run({ NODE_ENV: 'production' }, cookieProbe));
    for (const [, , options] of dev) assert.deepEqual([options.httpOnly, options.secure, options.sameSite, options.path], [true, false, 'lax', '/']);
    for (const [, , options] of prod) assert.deepEqual([options.httpOnly, options.secure, options.sameSite, options.path], [true, true, 'lax', '/']);
    assert.ok(dev[0][2].expires instanceof Object || typeof dev[0][2].expires === 'string', 'cookie carries an expiry');
    assert.equal(dev[0][1], 'hashimi_token');
  });

  test('cookie name and SameSite are configurable; strict is allowed', () => {
    const custom = JSON.parse(run({ NODE_ENV: 'development', COOKIE_NAME: 'custom_session', COOKIE_SAME_SITE: 'strict' }, cookieProbe));
    assert.equal(custom[0][1], 'custom_session');
    assert.equal(custom[0][2].sameSite, 'strict');
  });

  test('SameSite=None is refused at startup until CSRF protection exists', () => {
    assert.throws(
      () => run({ NODE_ENV: 'production', COOKIE_SAME_SITE: 'none' }, "await import('./src/config/env.js')"),
      (error) => /SameSite=None is blocked/.test(error.stderr)
    );
  });

  test('development link logging is refused in production', () => {
    assert.throws(
      () => run({ NODE_ENV: 'production', DEV_LOG_AUTH_LINKS: 'true' }, "await import('./src/config/env.js')"),
      (error) => /DEV_LOG_AUTH_LINKS/.test(error.stderr)
    );
  });
});
