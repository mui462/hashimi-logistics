import { User } from '../models/User.js';
import { recordActivity } from './activity.service.js';
import { hashPassword, verifyPassword } from './password.service.js';
import { ApiError } from '../utils/ApiError.js';
import { checkPassword } from '../utils/passwordPolicy.js';

/**
 * Changes the signed-in user's password. Shared by the customer and carrier portals so the security logic exists once.
 * The current password must be correct; the new one goes through the same policy as registration and reset.
 * Every other session is ended (token version bump) and the caller receives the updated user so the controller can
 * issue a fresh cookie for this browser. `auditPrefix` only names the audit actions ("customer" or "carrier").
 */
export async function changeOwnPassword(owner, { currentPassword, password }, context, auditPrefix) {
  const user = await User.findById(owner.userId).select('+passwordHash +tokenVersion');
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    await recordActivity({
      userId: owner.userId,
      action: `${auditPrefix}.password.change_failed`,
      module: 'auth',
      description: 'Password change refused: current password was incorrect.',
      context,
    });
    throw ApiError.validation([{ field: 'currentPassword', message: 'Your current password is incorrect.' }]);
  }

  const problem = checkPassword(password, user);
  if (problem) throw ApiError.validation([{ field: 'password', message: problem }]);

  // The filter repeats the token version, so two simultaneous changes cannot both succeed.
  const result = await User.updateOne(
    { _id: user._id, tokenVersion: user.tokenVersion },
    {
      $set: { passwordHash: await hashPassword(password), passwordChangedAt: new Date() },
      $inc: { tokenVersion: 1 },
      // A reset link requested before this change must not stay usable afterwards.
      $unset: { passwordResetTokenHash: '', passwordResetExpires: '' },
    }
  );
  if (result.modifiedCount !== 1) {
    throw ApiError.conflict('Your session changed while updating the password. Please try again.');
  }
  const updated = await User.findById(user._id).select('+tokenVersion');

  await recordActivity({
    userId: owner.userId,
    action: `${auditPrefix}.password.changed`,
    module: 'auth',
    description: 'Password changed. All other sessions were signed out.',
    context,
  });
  return updated;
}
