import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defense in depth for cookie authentication. Browsers attach an Origin header to cross-site POST/PUT/PATCH/DELETE
 * requests; if it is present and is not the configured frontend, the request is refused even though the cookie would
 * have been sent (for example from a sibling subdomain, which SameSite=Lax does not stop).
 * This is not a complete CSRF system. Non-browser clients send no Origin and are unaffected.
 */
export function requireTrustedOrigin(req, _res, next) {
  const origin = req.get('origin');
  if (!SAFE_METHODS.has(req.method) && origin && origin !== env.CLIENT_URL) {
    throw ApiError.forbidden('This request origin is not allowed.');
  }
  // Fetch-metadata: browsers that support it label the relationship between the page and the API. A state-changing
  // request from another site is refused even if the Origin header was stripped. Same-site and same-origin pass.
  if (!SAFE_METHODS.has(req.method) && req.get('sec-fetch-site') === 'cross-site' && origin !== env.CLIENT_URL) {
    throw ApiError.forbidden('Cross-site requests are not allowed.');
  }
  next();
}
