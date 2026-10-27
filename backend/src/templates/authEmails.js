import { env } from '../config/env.js';

export function passwordResetEmail({ firstName, token }) {
  const link = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Reset your HASHIMI LOGISTICS LLC password',
    text:
      `Hello ${firstName},\n\n` +
      `Use this link to choose a new password. It expires in ${env.PASSWORD_RESET_TTL_MINUTES} minutes and works once:\n\n` +
      `${link}\n\n` +
      'If you did not request this, you can ignore this message. Your password has not changed.',
  };
}

export function emailVerificationEmail({ firstName, token }) {
  const link = `${env.CLIENT_URL}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    subject: 'Confirm your email address for HASHIMI LOGISTICS LLC',
    text:
      `Hello ${firstName},\n\n` +
      `Confirm your email address with this link. It expires in ${env.EMAIL_VERIFICATION_TTL_HOURS} hours and works once:\n\n` +
      `${link}\n\n` +
      'If you did not create this account, you can ignore this message.',
  };
}
