import { env } from '../config/env.js';
import { queueSecurityEmail } from '../notifications/delivery.service.js';
import { getEmailProvider } from '../notifications/providers/index.js';
import { logger } from '../utils/logger.js';
import { passwordResetEmail, emailVerificationEmail } from '../templates/authEmails.js';

const linkOf = (kind, token) =>
  `${env.CLIENT_URL}/${kind === 'password_reset' ? 'reset-password' : 'verify-email'}?token=${encodeURIComponent(token)}`;

/**
 * Hands a one-time account link to the delivery queue. The request never waits on an email provider and never fakes
 * success: `queued` is true only when a provider is configured and a delivery row was written (the worker sends it).
 * The only place a raw link is ever printed is the development-only DEV_LOG_AUTH_LINKS switch, which env.js refuses in production.
 */
export async function sendAuthLink({ user, kind, token, expiresAt }) {
  const link = linkOf(kind, token);
  let result;
  try {
    result = await queueSecurityEmail({ user, kind, link, tokenFingerprint: token, expiresAt });
  } catch (error) {
    logger.warn(`Could not queue a ${kind} email: ${error.message}`);
    result = { queued: false, reason: 'queue_error' };
  }
  if (!result.queued && env.DEV_LOG_AUTH_LINKS && !env.isProduction) {
    const message = kind === 'password_reset' ? passwordResetEmail({ firstName: user.firstName, token }) : emailVerificationEmail({ firstName: user.firstName, token });
    logger.info(`[development only] email not sent (no provider). To: ${user.email}\nSubject: ${message.subject}\n${message.text}`);
  }
  return { queued: result.queued };
}

/** True when an email provider is configured. Depends on server configuration only, never on a particular account. */
export const isEmailConfigured = () => Boolean(getEmailProvider());
