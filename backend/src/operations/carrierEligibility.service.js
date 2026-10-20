import { regionCoverage } from './geo.js';

/**
 * Pure eligibility rules: given a load, a carrier profile, its login user and the carriers already removed from the
 * load, decide whether the carrier may be offered or assigned that load, and why not. No database access here, so the
 * same rules serve the carrier's own board, the matching list and the assignment guard.
 *
 * Reason codes are stable; messages are for the Super Admin. A carrier's own board only ever receives the boolean.
 */

export const REASONS = Object.freeze({
  CARRIER_ARCHIVED: 'The carrier record is archived.',
  USER_INACTIVE: 'The carrier\'s login account is deactivated.',
  CARRIER_NOT_ACTIVE: 'The carrier account is not active.',
  AUTHORITY_NOT_ACTIVE: 'The carrier\'s operating authority is not active.',
  COMPLIANCE_NOT_APPROVED: 'The carrier\'s compliance is not approved.',
  INSURANCE_EXPIRED: 'The carrier\'s insurance has expired.',
  EQUIPMENT_MISMATCH: 'The carrier does not run the equipment this load needs.',
  NO_SERVICE_AREA: 'The carrier has not declared any service area.',
  OUTSIDE_SERVICE_AREA: 'The pickup location is outside the carrier\'s declared service area.',
  CROSS_BORDER_NOT_PERMITTED: 'The carrier is not set up for cross-border freight.',
  PREVIOUSLY_UNASSIGNED: 'The carrier was already removed from this load.',
  ALREADY_ASSIGNED: 'The carrier is already assigned to this load.',
});

const reason = (code) => ({ code, message: REASONS[code] });
const COVERAGE_POINTS = { city: 20, zip: 18, state: 15, country: 8, wildcard: 5 };

export function evaluateCarrierForLoad({ load, carrier, user, removedCarrierIds = [], now = new Date() }) {
  const reasons = [];
  const carrierId = String(carrier._id);

  if (carrier.archivedAt) reasons.push(reason('CARRIER_ARCHIVED'));
  if (!user || user.isActive === false || user.archivedAt) reasons.push(reason('USER_INACTIVE'));
  if (carrier.status !== 'active') reasons.push(reason('CARRIER_NOT_ACTIVE'));
  if (carrier.authorityStatus !== 'active') reasons.push(reason('AUTHORITY_NOT_ACTIVE'));
  if (carrier.complianceStatus !== 'approved') reasons.push(reason('COMPLIANCE_NOT_APPROVED'));
  if (carrier.insurance?.expirationDate && new Date(carrier.insurance.expirationDate) < now) {
    reasons.push(reason('INSURANCE_EXPIRED'));
  }

  if (load.equipmentType && !(carrier.equipmentTypes ?? []).includes(load.equipmentType)) {
    reasons.push(reason('EQUIPMENT_MISMATCH'));
  }

  const crossBorder = Boolean(load.crossBorder) || (load.origin?.country && load.destination?.country && load.origin.country !== load.destination.country);
  if (crossBorder && !carrier.crossBorderCapability) reasons.push(reason('CROSS_BORDER_NOT_PERMITTED'));

  const regions = carrier.operatingRegions ?? [];
  const pickupCoverage = regionCoverage(regions, load.origin);
  const deliveryCoverage = regionCoverage(regions, load.destination);
  if (regions.length === 0) reasons.push(reason('NO_SERVICE_AREA'));
  else if (!pickupCoverage) reasons.push(reason('OUTSIDE_SERVICE_AREA'));

  if (load.carrierId && String(load.carrierId) === carrierId) reasons.push(reason('ALREADY_ASSIGNED'));
  if (removedCarrierIds.map(String).includes(carrierId)) reasons.push(reason('PREVIOUSLY_UNASSIGNED'));

  const eligible = reasons.length === 0;
  let score = 0;
  if (eligible) {
    score = 50 + COVERAGE_POINTS[pickupCoverage] + (deliveryCoverage ? Math.round(COVERAGE_POINTS[deliveryCoverage] / 2) : 0);
    if (crossBorder) score += 5;
    if (typeof carrier.rating === 'number') score += Math.round(carrier.rating * 2);
  }

  return {
    eligible,
    reasons,
    score,
    coverage: { pickup: pickupCoverage, delivery: deliveryCoverage },
  };
}

/** Convenience for the carrier's own board: pickup coverage and the rules above, with no explanation exposed. */
export const isEligible = (input) => evaluateCarrierForLoad(input).eligible;

/** The carriers taken off a load earlier (from assignmentHistory), so they are not offered it again. */
export const removedCarrierIdsFrom = (load) =>
  (load.assignmentHistory ?? []).filter((entry) => entry.unassignedAt).map((entry) => String(entry.carrierId));
