import { env } from '../config/env.js';

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.COOKIE_SAME_SITE,
    path: '/',
  };
}

export function setAuthCookie(res, token, expiresAt) {
  res.cookie(env.COOKIE_NAME, token, { ...baseCookieOptions(), expires: expiresAt });
}

export function clearAuthCookie(res) {
  res.clearCookie(env.COOKIE_NAME, baseCookieOptions());
}
