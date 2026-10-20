/**
 * Normalizes a stored phone value to E.164, or returns null when it cannot be trusted. Existing records are never rewritten
 * or rejected by this: it only decides whether an SMS may be attempted. Ten-digit numbers (and 1 + ten digits) are treated as
 * North American; anything else must already start with + and country code.
 */
export function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (hasPlus) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  if (digits.length === 10 && /^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1') && /^[2-9]\d{2}[2-9]\d{6}$/.test(digits.slice(1))) return `+${digits}`;
  return null;
}

export const isE164 = (value) => typeof value === 'string' && /^\+[1-9]\d{7,14}$/.test(value);
