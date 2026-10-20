import { createHash, randomBytes } from 'node:crypto';

/**
 * One-time tokens for email verification and password reset.
 * The raw token goes to the user; only its SHA-256 hash is stored. SHA-256 is appropriate here
 * (unlike passwords) because the token is 256 bits of randomness, so it cannot be guessed or brute-forced.
 */
export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function generateToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}
