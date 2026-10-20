const DECIMAL_PATTERN = /^-?\d+(\.\d{1,2})?$/;

/**
 * Converts a decimal amount ("19.99" or 19.99) into integer minor units (1999).
 * Works on the decimal text, never on float multiplication, so 1.005 * 100 style
 * errors cannot occur. Amounts with more than two decimal places are rejected.
 */
export function toMinorUnits(amount) {
  const text = String(amount).trim();
  if (!DECIMAL_PATTERN.test(text)) {
    throw new RangeError(`"${text}" is not a valid amount with at most two decimal places.`);
  }
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`"${text}" is too large to store safely.`);
  }
  return negative ? -minor : minor;
}

export function fromMinorUnits(minor) {
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError('Minor-unit amounts must be safe integers.');
  }
  const negative = minor < 0;
  const absolute = String(Math.abs(minor)).padStart(3, '0');
  const formatted = `${absolute.slice(0, -2)}.${absolute.slice(-2)}`;
  return negative ? `-${formatted}` : formatted;
}
