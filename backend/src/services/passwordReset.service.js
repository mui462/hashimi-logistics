import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { checkPassword } from '../utils/passwordPolicy.js';
import { recordActivity } from './activity.service.js';
import { sendAuthLink } from './email.service.js';
import { hashPassword } from './password.service.js';
import { generateToken, hashToken } from './secureToken.service.js';

const MINUTE_MS = 60 * 1000;

/**
 * Always resolves the same way whether or not the account exists, so the response cannot be used
 * to discover which emails are registered. Only active accounts actually receive a token.
 */
export async function requestPasswordReset(email, context) {
  const user = await User.findOne({ email, isActive: true });
  if (!user) return;

  const { token, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * MINUTE_MS);
  await User.updateOne({ _id: user._id }, { $set: { passwordResetTokenHash: tokenHash, passwordResetExpires: expiresAt } });

  const result = await sendAuthLink({ user, kind: 'password_reset', token, expiresAt });
  await recordActivity({
    userId: user._id,
    action: 'auth.password_reset.requested',
    description: 'Password reset requested.',
    metadata: { queued: result.queued },
    context,
  });
}

export async function resetPassword({ token, password }, context) {
  const tokenHash = hashToken(token);
  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpires: { $gt: new Date() },
    isActive: true,
  });
  if (!user) {
    throw ApiError.badRequest('This reset link is invalid or has expired.');
  }

  const problem = checkPassword(password, user);
  if (problem) {
    throw ApiError.validation([{ field: 'password', message: problem }]);
  }

  // The filter repeats the token hash, so two simultaneous requests cannot both succeed (single use).
  const result = await User.updateOne(
    { _id: user._id, passwordResetTokenHash: tokenHash },
    {
      $set: { passwordHash: await hashPassword(password), passwordChangedAt: new Date() },
      $inc: { tokenVersion: 1 },
      $unset: { passwordResetTokenHash: '', passwordResetExpires: '' },
    }
  );
  if (result.modifiedCount !== 1) {
    throw ApiError.badRequest('This reset link is invalid or has expired.');
  }

  await recordActivity({
    userId: user._id,
    action: 'auth.password_reset.completed',
    description: 'Password reset completed. All sessions were signed out.',
    context,
  });
}
