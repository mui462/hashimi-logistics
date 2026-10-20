import { Carrier } from '../models/Carrier.js';
import { CarrierApplication } from '../models/CarrierApplication.js';
import { recordActivity } from '../services/activity.service.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * The one place that turns a carrier's stored status fields into the approval state people see.
 * Eligibility for freight is unchanged: status active + authority active + compliance approved (see carrier.service).
 */
export function deriveApprovalStatus(carrier) {
  if (carrier.status === 'suspended') return 'suspended';
  if (carrier.status === 'inactive') return 'deactivated';
  if (carrier.complianceStatus === 'rejected' || carrier.authorityStatus === 'revoked') return 'rejected';
  if (carrier.status === 'active' && carrier.authorityStatus === 'active' && carrier.complianceStatus === 'approved') return 'approved';
  return 'pending';
}

const MESSAGES = {
  pending: 'Your carrier account is pending approval. You can use your profile and documents now. Available loads unlock once the Super Admin approves your authority and compliance.',
  approved: 'Your carrier account is approved.',
  rejected: 'Your carrier application was not approved. Please contact support if you believe this is a mistake or have updated information.',
  suspended: 'Your carrier account is suspended. Please contact support.',
  deactivated: 'Your carrier account is not active. Please contact support.',
};

/** A carrier's own approval state. Read from their profile record, never from the request. */
export async function getCarrierAccountStatus(user) {
  const carrier = await Carrier.findOne({ userId: user._id }).active().select('status authorityStatus complianceStatus').lean();
  if (!carrier) throw ApiError.forbidden('No business profile is linked to this account.');
  const approvalStatus = deriveApprovalStatus(carrier);
  return {
    approvalStatus,
    isEmailVerified: Boolean(user.isEmailVerified),
    canAccessLoadBoard: approvalStatus === 'approved',
    message: MESSAGES[approvalStatus],
  };
}

const present = (carrier) => ({
  id: carrier._id,
  status: carrier.status,
  authorityStatus: carrier.authorityStatus,
  complianceStatus: carrier.complianceStatus,
  approvalStatus: deriveApprovalStatus(carrier),
});

const invalidState = (action, carrier) =>
  ApiError.conflict(`A carrier whose approval status is "${deriveApprovalStatus(carrier)}" cannot be ${action}.`, 'INVALID_APPROVAL_TRANSITION');

/** What each Super Admin action requires and changes. Checked against the stored record and applied atomically. */
const ACTIONS = {
  approve: {
    label: 'approved',
    allowed: (c) => ['pending', 'rejected'].includes(deriveApprovalStatus(c)),
    changes: () => ({ status: 'active', authorityStatus: 'active', complianceStatus: 'approved' }),
  },
  reject: {
    label: 'rejected',
    allowed: (c) => ['pending', 'approved'].includes(deriveApprovalStatus(c)),
    changes: (c) => ({ complianceStatus: 'rejected', status: c.status === 'active' ? 'pending' : c.status }),
  },
  suspend: {
    label: 'suspended',
    allowed: (c) => ['pending', 'approved', 'rejected'].includes(deriveApprovalStatus(c)),
    changes: () => ({ status: 'suspended' }),
  },
  reactivate: {
    label: 'reactivated',
    allowed: (c) => ['suspended', 'deactivated'].includes(deriveApprovalStatus(c)),
    changes: (c) => ({ status: c.authorityStatus === 'active' && c.complianceStatus === 'approved' ? 'active' : 'pending' }),
  },
};

export async function decideCarrier(carrierId, action, { reason } = {}, actor, context) {
  const rule = ACTIONS[action];
  const carrier = await Carrier.findOne({ _id: carrierId }).active().select('userId status authorityStatus complianceStatus').lean();
  if (!carrier) throw ApiError.notFound('Carrier not found.', 'NOT_FOUND');
  if (!rule.allowed(carrier)) throw invalidState(rule.label, carrier);

  // The update only applies if the record is still exactly as it was read, so two admins cannot race each other.
  const updated = await Carrier.findOneAndUpdate(
    { _id: carrierId, status: carrier.status, authorityStatus: carrier.authorityStatus, complianceStatus: carrier.complianceStatus },
    { $set: rule.changes(carrier) },
    { returnDocument: 'after' }
  )
    .select('status authorityStatus complianceStatus')
    .lean();
  if (!updated) throw ApiError.conflict('This carrier was changed by someone else. Reload and try again.', 'CONCURRENT_CHANGE');

  await recordActivity({
    userId: actor._id,
    action: `admin.carrier.${action}`,
    module: 'carriers',
    entityId: carrierId,
    description: `Carrier account ${rule.label} by the Super Admin.`,
    metadata: { from: deriveApprovalStatus(carrier), to: deriveApprovalStatus(updated), ...(reason ? { reason } : {}) },
    context,
  });
  return present({ _id: carrierId, ...updated });
}

/** A decision on a public carrier application. It records the review only; it does not create a login or a carrier account. */
export async function decideApplication(applicationId, { decision, rejectionReason }, actor, context) {
  const application = await CarrierApplication.findOne({ _id: applicationId }).active();
  if (!application) throw ApiError.notFound('Application not found.', 'NOT_FOUND');
  if (['approved', 'rejected'].includes(application.status)) {
    throw ApiError.conflict(`This application was already ${application.status}.`, 'APPLICATION_ALREADY_DECIDED');
  }
  const previous = application.status;
  application.status = decision;
  application.reviewedBy = actor._id;
  application.reviewedAt = new Date();
  if (decision === 'rejected') application.rejectionReason = rejectionReason;
  await application.save();
  await recordActivity({
    userId: actor._id,
    action: `admin.carrier_application.${decision}`,
    module: 'carrier_applications',
    entityId: application._id,
    description: `A carrier application was marked ${decision.replace('_', ' ')}.`,
    metadata: { from: previous, to: decision },
    context,
  });
  return { id: application._id, status: application.status, reviewedAt: application.reviewedAt, rejectionReason: application.rejectionReason ?? null };
}
