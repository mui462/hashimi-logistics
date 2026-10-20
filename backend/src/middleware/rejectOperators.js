import { ApiError } from '../utils/ApiError.js';

const MAX_DEPTH = 8;

function findOperatorKey(value, depth = 0) {
  if (!value || typeof value !== 'object') return null;
  if (depth > MAX_DEPTH) return '(nesting too deep)';
  for (const [key, child] of Object.entries(value)) {
    if (/[$.[\]]/.test(key)) return key;
    const nested = findOperatorKey(child, depth + 1);
    if (nested) return nested;
  }
  return null;
}

/**
 * Refuses any query string or JSON body whose keys look like database operators ($where, $ne, $regex, $or, $in ...),
 * dotted paths or bracketed operator syntax (status[$ne]), before validation or any query is built. Validators are strict allow-lists too; this gives operator
 * attempts a clear, uniform 400 and keeps them out of the query layer even if a future schema loosens.
 */
export function rejectOperators(req, _res, next) {
  const offending = findOperatorKey(req.query) ?? findOperatorKey(req.body);
  if (offending) {
    throw new ApiError(400, 'Query operators are not accepted.', [{ field: offending, message: 'This key is not allowed.' }], 'OPERATOR_NOT_ALLOWED');
  }
  next();
}
