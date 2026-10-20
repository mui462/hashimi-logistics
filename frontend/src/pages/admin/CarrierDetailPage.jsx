import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import { EntityLink } from '../../components/admin/adminLinks';
import CarrierApprovalActions from '../../components/admin/CarrierApprovalActions';
import Button from '../../components/common/Button';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import { humanize } from '../../config/adminStatuses';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getCarrier } from '../../services/adminService';
import { formatDate, formatDateTime, formatMoney, formatStop } from '../../utils/format';

export default function CarrierDetailPage() {
  const { id } = useParams();
  const state = useAsyncData(useCallback(() => getCarrier(id), [id]));
  const carrier = state.data;
  return (
    <AdminPage
      title={carrier ? carrier.companyName : 'Carrier details'}
      trail={[{ label: 'Carriers', to: '/admin/carriers' }, { label: carrier ? carrier.companyName : 'Details' }]}
      actions={carrier && <Button to={`/admin/loads?carrierId=${encodeURIComponent(carrier.id)}`} variant="secondary">Their loads</Button>}
    >
      <AdminAsyncView state={state} label="Loading carrier" errorTitle="We could not load this carrier" notFound="carrier">
        {(c) => (
          <div className="space-y-6">
            <Panel title="Profile" action={<AdminStatusBadge status={c.status} />}>
              <DetailList items={[
                { label: 'Company', value: c.companyName },
                { label: 'Contact', value: c.contactPerson },
                { label: 'Business email', value: c.email },
                { label: 'Phone', value: c.phone },
                { label: 'MC number', value: c.MCNumber },
                { label: 'DOT number', value: c.DOTNumber },
                { label: 'Address', value: c.address ? [c.address.street, formatStop(c.address), c.address.zipCode].filter(Boolean).join(', ') : null, wide: true },
                { label: 'Joined', value: formatDate(c.createdAt) },
                { label: 'Rating', value: c.rating == null ? 'Not rated' : `${c.rating} of 5` },
              ]} />
            </Panel>
            <Panel title="Approval"><CarrierApprovalActions carrier={c} onChanged={state.reload} /></Panel>
            <div className="grid gap-6 xl:grid-cols-2">
              <Panel title="Authority and compliance">
                <DetailList items={[
                  { label: 'Authority', value: <AdminStatusBadge status={c.authorityStatus} /> },
                  { label: 'Compliance', value: <AdminStatusBadge status={c.complianceStatus} /> },
                  { label: 'Documents on file', value: c.documentCount },
                ]} />
              </Panel>
              <Panel title="Insurance">
                {c.insurance ? (
                  <DetailList items={[
                    { label: 'Provider', value: c.insurance.provider },
                    { label: 'Policy number', value: c.insurance.policyNumber },
                    { label: 'Liability coverage', value: formatMoney(c.insurance.liabilityCoverage) },
                    { label: 'Cargo coverage', value: formatMoney(c.insurance.cargoCoverage) },
                    { label: 'Effective', value: formatDate(c.insurance.effectiveDate) },
                    { label: 'Expires', value: c.insurance.expirationDate ? `${formatDate(c.insurance.expirationDate)}${c.insurance.expired ? ' (expired)' : ''}` : null },
                  ]} />
                ) : <p className="text-base text-steel-600">No insurance details on file.</p>}
              </Panel>
              <Panel title="Equipment and coverage">
                <DetailList items={[
                  { label: 'Equipment', value: c.equipmentTypes.join(', ') },
                  { label: 'Cross-border', value: c.crossBorderCapability ? 'Yes' : 'No' },
                  { label: 'Operating regions', value: c.operatingRegions.join(', '), wide: true },
                ]} />
              </Panel>
              <Panel title="Sign-in account">
                {c.account ? (
                  <DetailList items={[
                    { label: 'Login email', value: c.account.email },
                    { label: 'Account active', value: c.account.isActive ? 'Yes' : 'No' },
                    { label: 'Email confirmed', value: c.account.isEmailVerified ? 'Yes' : 'No' },
                    { label: 'Last sign-in', value: formatDateTime(c.account.lastLogin) },
                  ]} />
                ) : <p className="text-base text-steel-600">No sign-in account is linked.</p>}
              </Panel>
            </div>
            <Panel title="Loads">
              <DetailList items={[{ label: 'All loads', value: c.counts.loads }, { label: 'In progress', value: c.counts.active }, { label: 'Delivered or completed', value: c.counts.completed }]} />
              {c.recentLoads.length > 0 && (
                <ul aria-label="Recent loads" className="mt-4 divide-y divide-steel-200">
                  {c.recentLoads.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><EntityLink to={`/admin/loads/${encodeURIComponent(l.id)}`}>{l.loadNumber}</EntityLink><span className="text-base text-steel-600">{humanize(l.status)} · {formatDate(l.createdAt)}</span></li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Internal notes"><p className="whitespace-pre-wrap break-words text-base">{c.internalNotes || 'No internal notes.'}</p></Panel>
          </div>
        )}
      </AdminAsyncView>
    </AdminPage>
  );
}
