import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { recordActivity } from './activity.service.js';
import { sendAuthLink } from './email.service.js';
import { generateToken, hashToken } from './secureToken.service.js';

const HOUR_MS = 60 * 60 * 1000;

/** Creates a fresh one-time token (replacing any earlier one) and tries to email it. */
export async function issueEmailVerification(user, context) {
  const { token, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + env.EMAIL_VERIFICATION_TTL_HOURS * HOUR_MS);
  await User.updateOne({ _id: user._id }, { $set: { emailVerificationTokenHash: tokenHash, emailVerificationExpires: expiresAt } });

  const result = await sendAuthLink({ user, kind: 'email_verification', token, expiresAt });
  await recordActivity({
    userId: user._id,
    action: 'auth.email_verification.requested',
    description: 'Email verification requested.',
    metadata: { queued: result.queued },
    context,
  });
  return { delivered: result.queued };
}

export async function verifyEmail(token, context) {
  const tokenHash = hashToken(token);
  const user = await User.findOne({
    emailVerificationTokenHash: tokenHash,
    emailVerificationExpires: { $gt: new Date() },
    isActive: true,
  });
  if (!user) {
    throw ApiError.badRequest('This verification link is invalid or has expired.');
  }

  // The filter repeats the token hash, so two simultaneous requests cannot both succeed (single use).
  const result = await User.updateOne(
    { _id: user._id, emailVerificationTokenHash: tokenHash },
    {
      $set: { isEmailVerified: true },
      $unset: { emailVerificationTokenHash: '', emailVerificationExpires: '' },
    }
  );
  if (result.modifiedCount !== 1) {
    throw ApiError.badRequest('This verification link is invalid or has expired.');
  }

  await recordActivity({
    userId: user._id,
    action: 'auth.email.verified',
    description: 'Email address verified.',
    context,
  });
}

export async function resendEmailVerification(user, context) {
  if (user.isEmailVerified) {
    return { alreadyVerified: true, delivered: false };
  }
  const { delivered } = await issueEmailVerification(user, context);
  return { alreadyVerified: false, delivered };
}
