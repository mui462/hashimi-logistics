import { randomUUID } from 'node:crypto';
import { FinancialLock } from '../models/FinancialLock.js';
import { ApiError } from '../utils/ApiError.js';

const DEFAULT_TTL_MS = 30_000;
const DEFAULT_WAIT_MS = 6_000;
const RETRY_MS = 20;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mutual exclusion for one financial record (an invoice or a carrier payable) across processes.
 * Acquiring inserts a row whose primary key is the lock key, so exactly one concurrent caller can win; this does not rely
 * on conditional-update isolation, which FerretDB does not guarantee. A lock whose holder crashed expires after the TTL and
 * is then removed by the next caller. Released by token so a slow holder can never free someone else's lock.
 */
export async function withFinancialLock(key, work, { ttlMs = DEFAULT_TTL_MS, waitMs = DEFAULT_WAIT_MS } = {}) {
  const token = randomUUID();
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      await FinancialLock.create({ _id: key, token, expiresAt: new Date(Date.now() + ttlMs) });
      break;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const held = await FinancialLock.findById(key).lean();
      if (held && held.expiresAt.getTime() <= Date.now()) {
        await FinancialLock.deleteOne({ _id: key, token: held.token });
        continue;
      }
      if (Date.now() >= deadline) {
        throw ApiError.conflict('Another financial update is in progress for this record. Please try again.', 'FINANCIAL_LOCK_BUSY');
      }
      await sleep(RETRY_MS);
    }
  }
  // Fencing: callers invoke this before each critical write. If the lock expired and someone else took it, they stop.
  const assertHeld = async () => {
    const row = await FinancialLock.findById(key).lean();
    if (!row || row.token !== token || row.expiresAt.getTime() <= Date.now()) {
      throw ApiError.conflict('The financial update took too long and was cancelled. Reload and try again.', 'FINANCIAL_LOCK_LOST');
    }
  };
  try {
    return await work({ assertHeld });
  } finally {
    await FinancialLock.deleteOne({ _id: key, token }).catch(() => {});
  }
}
