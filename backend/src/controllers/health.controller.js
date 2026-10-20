import { getDatabaseStatus } from '../config/database.js';
import { sendSuccess } from '../utils/apiResponse.js';

/** Liveness: the process is up. Reveals nothing about the deployment (no environment name, no versions). */
export function getHealth(_req, res) {
  sendSuccess(res, {
    message: 'API is running.',
    data: { status: 'ok', timestamp: new Date().toISOString(), database: getDatabaseStatus() },
  });
}

/** Readiness: 200 only while the database connection is up, otherwise 503 so a load balancer stops sending traffic. */
export function getReadiness(_req, res) {
  const database = getDatabaseStatus();
  const ready = database === 'connected';
  res.status(ready ? 200 : 503).json({
    success: ready,
    message: ready ? 'API is ready.' : 'API is not ready.',
    data: { status: ready ? 'ready' : 'not_ready', database },
  });
}
