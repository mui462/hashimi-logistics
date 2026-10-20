import { resolveOwner } from '../services/ownership.service.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * After authenticate: attaches req.owner = { role, userId, customerId? | carrierId? }.
 * Controllers scope every query with ownershipFilter(req.owner) and set new records' owner from
 * req.owner, never from req.body.
 */
export async function requireOwnerContext(req, _res, next) {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  req.owner = await resolveOwner(req.user);
  next();
}
