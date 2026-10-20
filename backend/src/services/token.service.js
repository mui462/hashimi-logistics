import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { ACCOUNT_TYPE_VALUES } from '../utils/constants.js';

const JWT_OPTIONS = { algorithm: 'HS256', issuer: 'hashimi-logistics' };
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const INVALID_SESSION_MESSAGE = 'Your session has expired. Please sign in again.';

/**
 * The access token carries only what authentication needs:
 *   sub (user id), role, tv (token version), iss, iat, exp
 * No email, profile data, financial data, or permissions.
 */
export function signAccessToken(user) {
  const token = jwt.sign({ role: user.role, tv: user.tokenVersion ?? 0 }, env.JWT_SECRET, {
    ...JWT_OPTIONS,
    subject: user.id,
    expiresIn: env.JWT_EXPIRES_IN,
  });
  const { exp } = jwt.decode(token);
  return { token, expiresAt: new Date(exp * 1000) };
}

/** Returns { userId, role, tokenVersion } or throws a generic 401 that reveals nothing about why. */
export function verifyAccessToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [JWT_OPTIONS.algorithm],
      issuer: JWT_OPTIONS.issuer,
    });
  } catch {
    throw ApiError.unauthorized(INVALID_SESSION_MESSAGE);
  }

  const wellFormed =
    typeof payload.sub === 'string' &&
    OBJECT_ID_PATTERN.test(payload.sub) &&
    ACCOUNT_TYPE_VALUES.includes(payload.role) &&
    Number.isInteger(payload.tv) &&
    payload.tv >= 0;
  if (!wellFormed) {
    throw ApiError.unauthorized(INVALID_SESSION_MESSAGE);
  }

  return { userId: payload.sub, role: payload.role, tokenVersion: payload.tv };
}
