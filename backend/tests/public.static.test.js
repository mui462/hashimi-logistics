/**
 * Public website API guards that need no database: per-form and tracking rate limits, the trusted-origin check, and that the
 * public routes leave the Phase 1 placeholders alone. Invalid bodies and malformed tracking numbers still count as attempts.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

Object.assign(process.env, {
  NODE_ENV: 'development',
  MONGO_URI: 'mongodb://127.0.0.1:1/unused',
  JWT_SECRET: 'public-static-secret-public-static-secret-1234',
  CLIENT_URL: 'http://localhost:5173',
  GLOBAL_RATE_LIMIT_MAX: '1000',
  PUBLIC_FORM_LIMIT_MAX: '3',
  TRACKING_LIMIT_MAX: '3',
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

const post = (base, path, { body = {}, headers = {} } = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

async function statuses(count, send) {
  const results = [];
  for (let index = 0; index < count; index += 1) results.push((await send()).status);
  return results;
}

describe('public website API guards (form and tracking limits set to 3 by environment)', () => {
  test('a post from another website is refused before it reaches a form, and does not use up the limit', async () => {
    await withServer(async (base) => {
      for (const path of ['/quotes', '/carrier-applications', '/contact']) {
        const foreign = await post(base, path, { headers: { Origin: 'https://evil.example' } });
        assert.equal(foreign.status, 403, path);
        const crossSite = await post(base, path, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
        assert.equal(crossSite.status, 403, path);
      }
      // The website's own origin is accepted (422 here only because the body is empty).
      assert.equal((await post(base, '/contact', { headers: { Origin: 'http://localhost:5173' } })).status, 422);
    });
  });

  test('each public form has its own per-IP counter', async () => {
    await withServer(async (base) => {
      // One /contact attempt was already used by the previous test (same process, same limiter).
      assert.deepEqual(await statuses(4, () => post(base, '/contact')), [422, 422, 429, 429]);
      assert.deepEqual(await statuses(4, () => post(base, '/quotes')), [422, 422, 422, 429]);
      assert.deepEqual(await statuses(4, () => post(base, '/carrier-applications')), [422, 422, 422, 429]);
      const limited = await post(base, '/contact');
      assert.match((await limited.json()).message, /Too many submissions/);
    });
  });

  test('tracking look-ups are limited per IP, found or not, so tracking numbers cannot be guessed quickly', async () => {
    await withServer(async (base) => {
      const lookup = () => fetch(`${base}/tracking/${encodeURIComponent('not valid!')}`);
      assert.deepEqual(await statuses(5, lookup), [400, 400, 400, 429, 429]);
    });
  });

  test('the public routes are mounted without an auth guard and before the placeholders, which keep answering GET /', async () => {
    const routes = readFileSync(new URL('../src/routes/index.js', import.meta.url), 'utf8');
    assert.match(routes, /router\.use\('\/', publicRoutes\);/);
    assert.ok(routes.indexOf("router.use('/', publicRoutes)") < routes.indexOf('for (const { path, name, access } of PLACEHOLDER_MODULES)'));
    await withServer(async (base) => {
      for (const path of ['/quotes', '/tracking', '/carrier-applications']) {
        const response = await fetch(base + path);
        assert.equal(response.status, 200, path);
        assert.equal((await response.json()).data.status, 'placeholder', path);
      }
    });
  });

  test('public form routes take JSON only: no file upload middleware and no carrier or quote status from the body', () => {
    const routes = readFileSync(new URL('../src/public/public.routes.js', import.meta.url), 'utf8');
    assert.ok(!/readUpload|requireStorage|multipart/.test(routes.replace(/\/\*[\s\S]*?\*\//g, '')));
    const validator = readFileSync(new URL('../src/public/public.validator.js', import.meta.url), 'utf8');
    assert.ok((validator.match(/\.strict\(\)/g) ?? []).length >= 2, 'public form bodies are strict');
  });
});
