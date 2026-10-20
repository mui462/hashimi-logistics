import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import ActivityTimeline from '../../components/admin/ActivityTimeline';
import AdminActionBar from '../../components/admin/AdminActionBar';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import RelatedDocumentsPanel from '../../components/admin/documents/RelatedDocumentsPanel';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import PricingSummary from '../../components/admin/PricingSummary';
import StopDetails from '../../components/admin/StopDetails';
import { EntityLink, PartnerLink, formatAppointment, formatWindow } from '../../components/admin/adminLinks';
import { useAdminToast } from '../../components/admin/AdminToast';
import Button from '../../components/common/Button';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import ResponsiveTable from '../../components/customer/ResponsiveTable';
import { humanize } from '../../config/adminStatuses';
import { useAdminAction } from '../../hooks/useAdminAction';
import { useAsyncData } from '../../hooks/useAsyncData';
import * as admin from '../../services/adminService';
import { formatDate, formatDateTime, formatWeight } from '../../utils/format';

export default function LoadDetailPage() {
  const { id } = useParams();
  const toast = useAdminToast();
  const state = useAsyncData(useCallback(() => admin.getLoad(id), [id]));
  const { run, busy } = useAdminAction(state.reload);
  const load = state.data;

  const buildActions = (l) => {
    const next = l.nextStatuses.map((entry) => entry.status);
    const actions = [];
    if (next.includes('open')) actions.push({ key: 'open', label: 'Open for carriers', variant: 'primary', onRun: () => run(() => admin.openLoad(l.id), 'Load opened for carriers.') });
    if (next.includes('carrier_search')) actions.push({ key: 'search', label: 'Start carrier search', variant: 'primary', onRun: () => run(() => admin.startCarrierSearch(l.id), 'Carrier search started.') });
    if (next.includes('cancelled')) {
      actions.push({
        key: 'cancel',
        label: 'Cancel load',
        tone: 'danger',
        dialog: {
          title: `Cancel load ${l.loadNumber}?`,
          description: <p>The load is closed, any assigned carrier is released and the customer is told it was cancelled. This cannot be undone.</p>,
          confirmLabel: 'Cancel load',
          fields: [{ name: 'reason', label: 'Reason', type: 'textarea', required: true, maxLength: 500 }],
        },
        onRun: async (values) => {
          await admin.cancelLoad(l.id, values.reason);
          toast.success('Load cancelled.');
          state.reload();
        },
      });
    }
    if (l.carrier && !l.shipment && next.includes('dispatched')) {
      actions.push({
        key: 'shipment',
        label: 'Create shipment',
        variant: 'primary',
        dialog: {
          title: `Create a shipment for ${l.loadNumber}?`,
          description: <p>A shipment with a tracking number is created for the assigned carrier. A load can only have one shipment.</p>,
          confirmLabel: 'Create shipment',
        },
        onRun: async () => {
          await admin.createShipment(l.id);
          toast.success('Shipment created.');
          state.reload();
        },
      });
    }
    return actions;
  };

  return (
    <AdminPage
      title={load ? `Load ${load.loadNumber}` : 'Load details'}
      trail={[{ label: 'Loads', to: '/admin/loads' }, { label: load ? load.loadNumber : 'Details' }]}
      actions={
        load && (
          <>
            {load.nextStatuses.length > 0 && <Button to={`/admin/loads/${encodeURIComponent(load.id)}/edit`} variant="secondary">Edit load</Button>}
            <Button to={`/admin/loads/${encodeURIComponent(load.id)}/matching`} variant="secondary">Carrier matching</Button>
          </>
        )
      }
    >
      <AdminAsyncView state={state} label="Loading load" errorTitle="We could not load this load" notFound="load">
        {(l) => {
          const actions = buildActions(l);
          const followsShipment = l.nextStatuses.some((entry) => ['dispatched', 'picked_up', 'in_transit', 'delivered', 'completed'].includes(entry.status));
          return (
            <div className="space-y-6">
              <Panel title="Summary" action={<AdminStatusBadge status={l.status} operationsStatus={l.operationsStatus} />}>
                <DetailList items={[
                  { label: 'Load number', value: l.loadNumber },
                  { label: 'Status', value: humanize(l.operationsStatus) },
                  { label: 'Type', value: l.crossBorder ? 'Cross-border' : 'Domestic' },
                  { label: 'Created', value: formatDateTime(l.createdAt) },
                  { label: 'Quote', value: l.quote ? <EntityLink to={`/admin/quotes/${encodeURIComponent(l.quote.id)}`}>{l.quote.quoteNumber ?? 'Open quote'}</EntityLink> : '—' },
                  { label: 'Shipment', value: l.shipment ? <EntityLink to={`/admin/shipments/${encodeURIComponent(l.shipment.id)}`}>{l.shipment.shipmentNumber ?? l.shipment.trackingNumber}</EntityLink> : 'Not created yet' },
                  ...(l.cancelledReason ? [{ label: 'Cancellation reason', value: l.cancelledReason, wide: true }] : []),
                ]} />
              </Panel>

              <Panel title="Actions" description="Only the steps the server allows from the current status are shown.">
                {actions.length > 0 ? <AdminActionBar actions={actions} busy={busy} /> : <p className="text-base text-steel-600">No actions are available from here.</p>}
                {followsShipment && l.shipment && (
                  <p className="mt-3 text-base text-steel-600">Dispatch, pickup and delivery are recorded on the shipment. <Link className="font-semibold underline underline-offset-4" to={`/admin/shipments/${encodeURIComponent(l.shipment.id)}`}>Open the shipment</Link>.</p>
                )}
              </Panel>

              <div className="grid gap-6 xl:grid-cols-2">
                <Panel title="Customer">
                  <DetailList items={[
                    { label: 'Company', value: <PartnerLink kind="customers" partner={l.customer} /> },
                    { label: 'Contact', value: l.customer?.contactPerson },
                    { label: 'Email', value: l.customer?.email },
                    { label: 'Phone', value: l.customer?.phone },
                  ]} />
                </Panel>
                <Panel title="Carrier" action={l.carrier ? <Button to={`/admin/loads/${encodeURIComponent(l.id)}/matching`} variant="secondary" size="sm">Manage carrier</Button> : null}>
                  {l.carrier ? (
                    <DetailList items={[
                      { label: 'Company', value: <PartnerLink kind="carriers" partner={l.carrier} /> },
                      { label: 'Contact', value: l.carrier.contactPerson },
                      { label: 'MC number', value: l.carrier.MCNumber },
                      { label: 'DOT number', value: l.carrier.DOTNumber },
                      { label: 'Phone', value: l.carrier.phone },
                      { label: 'Email', value: l.carrier.email },
                    ]} />
                  ) : (
                    <p className="text-base text-steel-600">No carrier is assigned. <Link className="font-semibold underline underline-offset-4" to={`/admin/loads/${encodeURIComponent(l.id)}/matching`}>See carrier matching</Link>.</p>
                  )}
                </Panel>
                <Panel title="Pickup" description={formatWindow(l.pickup)}>
                  <div className="space-y-4">
                    <StopDetails stop={l.origin} />
                    <DetailList columns={1} items={[{ label: 'Appointment', value: formatAppointment(l.pickupAppointment) }]} />
                  </div>
                </Panel>
                <Panel title="Delivery" description={formatWindow(l.delivery)}>
                  <div className="space-y-4">
                    <StopDetails stop={l.destination} />
                    <DetailList columns={1} items={[{ label: 'Appointment', value: formatAppointment(l.deliveryAppointment) }]} />
                  </div>
                </Panel>
                <Panel title="Equipment and commodity">
                  <DetailList items={[
                    { label: 'Equipment', value: l.equipmentType },
                    { label: 'Commodity', value: l.commodity },
                    { label: 'Weight', value: formatWeight(l.weight) },
                    { label: 'Special instructions', value: l.specialInstructions, wide: true },
                    { label: 'Internal notes', value: l.internalNotes, wide: true },
                  ]} />
                </Panel>
                <Panel title="Pricing" description="Visible to the Super Admin only."><PricingSummary pricing={l.pricing} /></Panel>
              </div>

              <Panel title="Assignment history">
                {l.assignmentHistory.length === 0 ? (
                  <p className="text-base text-steel-600">No carrier has been assigned to this load yet.</p>
                ) : (
                  <ResponsiveTable
                    caption="Assignment history"
                    getKey={(entry) => `${entry.carrier.id}-${entry.assignedAt}`}
                    rows={l.assignmentHistory}
                    columns={[
                      { key: 'carrier', header: 'Carrier', primary: true, render: (entry) => <PartnerLink kind="carriers" partner={entry.carrier} /> },
                      { key: 'assigned', header: 'Assigned', render: (entry) => formatDateTime(entry.assignedAt) },
                      { key: 'removed', header: 'Removed', render: (entry) => (entry.unassignedAt ? formatDateTime(entry.unassignedAt) : 'Current') },
                      { key: 'reason', header: 'Reason', render: (entry) => entry.reason ?? '—' },
                    ]}
                  />
                )}
              </Panel>

              <RelatedDocumentsPanel entityType="load" entityId={l.id} label={`load ${l.loadNumber}`} />

              <Panel title="Activity timeline"><ActivityTimeline entityId={l.id} refreshKey={l.updatedAt} /></Panel>
              <p className="text-base text-steel-600">Last updated {formatDate(l.updatedAt)} · {humanize(l.operationsStatus)}</p>
            </div>
          );
        }}
      </AdminAsyncView>
    </AdminPage>
  );
}
