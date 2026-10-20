import { Carrier } from '../models/Carrier.js';
import { Load } from '../models/Load.js';
import { User } from '../models/User.js';
import { selectionFor } from '../models/accessProjections.js';
import { ApiError } from '../utils/ApiError.js';
import { ACCOUNT_TYPES } from '../utils/constants.js';
import { evaluateCarrierForLoad, removedCarrierIdsFrom } from './carrierEligibility.service.js';

const MAX_CANDIDATES = 500;
const MAX_EXCLUDED_LISTED = 50;

const brief = (carrier) => ({
  carrierId: String(carrier._id),
  companyName: carrier.companyName,
  status: carrier.status,
  authorityStatus: carrier.authorityStatus,
  complianceStatus: carrier.complianceStatus,
  equipmentTypes: carrier.equipmentTypes ?? [],
  crossBorderCapability: Boolean(carrier.crossBorderCapability),
});

/**
 * Ranks carriers for one load. Archived carriers never appear; suspended and otherwise ineligible carriers appear
 * only in `excluded`, with reasons, so staff can see why a familiar name is missing. Result shape:
 *   { loadId, loadNumber, evaluatedAt, criteria, matches: [...ranked], excluded: [...], counts, truncated }
 */
export async function findCarrierMatches(loadId, { now = new Date() } = {}) {
  const load = await Load.findOne({ _id: loadId }).active().select(`${selectionFor('Load', ACCOUNT_TYPES.SUPER_ADMIN)}`).lean();
  if (!load) throw ApiError.notFound('Load not found.', 'LOAD_NOT_FOUND');

  const candidates = await Carrier.find({ archivedAt: null })
    .select(selectionFor('Carrier', ACCOUNT_TYPES.SUPER_ADMIN))
    .sort({ companyName: 1, _id: 1 })
    .limit(MAX_CANDIDATES + 1)
    .lean();
  const truncated = candidates.length > MAX_CANDIDATES;
  const carriers = candidates.slice(0, MAX_CANDIDATES);

  const users = await User.find({ _id: { $in: carriers.map((carrier) => carrier.userId) } }).select('isActive archivedAt').lean();
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const removedCarrierIds = removedCarrierIdsFrom(load);

  const matches = [];
  const excluded = [];
  for (const carrier of carriers) {
    const verdict = evaluateCarrierForLoad({ load, carrier, user: userById.get(String(carrier.userId)), removedCarrierIds, now });
    if (verdict.eligible) {
      matches.push({ ...brief(carrier), score: verdict.score, coverage: verdict.coverage, eligible: true });
    } else {
      excluded.push({ ...brief(carrier), eligible: false, reasons: verdict.reasons });
    }
  }
  matches.sort((a, b) => b.score - a.score || a.companyName.localeCompare(b.companyName));

  return {
    loadId: String(load._id),
    loadNumber: load.loadNumber,
    evaluatedAt: now.toISOString(),
    criteria: {
      equipmentType: load.equipmentType ?? null,
      crossBorder: Boolean(load.crossBorder),
      originCountry: load.origin?.country ?? null,
      destinationCountry: load.destination?.country ?? null,
      pickupState: load.origin?.state ?? null,
      pickupCity: load.origin?.city ?? null,
    },
    matches,
    excluded: excluded.slice(0, MAX_EXCLUDED_LISTED),
    counts: { evaluated: carriers.length, eligible: matches.length, excluded: excluded.length },
    truncated,
  };
}

/** Eligibility of one named carrier for one load, using fresh database reads. Used by assignment and reassignment. */
export async function checkCarrierForLoad(load, carrierId, { now = new Date() } = {}) {
  const carrier = await Carrier.findOne({ _id: carrierId })
    .select(selectionFor('Carrier', ACCOUNT_TYPES.SUPER_ADMIN))
    .lean();
  if (!carrier) throw ApiError.notFound('Carrier not found.', 'CARRIER_NOT_FOUND');
  const user = await User.findById(carrier.userId).select('isActive archivedAt').lean();
  return { carrier, verdict: evaluateCarrierForLoad({ load, carrier, user, removedCarrierIds: removedCarrierIdsFrom(load), now }) };
}
