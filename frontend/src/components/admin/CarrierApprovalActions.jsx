import { useState } from 'react';
import Button from '../common/Button';
import AdminConfirmDialog from './AdminConfirmDialog';
import AdminStatusBadge from './AdminStatusBadge';
import { useAdminAction } from '../../hooks/useAdminAction';
import { decideCarrier } from '../../services/adminService';

const ACTIONS = {
  approve: {
    from: ['pending', 'rejected'], label: 'Approve carrier', tone: 'primary', variant: 'primary',
    title: 'Approve this carrier?', done: 'Carrier approved.',
    description: 'Marks the carrier’s authority as active and compliance as approved. They will see available loads that match them. Only approve after reviewing their authority, insurance and documents.',
  },
  reject: {
    from: ['pending', 'approved'], label: 'Reject', tone: 'danger', variant: 'danger',
    title: 'Reject this carrier?', done: 'Carrier rejected.', reasonRequired: true,
    description: 'The carrier keeps access to their profile, sees that they were not approved, and loses access to available loads. You can approve them later.',
  },
  suspend: {
    from: ['pending', 'approved', 'rejected'], label: 'Suspend', tone: 'danger', variant: 'secondary',
    title: 'Suspend this carrier?', done: 'Carrier suspended.',
    description: 'Blocks the carrier from their portal data until you reactivate them. Existing records are kept.',
  },
  reactivate: {
    from: ['suspended', 'deactivated'], label: 'Reactivate', tone: 'primary', variant: 'primary',
    title: 'Reactivate this carrier?', done: 'Carrier reactivated.',
    description: 'Restores portal access. If the carrier was approved before, they are approved again; otherwise they return to pending.',
  },
};

/** Super Admin approval controls for one carrier. Server-enforced; every change is audited by the API. */
export default function CarrierApprovalActions({ carrier, onChanged }) {
  const { run } = useAdminAction(onChanged);
  const [pending, setPending] = useState(null);
  // The server derives this (and enforces every transition); here it only chooses which buttons to offer.
  const approval = carrier.approvalStatus;
  const available = Object.entries(ACTIONS).filter(([, action]) => action.from.includes(approval));
  const action = pending ? ACTIONS[pending] : null;

  const confirm = async (values) => {
    const reason = values.reason?.trim();
    const done = await run(() => decideCarrier(carrier.id, pending, reason ? { reason } : {}), action.done);
    if (!done) throw new Error('That did not work. Please try again.');
    setPending(null);
  };

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-3 text-base">
        Approval status <AdminStatusBadge status={approval} />
      </p>
      <p className="text-base text-steel-600">
        {approval === 'pending' && 'New carriers stay pending until you approve them. They can use their profile, but cannot see available loads.'}
        {approval === 'approved' && 'This carrier can see and be matched to available loads.'}
        {approval === 'rejected' && 'This carrier was not approved and cannot see available loads.'}
        {approval === 'suspended' && 'This carrier is suspended and cannot use their portal.'}
        {approval === 'deactivated' && 'This carrier is inactive and cannot use their portal.'}
      </p>
      <div className="flex flex-wrap gap-3">
        {available.map(([key, item]) => (
          <Button key={key} variant={item.variant} onClick={() => setPending(key)}>{item.label}</Button>
        ))}
      </div>
      <AdminConfirmDialog
        open={Boolean(pending)}
        title={action?.title ?? ''}
        description={<p>{action?.description}</p>}
        confirmLabel={action?.label ?? 'Confirm'}
        tone={action?.tone}
        fields={action ? [{ name: 'reason', label: action.reasonRequired ? 'Reason (required)' : 'Reason (optional)', type: 'textarea', required: Boolean(action.reasonRequired), maxLength: 1000 }] : []}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
