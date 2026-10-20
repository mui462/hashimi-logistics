import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { verifyAccessToken } from '../services/token.service.js';
import { ApiError } from '../utils/ApiError.js';

const SESSION_ENDED_MESSAGE = 'Your session is no longer valid. Please sign in again.';

/**
 * Requires a valid session cookie and loads the current user from the database on every request,
 * so deactivation, role changes, logout, and password resets take effect immediately.
 * Every failure is the same generic 401; nothing about the token's contents is revealed.
 */
export async function authenticate(req, _res, next) {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) {
    throw ApiError.unauthorized();
  }

  const claims = verifyAccessToken(token);
  const user = await User.findById(claims.userId).select('+tokenVersion');

  const sessionStillValid =
    user && user.isActive && user.role === claims.role && user.tokenVersion === claims.tokenVersion;
  if (!sessionStillValid) {
    throw ApiError.unauthorized(SESSION_ENDED_MESSAGE);
  }

  req.user = user;
  next();
}
