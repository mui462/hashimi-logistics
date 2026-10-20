import { ApiError } from '../utils/ApiError.js';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_VALUES } from '../utils/constants.js';

/**
 * Role gate. There are only three roles and no permission system. Passing an unknown role is a
 * programming error, so it fails when the route is defined, not silently at request time.
 */
export function requireRole(...allowedRoles) {
  const unknown = allowedRoles.filter((role) => !ACCOUNT_TYPE_VALUES.includes(role));
  if (allowedRoles.length === 0 || unknown.length > 0) {
    throw new Error(`requireRole received invalid roles: ${unknown.join(', ') || '(none)'}`);
  }

  return (req, _res, next) => {
    if (!req.user) {
      throw ApiError.unauthorized();
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw ApiError.forbidden();
    }
    next();
  };
}

export const requireSuperAdmin = requireRole(ACCOUNT_TYPES.SUPER_ADMIN);
export const requireCustomer = requireRole(ACCOUNT_TYPES.CUSTOMER);
export const requireCarrier = requireRole(ACCOUNT_TYPES.CARRIER);
