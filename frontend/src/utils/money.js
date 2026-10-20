/** "1,234.5" -> 123450. Returns null for anything that is not a plain positive amount with at most two decimals. */
export function dollarsToCents(text) {
  const clean = String(text ?? '').trim().replace(/,/g, '');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, fraction = ''] = clean.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return cents > 0 && Number.isSafeInteger(cents) ? cents : null;
}

export const centsToDollars = (cents) => (cents == null ? '' : (cents / 100).toFixed(2));
