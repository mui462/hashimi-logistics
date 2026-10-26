import { logger } from './logger.js';

let scheduled = false;

/**
 * On Vercel a serverless function is frozen as soon as it has answered. This keeps it alive until `task` finishes, after the
 * response has already been sent, so the visitor never waits for it. Everywhere else (local development, tests, a normal Node
 * server) it does nothing: a long-running process has its own worker, and tests expect queued rows to stay queued.
 * Calls made while one is already scheduled are folded into it.
 */
export function runAfterResponse(task) {
  if (!process.env.VERCEL || scheduled) return;
  scheduled = true;
  import('@vercel/functions')
    .then(({ waitUntil }) =>
      waitUntil(
        Promise.resolve()
          .then(task)
          .catch((error) => logger.warn(`Background task failed: ${error.message}`))
          .finally(() => { scheduled = false; })
      )
    )
    .catch(() => { scheduled = false; });
}
