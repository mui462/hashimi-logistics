/** Rate limiting for authentication endpoints. Needs no database: invalid bodies still count as attempts. */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

Object.assign(process.env, {
  NODE_ENV: 'development',
  MONGO_URI: 'mongodb://127.0.0.1:1/unused',
  JWT_SECRET: 'ratelimit-test-secret-ratelimit-test-secret-12',
  CLIENT_URL: 'http://localhost:5173',
  AUTH_RATE_LIMIT_MAX: '3',
  GLOBAL_RATE_LIMIT_MAX: '1000',
});

const { default: app } = await import('../src/app.js');

async function withServer(run) {
  const server = app.listen(0);
  try {
    return await run(`http://127.0.0.1:${server.address().port}/api/v1`);
  } finally {
    server.close();
  }
}

const post = (base, path, body = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function statuses(base, path, count) {
  const results = [];
  for (let index = 0; index < count; index += 1) results.push((await post(base, path)).status);
  return results;
}

describe('authentication rate limits (limit set to 3 per window by environment)', () => {
  test('each endpoint has its own counter, so one blocked endpoint does not block another', async () => {
    await withServer(async (base) => {
      const login = await statuses(base, '/auth/login', 5);
      assert.deepEqual(login, [422, 422, 422, 429, 429]);

      const forgot = await statuses(base, '/auth/forgot-password', 5);
      assert.deepEqual(forgot, [422, 422, 422, 429, 429], 'forgot-password still had its full allowance, then is limited');
    });
  });

  test('the other credential endpoints are limited too, with a clean 429 response', async () => {
    await withServer(async (base) => {
      for (const path of [
        '/auth/admin/login',
        '/auth/register/customer',
        '/auth/register/carrier',
        '/auth/reset-password',
        '/auth/verify-email',
        '/auth/resend-verification',
      ]) {
        const results = await statuses(base, path, 5);
        assert.deepEqual(results.slice(0, 3).filter((status) => status === 429), [], `${path}: first 3 attempts are allowed`);
        assert.deepEqual(results.slice(3), [429, 429], `${path}: attempts beyond the limit are blocked`);
      }

      const blocked = await post(base, '/auth/admin/login');
      const body = await blocked.json();
      assert.equal(blocked.status, 429);
      assert.deepEqual(Object.keys(body).sort(), ['errors', 'message', 'success']);
      assert.equal(body.success, false);
      assert.ok(blocked.headers.get('ratelimit') || blocked.headers.get('ratelimit-policy'), 'standard rate-limit headers are sent');
    });
  });

  test('ordinary non-auth traffic is not affected by the stricter auth limits', async () => {
    await withServer(async (base) => {
      await statuses(base, '/auth/login', 6);
      for (let index = 0; index < 10; index += 1) {
        assert.equal((await fetch(`${base}/health`)).status, 200);
      }
    });
  });
});
