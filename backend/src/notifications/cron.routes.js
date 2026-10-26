import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { noStore } from '../middleware/noStore.js';
import { ApiError } from '../utils/ApiError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { processDueDeliveries, purgeOldClaims } from './delivery.service.js';

/**
 * Delivery runner for hosts without a long-running process (Vercel). A scheduler (GitHub Actions, cron-job.org or Vercel Cron)
 * calls this with `Authorization: Bearer <CRON_SECRET>`; it sends whatever is due, then returns. The same claim/lock rules as
 * `npm run worker` apply, so overlapping calls never send a row twice. Without CRON_SECRET the endpoint does not exist.
 */
const WORK_BUDGET_MS = 25_000;

const secretMatches = (header, secret) => {
  const given = Buffer.from(String(header ?? '').replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

/** `run` and `secret` are injectable so the authorisation can be tested without a database. */
export function createCronRouter({ run = runDeliveries, secret = () => env.CRON_SECRET } = {}) {
  const router = Router();
  const handler = async (req, res) => {
    const expected = secret();
    if (!expected) throw ApiError.notFound('Not found.');
    if (!secretMatches(req.get('authorization'), expected)) throw ApiError.unauthorized('Invalid cron credentials.');
    sendSuccess(res, { data: await run() });
  };
  // Vercel Cron sends GET; other schedulers may prefer POST.
  router.get('/deliveries/run', noStore, handler);
  router.post('/deliveries/run', noStore, handler);
  return router;
}

/** Sends due rows in batches until none are left or the time budget is used. Returns counts only. */
export async function runDeliveries({ budgetMs = WORK_BUDGET_MS } = {}) {
  const startedAt = Date.now();
  let handled = 0;
  while (Date.now() - startedAt < budgetMs) {
    const batch = await processDueDeliveries();
    handled += batch;
    if (batch < env.DELIVERY_BATCH_SIZE) break;
  }
  await purgeOldClaims();
  return { handled, durationMs: Date.now() - startedAt };
}

export default createCronRouter();
