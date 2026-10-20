import { ApiError } from '../utils/ApiError.js';

/**
 * For actions that create or commit something (a quote request, accepting a quote): the signed-in user must have confirmed
 * their email address. Read from the database user that `authenticate` loaded, never from the request.
 */
export function requireVerifiedEmail(req, _res, next) {
  if (!req.user) throw ApiError.unauthorized();
  if (!req.user.isEmailVerified) {
    throw new ApiError(403, 'Please confirm your email address to use this feature. You can resend the confirmation email from your profile.', [], 'EMAIL_NOT_VERIFIED');
  }
  next();
}
