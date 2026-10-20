/** Authentication responses carry personal data and must never be cached by browsers or proxies. */
export function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}
