import { ActivityLog } from '../models/ActivityLog.js';
import { logger } from '../utils/logger.js';

const MAX_USER_AGENT_LENGTH = 500;

function readContext(req) {
  let IPAddress;
  try {
    IPAddress = req.ip;
  } catch {
    // On serverless hosts req.socket is gone once the body has been read, and req.ip then throws.
    IPAddress = undefined;
  }
  return { IPAddress, userAgent: req.get('user-agent')?.slice(0, MAX_USER_AGENT_LENGTH) };
}

/** Middleware: remembers the caller's address and user agent before any body is read (see requestContext). */
export function captureRequestContext(req, _res, next) {
  req.auditContext = readContext(req);
  next();
}

export function requestContext(req) {
  return req.auditContext ?? readContext(req);
}

/**
 * Writes an audit entry. Never throws: a logging problem must not break sign-in or registration.
 * Callers must not pass secrets; the ActivityLog model additionally rejects secret-looking metadata keys.
 */
export async function recordActivity({ userId, action, module = 'auth', entityId, description, metadata, context = {} }) {
  try {
    await ActivityLog.create({
      userId,
      action,
      module,
      entityId,
      description,
      metadata,
      IPAddress: context.IPAddress,
      userAgent: context.userAgent,
    });
  } catch (error) {
    logger.warn(`Could not record activity "${action}": ${error.message}`);
  }
}
