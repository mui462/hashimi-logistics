/**
 * Phase 13 security regression tests. The first group needs no database; the second uses a live MongoDB (MONGO_TEST_URI,
 * database name must end in "_test"). Production-mode checks run in child processes because the environment is frozen at import.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const testUri = process.env.MONGO_TEST_URI;
const skipReason = testUri ? false : 'MONGO_TEST_URI is not set; these tests require a live MongoDB';
if (testUri && !new URL(testUri).pathname.replace(/^\//, '').endsWith('_test')) throw new Error('Refusing to run: database name must end with "_test".');

Object.assign(process.env, {
  NODE_ENV: 'development',
  MONGO_URI: testUri ?? 'mongodb://127.0.0.1:1/unused',
  JWT_SECRET: 'phase13-test-secret-phase13-test-secret-12',
  CLIENT_URL: 'http://localhost:5173',
  AUTH_RATE_LIMIT_MAX: '1000',
  GLOBAL_RATE_LIMIT_MAX: '100000',
  LOGIN_ACCOUNT_LIMIT_MAX: '1000',
  RESET_EMAIL_LIMIT_MAX: '3',
});
const BACKEND = fileURLToPath(new URL('..', import.meta.url));
const { default: app } = await import('../src/app.js');

async function withServer(run) {
  const server = app.listen(0);
  try { return await run(`http://127.0.0.1:${server.address().port}/api/v1`); } finally { server.close(); }
}
const post = (base, path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body ?? {}) });

/** Runs a snippet in a fresh production-mode process; returns { status, stdout, stderr }. */
function inProduction(code, overrides = {}) {
  const env = {
    PATH: process.env.PATH, NODE_ENV: 'production', MONGO_URI: 'mongodb://127.0.0.1:1/unused',
    JWT_SECRET: 'Zk3v9QpT7wXb2LmN8dRfY4sHc6JgA1eU0oIiK5tVnBqW', CLIENT_URL: 'https://app.example.org',
    ...overrides,
  };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  return spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: BACKEND, env, encoding: 'utf8', timeout: 30000 });
}

describe('Phase 13: HTTP hardening (no database)', () => {
  test('health reveals no environment name; readiness reports 503 while the database is not connected', async () => {
    await withServer(async (base) => {
      const health = await (await fetch(`${base}/health`)).json();
      assert.equal(health.data.status, 'ok');
      assert.ok(!('environment' in health.data));
      const ready = await fetch(`${base}/health/ready`);
      assert.equal(ready.status, 503);
      assert.equal((await ready.json()).data.status, 'not_ready');
    });
  });

  test('security headers are present on API responses', async () => {
    await withServer(async (base) => {
      const response = await fetch(`${base}/health`);
      assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
      assert.equal(response.headers.get('x-frame-options'), 'DENY');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(!response.headers.get('x-powered-by'));
      assert.match(response.headers.get('strict-transport-security') ?? '', /max-age=/);
    });
  });

  test('CORS allows only the configured frontend origin and never reflects another', async () => {
    await withServer(async (base) => {
      const good = await fetch(`${base}/health`, { headers: { Origin: 'http://localhost:5173' } });
      assert.equal(good.headers.get('access-control-allow-origin'), 'http://localhost:5173');
      assert.equal(good.headers.get('access-control-allow-credentials'), 'true');
      for (const origin of ['https://evil.example', 'null', 'http://localhost:5173.evil.example']) {
        const bad = await fetch(`${base}/health`, { headers: { Origin: origin } });
        assert.notEqual(bad.headers.get('access-control-allow-origin'), origin);
        assert.notEqual(bad.headers.get('access-control-allow-origin'), '*');
      }
    });
  });

  test('state-changing requests marked cross-site by the browser are refused even without an Origin header', async () => {
    await withServer(async (base) => {
      const cross = await post(base, '/auth/logout', {}, { 'Sec-Fetch-Site': 'cross-site' });
      assert.equal(cross.status, 403);
      const crossWrongOrigin = await post(base, '/auth/logout', {}, { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' });
      assert.equal(crossWrongOrigin.status, 403);
      assert.notEqual((await post(base, '/auth/logout', {}, { 'Sec-Fetch-Site': 'same-origin', Origin: 'http://localhost:5173' })).status, 403);
      assert.notEqual((await post(base, '/auth/logout', {})).status, 403, 'non-browser clients (no fetch metadata) are unaffected');
    });
  });

  test('forgot-password is limited per target address, counts unknown addresses too, and leaves other addresses alone', async () => {
    await withServer(async (base) => {
      const attempt = async (email, extra = {}) => (await post(base, '/auth/forgot-password', { email }, extra)).status;
      const first = [];
      for (let i = 0; i < 5; i += 1) first.push(await attempt('victim.limit@example.com', { 'X-Forwarded-For': `10.0.0.${i}` }));
      // Without a database the handler itself answers 500; the limiter sits in front of it either way.
      assert.deepEqual(first.map((status) => status === 429), [false, false, false, true, true]);
      assert.notEqual(await attempt('someone.else@example.com'), 429);
    });
  });

  test('an unauthenticated resend-verification and upload route still answer 401 before doing any work', async () => {
    await withServer(async (base) => {
      assert.equal((await post(base, '/auth/resend-verification', {})).status, 401);
      assert.equal((await fetch(`${base}/carrier/shipments/000000000000000000000001/pod`, { method: 'POST', body: 'x' })).status, 401);
    });
  });

  test('malformed JSON and oversized bodies produce safe errors without internals', async () => {
    await withServer(async (base) => {
      const bad = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":' });
      assert.equal(bad.status, 400);
      const big = await post(base, '/auth/login', { email: 'a@example.com', password: 'x'.repeat(20000) });
      assert.equal(big.status, 413);
      const text = await big.text();
      assert.ok(!/at .*\.js|node_modules|stack/i.test(text));
    });
  });
});

describe('Phase 13: production configuration (child processes)', () => {
  test('plain-HTTP API requests are refused with 426 in production; forwarded HTTPS and health checks pass', () => {
    const code = `
      const { default: app } = await import('./src/app.js');
      const server = app.listen(0);
      const base = 'http://127.0.0.1:' + server.address().port + '/api/v1';
      const out = {};
      out.http = (await fetch(base + '/auth/me')).status;
      out.https = (await fetch(base + '/auth/me', { headers: { 'X-Forwarded-Proto': 'https' } })).status;
      out.health = (await fetch(base + '/health')).status;
      out.spoofSetCookieSecure = true;
      console.log(JSON.stringify(out));
      server.close();
    `;
    const result = inProduction(code);
    assert.equal(result.status, 0, result.stderr);
    const out = JSON.parse(result.stdout.trim().split('\n').pop());
    assert.equal(out.http, 426);
    assert.equal(out.https, 401);
    assert.equal(out.health, 200);
  });

  test('the auth cookie is HttpOnly, Secure and SameSite in production', () => {
    const code = `
      const { setAuthCookie } = await import('./src/utils/authCookie.js');
      let header = '';
      setAuthCookie({ cookie: (name, value, options) => { header = JSON.stringify(options); } }, 't', new Date());
      console.log(header);
    `;
    const result = inProduction(code);
    assert.equal(result.status, 0, result.stderr);
    const options = JSON.parse(result.stdout.trim());
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, true);
    assert.match(options.sameSite, /^(lax|strict)$/);
  });

  test('production start-up is refused for an http CLIENT_URL, a placeholder JWT secret, the mock provider and debug auth links', () => {
    const probe = 'await import("./src/config/env.js");';
    assert.equal(inProduction(probe).status, 0, 'a correct production environment loads');
    for (const [name, overrides, pattern] of [
      ['http CLIENT_URL', { CLIENT_URL: 'http://app.example.org' }, /CLIENT_URL/],
      ['placeholder secret', { JWT_SECRET: 'change-me-change-me-change-me-change-me-1234' }, /JWT_SECRET/],
      ['repeated-character secret', { JWT_SECRET: 'a'.repeat(40) }, /JWT_SECRET/],
      ['mock email', { EMAIL_PROVIDER: 'mock' }, /EMAIL_PROVIDER/],
      ['debug links', { DEV_LOG_AUTH_LINKS: 'true' }, /DEV_LOG_AUTH_LINKS/],
      ['local storage', { STORAGE_PROVIDER: 'local' }, /STORAGE_PROVIDER/],
      ['SameSite none', { COOKIE_SAME_SITE: 'none' }, /COOKIE_SAME_SITE/],
      ['HTTPS enforcement off', { ENFORCE_HTTPS: 'false' }, /ENFORCE_HTTPS/],
    ]) {
      const result = inProduction(probe, overrides);
      assert.notEqual(result.status, 0, `${name} must be refused`);
      assert.match(result.stderr, pattern, name);
    }
  });

  test('production logs are one JSON object per line and error responses never include stack traces', () => {
    const code = `
      const { logger } = await import('./src/utils/logger.js');
      logger.error('boom', new Error('secret detail'));
    `;
    const result = inProduction(code);
    const line = JSON.parse(result.stderr.trim().split('\n').pop());
    assert.equal(line.level, 'error');
    assert.ok(line.time && line.message.includes('boom'));
  });
});

describe('Phase 13: account security against a live database', { skip: skipReason }, () => {
  let mongoose; let server; let base; let M;
  const original = { log: console.log, warn: console.warn, error: console.error };
  const PASS = 'phase13-pass-phrase-1';
  const call = async (method, path, { cookie, json } = {}) => {
    const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: json ? JSON.stringify(json) : undefined });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };

  before(async () => {
    const database = await import('../src/config/database.js');
    ({ default: mongoose } = await import('mongoose'));
    M = await import('../src/models/index.js');
    await database.connectDatabase();
    await mongoose.connection.dropDatabase();
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
    for (const level of ['log', 'warn', 'error']) console[level] = () => {};
  });
  after(async () => {
    Object.assign(console, original);
    server?.close();
    await mongoose?.connection.dropDatabase();
    await mongoose?.disconnect();
  });

  test('readiness is 200 once the database is connected', async () => {
    assert.equal((await call('GET', '/health/ready')).status, 200);
  });

  test('changing the password revokes a previously issued reset link', async () => {
    const email = 'p13.change@example.com';
    const registered = await call('POST', '/auth/register/customer', { json: { firstName: 'P', lastName: 'Thirteen', email, password: PASS, passwordConfirmation: PASS, companyName: 'P13 Shipping' } });
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    const user = await M.User.findOne({ email });
    await M.User.updateOne({ _id: user._id }, { $set: { passwordResetTokenHash: 'a'.repeat(64), passwordResetExpires: new Date(Date.now() + 600000) } });
    const NEW = 'phase13-new-pass-phrase-2';
    const changed = await call('POST', '/customer/profile/password', { cookie: registered.cookie, json: { currentPassword: PASS, password: NEW, passwordConfirmation: NEW } });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const after = await M.User.findById(user._id).select('+passwordResetTokenHash +passwordResetExpires');
    assert.equal(after.passwordResetTokenHash, undefined);
    assert.equal(after.passwordResetExpires, undefined);
  });
});
