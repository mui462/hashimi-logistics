export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_BYTES = 72;

/** Passwords of 10+ characters that are still among the most commonly used (letters/digits only). */
const COMMON_PASSWORDS = new Set([
  '1234567890',
  '12345678910',
  '0123456789',
  '9876543210',
  'qwertyuiop',
  'qwerty12345',
  'qwerty123456',
  '1qaz2wsx3edc',
  '1q2w3e4r5t',
  'abcdefghij',
  'abcd123456',
  'password123',
  'password1234',
  'password12345',
  'passwordpassword',
  'passw0rd123',
  'iloveyou123',
  'welcome123',
  'welcome1234',
  'changeme123',
  'letmein1234',
  'administrator',
  'admin123456',
  'trustno1234',
  'football123',
  'baseball123',
  'superman123',
  'monkey12345',
  'dragon12345',
]);

const MIN_CONTEXT_LENGTH = 4;

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Returns a human-readable problem, or null when the password is acceptable.
 * bcrypt only uses the first 72 BYTES, so longer passwords are rejected instead of silently truncated.
 * `context` (email, firstName, lastName) stops people using their own details as a password.
 */
export function checkPassword(password, context = {}) {
  if (typeof password !== 'string') return 'Password must be text.';
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    return `Password must be at most ${PASSWORD_MAX_BYTES} bytes (fewer characters if it uses accents or symbols).`;
  }
  if (password.trim().length === 0) return 'Password cannot be only spaces.';
  if (/^(.)\1+$/u.test(password)) return 'Password cannot be one character repeated.';

  const simplified = normalize(password);
  if (COMMON_PASSWORDS.has(simplified)) {
    return 'That password is too common. Choose something harder to guess.';
  }

  const emailName = normalize(String(context.email ?? '').split('@')[0]);
  if (emailName.length >= MIN_CONTEXT_LENGTH && simplified.includes(emailName)) {
    return 'Password cannot contain your email address.';
  }
  for (const name of [context.firstName, context.lastName]) {
    const part = normalize(name);
    if (part.length >= MIN_CONTEXT_LENGTH && simplified === part) {
      return 'Password cannot be your name.';
    }
  }
  return null;
}
