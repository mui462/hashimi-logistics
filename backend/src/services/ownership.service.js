import { Carrier } from '../models/Carrier.js';
import { Customer } from '../models/Customer.js';
import { ApiError } from '../utils/ApiError.js';
import { ACCOUNT_TYPES } from '../utils/constants.js';

const BLOCKED_PROFILE_STATUSES = ['suspended', 'inactive'];

/**
 * Who is making this request, and which records are theirs?
 *
 * The customerId / carrierId always comes from the profile linked to the authenticated user, read
 * from the database. It is never taken from a request body, query string, or URL.
 * A "pending" carrier can still sign in and finish onboarding; later phases decide what pending
 * carriers may do with loads.
 */
export async function resolveOwner(user) {
  const owner = { role: user.role, userId: user._id };

  if (user.role === ACCOUNT_TYPES.SUPER_ADMIN) {
    return owner;
  }

  const Profile = user.role === ACCOUNT_TYPES.CUSTOMER ? Customer : Carrier;
  const profile = await Profile.findOne({ userId: user._id }).active().select('_id status');
  if (!profile) {
    throw ApiError.forbidden('No business profile is linked to this account.');
  }
  if (BLOCKED_PROFILE_STATUSES.includes(profile.status)) {
    throw ApiError.forbidden('This account is not active. Please contact support.');
  }

  if (user.role === ACCOUNT_TYPES.CUSTOMER) {
    owner.customerId = profile._id;
  } else {
    owner.carrierId = profile._id;
  }
  return owner;
}

/** The query filter that limits a collection to what this owner may see. Super Admin: everything. */
export function ownershipFilter(owner) {
  if (owner.customerId) return { customerId: owner.customerId };
  if (owner.carrierId) return { carrierId: owner.carrierId };
  if (owner.role === ACCOUNT_TYPES.SUPER_ADMIN) return {};
  throw ApiError.forbidden();
}

/**
 * Confirms a loaded record belongs to the owner. A foreign record is reported as "not found",
 * not "forbidden", so one customer cannot learn that another customer's record exists.
 */
export function assertOwnsRecord(owner, record) {
  if (!record) throw ApiError.notFound();
  if (owner.role === ACCOUNT_TYPES.SUPER_ADMIN) return record;

  const ownedByCustomer = owner.customerId && String(record.customerId) === String(owner.customerId);
  const ownedByCarrier = owner.carrierId && String(record.carrierId) === String(owner.carrierId);
  if (!ownedByCustomer && !ownedByCarrier) throw ApiError.notFound();
  return record;
}
