import { ActivityLog } from '../models/ActivityLog.js';
import { logger } from '../utils/logger.js';

const MAX_USER_AGENT_LENGTH = 500;

export function requestContext(req) {
  return {
    IPAddress: req.ip,
    userAgent: req.get('user-agent')?.slice(0, MAX_USER_AGENT_LENGTH),
  };
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
