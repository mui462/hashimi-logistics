/**
 * The scheduler-driven delivery runner (/internal/deliveries/run): authorisation and the work loop, without a database.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

Object.assign(process.env, {
  NODE_ENV: 'development',
  MONGO_URI: 'mongodb://127.0.0.1:27018/cron_unit',
  JWT_SECRET: 'cron-test-secret-cron-test-secret-1234567',
  CLIENT_URL: 'http://localhost:5173',
  CRON_SECRET: 'cron-secret-cron-secret-cron-secret-1234',
});

const SECRET = process.env.CRON_SECRET;

async function serve(run, secret) {
  const { default: express } = await import('express');
  const { errorHandler } = await import('../src/middleware/errorHandler.js');
  const mod = await import('../src/notifications/cron.routes.js');
  const app = express();
  app.use('/internal', mod.createCronRouter({ run, secret: () => secret }));
  app.use(errorHandler);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  return { server, url: `http://127.0.0.1:${server.address().port}/internal/deliveries/run` };
}

describe('delivery runner endpoint', () => {
  test('the endpoint is disabled (404) when CRON_SECRET is not configured', async () => {
    const { server, url } = await serve(async () => ({ handled: 0 }), undefined);
    try { assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${SECRET}` } })).status, 404); } finally { server.close(); }
  });

  test('refuses a missing or wrong secret and never runs the work', async () => {
    let runs = 0;
    const { server, url } = await serve(async () => { runs += 1; return { handled: 1 }; }, SECRET);
    try {
      assert.equal((await fetch(url, { method: 'POST' })).status, 401);
      assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer wrong' } })).status, 401);
      assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${SECRET}x` } })).status, 401);
      assert.equal(runs, 0);
    } finally { server.close(); }
  });

  test('runs the work for the right secret on GET (Vercel Cron) and POST, and returns counts only', async () => {
    let runs = 0;
    const { server, url } = await serve(async () => { runs += 1; return { handled: 3, durationMs: 5 }; }, SECRET);
    try {
      for (const method of ['GET', 'POST']) {
        const response = await fetch(url, { method, headers: { Authorization: `Bearer ${SECRET}` } });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual((await response.json()).data, { handled: 3, durationMs: 5 });
      }
      assert.equal(runs, 2);
    } finally { server.close(); }
  });
});
