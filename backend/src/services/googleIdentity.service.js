import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const KEY_CACHE_MS = 60 * 60 * 1000;

const unverified = () => new ApiError(401, 'Google sign-in could not be verified. Please try again or use your email and password.', [], 'GOOGLE_IDENTITY_INVALID');

async function fetchGoogleKeys() {
  const response = await fetch(GOOGLE_CERTS_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Google key request failed with ${response.status}`);
  return (await response.json()).keys ?? [];
}

let keyFetcher = fetchGoogleKeys;
let cache = { keys: [], fetchedAt: 0 };

/** Tests replace the network call with a local key set. Pass null to restore the real one. */
export function setGoogleKeyFetcherForTests(fetcher) {
  keyFetcher = fetcher ?? fetchGoogleKeys;
  cache = { keys: [], fetchedAt: 0 };
}

export const googleSignInConfigured = () => Boolean(env.GOOGLE_CLIENT_ID);

async function findKey(kid) {
  const fresh = Date.now() - cache.fetchedAt < KEY_CACHE_MS;
  let key = fresh ? cache.keys.find((candidate) => candidate.kid === kid) : null;
  if (!key) {
    cache = { keys: await keyFetcher(), fetchedAt: Date.now() };
    key = cache.keys.find((candidate) => candidate.kid === kid);
  }
  return key ?? null;
}

/**
 * Verifies a Google ID token on the server: RS256 signature against Google's published keys, issuer, audience (our client ID),
 * expiry, and a verified email. Nothing the browser sends besides the signed token is trusted. Every failure is the same 401.
 */
export async function verifyGoogleCredential(credential) {
  if (!googleSignInConfigured()) {
    throw new ApiError(503, 'Google sign-in is not available right now.', [], 'GOOGLE_NOT_CONFIGURED');
  }
  const decoded = typeof credential === 'string' ? jwt.decode(credential, { complete: true }) : null;
  if (!decoded || decoded.header.alg !== 'RS256' || !decoded.header.kid) throw unverified();

  let claims;
  try {
    const jwk = await findKey(decoded.header.kid);
    if (!jwk) throw new Error('unknown signing key');
    claims = jwt.verify(credential, crypto.createPublicKey({ key: jwk, format: 'jwk' }), {
      algorithms: ['RS256'],
      audience: env.GOOGLE_CLIENT_ID,
      issuer: GOOGLE_ISSUERS,
    });
  } catch {
    throw unverified();
  }

  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  if (typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string' || !claims.email || !emailVerified) {
    throw unverified();
  }
  return {
    subject: claims.sub,
    email: claims.email.trim().toLowerCase(),
    givenName: typeof claims.given_name === 'string' ? claims.given_name.trim() : '',
    familyName: typeof claims.family_name === 'string' ? claims.family_name.trim() : '',
    name: typeof claims.name === 'string' ? claims.name.trim() : '',
  };
}
