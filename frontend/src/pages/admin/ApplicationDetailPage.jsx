import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import Button from '../../components/common/Button';
import { useAdminAction } from '../../hooks/useAdminAction';
import { useAsyncData } from '../../hooks/useAsyncData';
import { decideApplication, getApplication } from '../../services/adminService';
import { formatDate, formatDateTime, formatStop } from '../../utils/format';

export default function ApplicationDetailPage() {
  const { id } = useParams();
  const state = useAsyncData(useCallback(() => getApplication(id), [id]));
  const application = state.data;
  const { run } = useAdminAction(state.reload);
  const [decision, setDecision] = useState(null);
  const decided = application && ['approved', 'rejected'].includes(application.status);
  const DECISIONS = { under_review: { label: 'Mark under review', done: 'Application marked under review.' }, approved: { label: 'Approve application', done: 'Application approved.' }, rejected: { label: 'Reject application', done: 'Application rejected.', reasonRequired: true } };
  const confirmDecision = async (values) => {
    const reason = values.reason?.trim();
    const done = await run(() => decideApplication(id, { decision, ...(reason ? { rejectionReason: reason } : {}) }), DECISIONS[decision].done);
    if (!done) throw new Error('That did not work. Please try again.');
    setDecision(null);
  };
  return (
    <AdminPage
      title={application ? `Application from ${application.companyName}` : 'Application details'}
      trail={[{ label: 'Carrier applications', to: '/admin/carrier-applications' }, { label: application ? application.companyName : 'Details' }]}
    >
      <AdminAsyncView state={state} label="Loading application" errorTitle="We could not load this application" notFound="application">
        {(a) => (
          <div className="space-y-6">
            <Panel title="Applicant" action={<AdminStatusBadge status={a.status} />}>
              <DetailList items={[
                { label: 'Company', value: a.companyName },
                { label: 'Contact', value: a.contactPerson },
                { label: 'Email', value: a.email },
                { label: 'Phone', value: a.phone },
                { label: 'MC number', value: a.MCNumber },
                { label: 'DOT number', value: a.DOTNumber },
                { label: 'Address', value: a.address ? [a.address.street, formatStop(a.address), a.address.zipCode].filter(Boolean).join(', ') : null, wide: true },
                { label: 'Submitted', value: formatDate(a.createdAt) },
              ]} />
            </Panel>
            <Panel title="Capabilities">
              <DetailList items={[
                { label: 'Equipment', value: a.equipmentTypes.join(', ') },
                { label: 'Cross-border', value: a.crossBorderCapability ? 'Yes' : 'No' },
                { label: 'Operating regions', value: a.operatingRegions.join(', '), wide: true },
                { label: 'Documents submitted', value: a.documentCount },
                { label: 'Notes from the applicant', value: a.applicantNotes, wide: true },
              ]} />
            </Panel>
            <Panel title="Review">
              <DetailList items={[
                { label: 'Reviewed by', value: a.reviewedBy ? `${a.reviewedBy.name} (${a.reviewedBy.email})` : 'Not reviewed yet' },
                { label: 'Reviewed on', value: formatDateTime(a.reviewedAt) },
                { label: 'Rejection reason', value: a.rejectionReason },
                { label: 'Carrier account', value: a.carrierId ? 'Created' : 'Not created' },
                { label: 'Internal notes', value: a.internalNotes, wide: true },
              ]} />
              {!decided && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {a.status === 'pending' && <Button variant="secondary" onClick={() => setDecision('under_review')}>Mark under review</Button>}
                  <Button onClick={() => setDecision('approved')}>Approve application</Button>
                  <Button variant="danger" onClick={() => setDecision('rejected')}>Reject application</Button>
                </div>
              )}
              <p className="mt-4 text-base text-steel-600">A decision is recorded and audited. It does not create a sign-in account: the applicant registers a carrier account themselves, and you then approve that carrier from its own page.</p>
            </Panel>
          </div>
        )}
      </AdminAsyncView>
      <AdminConfirmDialog
        open={Boolean(decision)}
        title={decision ? `${DECISIONS[decision].label}?` : ''}
        description={<p>The decision is final for approved and rejected applications.</p>}
        confirmLabel={decision ? DECISIONS[decision].label : 'Confirm'}
        tone={decision === 'rejected' ? 'danger' : 'primary'}
        fields={decision && decision !== 'approved' && decision !== 'under_review' ? [{ name: 'reason', label: 'Rejection reason (required)', type: 'textarea', required: true, maxLength: 1000 }] : []}
        onConfirm={confirmDecision}
        onCancel={() => setDecision(null)}
      />
    </AdminPage>
  );
}
