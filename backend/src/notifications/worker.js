import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { processDueDeliveries, purgeOldClaims } from './delivery.service.js';
import { getDeliveryStatus } from './providers/index.js';

/** The delivery worker process. Start with `npm run worker` (or `node scripts/run-worker.js`). Safe to run more than one. */
export async function runWorker() {
  await connectDatabase();
  const status = getDeliveryStatus();
  logger.info(`Delivery worker started. Email: ${status.email.provider ?? 'not configured'}. SMS: ${status.sms.provider ?? 'not configured'}.`);

  let stopping = false;
  let wake;
  const stop = (reason) => {
    if (stopping) return;
    stopping = true;
    logger.info(`Delivery worker stopping (${reason}).`);
    wake?.();
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  let lastPurge = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastPurge > 3600 * 1000) {
        lastPurge = Date.now();
        await purgeOldClaims();
      }
      const handled = await processDueDeliveries();
      if (handled > 0) logger.info(`Delivery worker handled ${handled} delivery row(s).`);
      if (handled >= env.DELIVERY_BATCH_SIZE) continue;
    } catch (error) {
      logger.error(`Delivery worker pass failed: ${error.message}`);
    }
    await new Promise((resolve) => {
      wake = resolve;
      setTimeout(resolve, env.DELIVERY_WORKER_POLL_SECONDS * 1000).unref?.();
    });
  }
  await disconnectDatabase();
  process.exit(0);
}
