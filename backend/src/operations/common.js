import { ApiError } from '../utils/ApiError.js';

export const pagination = (page, limit, total) => ({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
export const skipFor = (page, limit) => (page - 1) * limit;
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));

/** A short, city-level lane label for notifications: never a street, facility or contact. */
export const laneLabel = (load) => {
  const place = (stop) => [stop?.city, stop?.state].filter(Boolean).join(', ');
  return `${place(load.origin)} to ${place(load.destination)}`;
};

/** Writes guarded by the status the caller read: if someone else moved the record first, nothing is modified. */
export function assertApplied(result, message = 'This record was changed by someone else. Reload it and try again.') {
  if (result.matchedCount !== 1) throw ApiError.conflict(message, 'STALE_STATE');
}
