import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ActivityTimeline from '../../components/admin/ActivityTimeline';
import AdminActionBar from '../../components/admin/AdminActionBar';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import AdminTimeline from '../../components/admin/AdminTimeline';
import StopDetails from '../../components/admin/StopDetails';
import { EntityLink, PartnerLink } from '../../components/admin/adminLinks';
import RelatedDocumentsPanel from '../../components/admin/documents/RelatedDocumentsPanel';
import { useAdminToast } from '../../components/admin/AdminToast';
import Alert from '../../components/common/Alert';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import SelectInput from '../../components/forms/SelectInput';
import TextArea from '../../components/forms/TextArea';
import TextInput from '../../components/forms/TextInput';
import { COUNTRIES, EXCEPTION_REASONS, humanize, options } from '../../config/adminStatuses';
import { useAdminAction } from '../../hooks/useAdminAction';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useSubmitState } from '../../hooks/useSubmitState';
import * as admin from '../../services/adminService';
import { formatDateTime, formatStop } from '../../utils/format';

// Target status -> the API action that records it. Which of these appear is decided by the server's `nextStatuses`.
const STEP_ACTIONS = {
  dispatched: { action: 'dispatch', label: 'Dispatch', done: 'Shipment dispatched.' },
  picked_up: { action: 'pickup', label: 'Record pickup', done: 'Pickup recorded.' },
  in_transit: { action: 'in-transit', label: 'Mark in transit', done: 'Shipment marked in transit.' },
  at_border: { action: 'at-border', label: 'Arrived at border', done: 'Arrival at the border recorded.', crossBorderOnly: true },
  border_cleared: { action: 'border-cleared', label: 'Border cleared', done: 'Border clearance recorded.', crossBorderOnly: true },
  out_for_delivery: { action: 'out-for-delivery', label: 'Out for delivery', done: 'Shipment out for delivery.' },
  delivered: { action: 'deliver', label: 'Record delivery', done: 'Delivery recorded.' },
  completed: { action: 'complete', label: 'Complete shipment', done: 'Shipment completed.' },
};

const NOTE_FIELD = { name: 'note', label: 'Note', type: 'textarea', maxLength: 1000 };
const position = (p) => (p ? [p.city, p.state, p.country].filter(Boolean).join(', ') : '');

function LocationForm({ shipment, onSaved }) {
  const toast = useAdminToast();
  const { run, isSubmitting, error, fieldErrors } = useSubmitState();
  const [v, setV] = useState({ city: '', state: '', country: 'US', note: '' });
  const [errors, setErrors] = useState({});
  const set = (name) => (event) => setV((current) => ({ ...current, [name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (!v.city.trim() && !v.state.trim()) {
      setErrors({ city: 'Enter a city or a state.' });
      document.querySelector('input[name="city"]')?.focus();
      return;
    }
    setErrors({});
    const ok = await run(() => admin.addTrackingUpdate(shipment.id, { location: { city: v.city.trim() || undefined, state: v.state.trim() || undefined, country: v.country }, ...(v.note.trim() ? { note: v.note.trim() } : {}) }));
    if (ok) {
      toast.success('Location recorded.');
      setV({ city: '', state: '', country: 'US', note: '' });
      onSaved();
    }
  };
  const shown = { ...fieldErrors, ...errors };
  return (
    <form onSubmit={submit} noValidate aria-label="Record a location update" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextInput name="city" label="City" value={v.city} onChange={set('city')} error={shown.city ?? shown['location.city']} maxLength={100} />
        <TextInput label="State or province" value={v.state} onChange={set('state')} error={shown['location.state']} maxLength={50} />
        <SelectInput label="Country" value={v.country} onChange={set('country')} options={COUNTRIES.map((c) => ({ value: c, label: c }))} />
      </div>
      <TextArea label="Note (optional)" rows={2} value={v.note} onChange={set('note')} maxLength={1000} />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" variant="secondary" loading={isSubmitting}>Record location</Button>
    </form>
  );
}

function BorderEventForm({ shipment, onSaved }) {
  const toast = useAdminToast();
  const { run, isSubmitting, error } = useSubmitState();
  const [v, setV] = useState({ event: 'customs_processing', note: '' });
  const submit = async (event) => {
    event.preventDefault();
    if (await run(() => admin.addBorderEvent(shipment.id, { event: v.event, ...(v.note.trim() ? { note: v.note.trim() } : {}) }))) {
      toast.success('Border event recorded.');
      setV({ event: 'customs_processing', note: '' });
      onSaved();
    }
  };
  return (
    <form onSubmit={submit} noValidate aria-label="Record a border event" className="space-y-4">
      <SelectInput label="Border event" value={v.event} onChange={(e) => setV({ ...v, event: e.target.value })} options={[{ value: 'customs_processing', label: 'Customs processing' }, { value: 'border_delayed', label: 'Border delayed' }]} />
      <TextArea label="Note (optional)" rows={2} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} maxLength={1000} />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" variant="secondary" loading={isSubmitting}>Record border event</Button>
    </form>
  );
}

export default function ShipmentDetailPage() {
  const { id } = useParams();
  const toast = useAdminToast();
  const state = useAsyncData(useCallback(() => admin.getShipment(id), [id]));
  const { run, busy } = useAdminAction(state.reload);
  const [resolving, setResolving] = useState(null);
  const shipment = state.data;

  const buildActions = (s) => {
    const actions = [];
    const inException = s.status === 'exception';
    for (const { status } of s.nextStatuses) {
      const step = STEP_ACTIONS[status];
      if (inException || !step) continue; // an open exception is left through "Resolve", not through a status button
      if (step.crossBorderOnly && !s.isCrossBorder) continue;
      actions.push({ key: step.action, label: step.label, variant: 'primary', dialog: { title: `${step.label}?`, description: <p>This records the update with the time it happens and notifies the customer where appropriate.</p>, fields: [NOTE_FIELD], confirmLabel: step.label }, onRun: async (v) => { await admin.runShipmentAction(s.id, step.action, v.note ? { note: v.note } : {}); toast.success(step.done); state.reload(); } });
    }
    if (!inException && s.nextStatuses.some((entry) => entry.status === 'exception')) {
      actions.push({
        key: 'exception',
        label: 'Raise exception',
        tone: 'danger',
        dialog: {
          title: `Raise an exception on ${s.shipmentNumber ?? s.trackingNumber}?`,
          description: <p>Use this when something has gone wrong. The shipment is flagged until the exception is resolved.</p>,
          confirmLabel: 'Raise exception',
          fields: [{ name: 'reason', label: 'Reason', type: 'select', defaultValue: 'delay', options: options(EXCEPTION_REASONS) }, { ...NOTE_FIELD, maxLength: 1500 }],
        },
        onRun: async (v) => {
          await admin.raiseException(s.id, { reason: v.reason, ...(v.note ? { note: v.note } : {}) });
          toast.success('Exception recorded.');
          state.reload();
        },
      });
    }
    if (s.nextStatuses.some((entry) => entry.status === 'cancelled')) {
      actions.push({
        key: 'cancel',
        label: 'Cancel shipment',
        tone: 'danger',
        dialog: {
          title: `Cancel shipment ${s.shipmentNumber ?? s.trackingNumber}?`,
          description: <p>The shipment ends here and the customer is notified. This cannot be undone.</p>,
          confirmLabel: 'Cancel shipment',
          fields: [{ name: 'reason', label: 'Reason', type: 'textarea', required: true, maxLength: 500 }],
        },
        onRun: async (v) => {
          await admin.cancelShipment(s.id, v.reason);
          toast.success('Shipment cancelled.');
          state.reload();
        },
      });
    }
    return actions;
  };

  const events = (s) =>
    [
      ...s.trackingEvents.map((e) => ({ id: `t-${e.id}`, at: e.timestamp, title: humanize(e.status), detail: [position(e.location), e.note].filter(Boolean).join(' · ') || undefined })),
      ...s.borderEvents.map((e) => ({ id: `b-${e.id}`, at: e.timestamp, title: `Border: ${humanize(e.event)}`, detail: [position(e.location), e.note].filter(Boolean).join(' · ') || undefined })),
    ].sort((a, b) => String(a.at).localeCompare(String(b.at)));

  return (
    <AdminPage
      title={shipment ? `Shipment ${shipment.shipmentNumber ?? shipment.trackingNumber}` : 'Shipment details'}
      trail={[{ label: 'Shipments', to: '/admin/shipments' }, { label: shipment ? (shipment.shipmentNumber ?? shipment.trackingNumber) : 'Details' }]}
    >
      <AdminAsyncView state={state} label="Loading shipment" errorTitle="We could not load this shipment" notFound="shipment">
        {(s) => {
          const actions = buildActions(s);
          const openExceptions = s.exceptions.filter((e) => !e.resolvedAt);
          const live = s.nextStatuses.length > 0;
          return (
            <div className="space-y-6">
              <Panel title="Summary" action={<AdminStatusBadge status={s.status} operationsStatus={s.operationsStatus} />}>
                <DetailList items={[
                  { label: 'Shipment number', value: s.shipmentNumber },
                  { label: 'Tracking number', value: s.trackingNumber },
                  { label: 'Status', value: humanize(s.operationsStatus) },
                  { label: 'Load', value: s.load?.loadNumber ? <EntityLink to={`/admin/loads/${encodeURIComponent(s.load.id)}`}>{s.load.loadNumber}</EntityLink> : '—' },
                  { label: 'Type', value: s.isCrossBorder ? 'Cross-border' : 'Domestic' },
                  { label: 'Created', value: formatDateTime(s.createdAt) },
                ]} />
              </Panel>

              {openExceptions.length > 0 && <Alert>This shipment has {openExceptions.length === 1 ? 'an open exception' : `${openExceptions.length} open exceptions`}. Resolve {openExceptions.length === 1 ? 'it' : 'them'} below to continue.</Alert>}

              <Panel title="Actions" description="Only the steps the server allows from the current status are shown.">
                {actions.length > 0 ? <AdminActionBar actions={actions} busy={busy} /> : <p className="text-base text-steel-600">No actions are available from here.</p>}
              </Panel>

              <div className="grid gap-6 xl:grid-cols-2">
                <Panel title="Tracking">
                  <DetailList items={[
                    { label: 'Tracking number', value: s.trackingNumber },
                    { label: 'Current location', value: position(s.currentLocation) || 'No location has been recorded yet.' },
                    { label: 'Estimated pickup', value: formatDateTime(s.estimatedPickup) },
                    { label: 'Actual pickup', value: formatDateTime(s.actualPickup) },
                    { label: 'Estimated delivery', value: formatDateTime(s.estimatedDelivery) },
                    { label: 'Actual delivery', value: formatDateTime(s.actualDelivery) },
                  ]} />
                </Panel>
                <Panel title="Route"><DetailList items={[{ label: 'From', value: formatStop(s.origin) }, { label: 'To', value: formatStop(s.destination) }]} /></Panel>
                <Panel title="Customer"><DetailList items={[{ label: 'Company', value: <PartnerLink kind="customers" partner={s.customer} /> }, { label: 'Contact', value: s.customer?.contactPerson }, { label: 'Phone', value: s.customer?.phone }, { label: 'Email', value: s.customer?.email }]} /></Panel>
                <Panel title="Carrier"><DetailList items={[{ label: 'Company', value: <PartnerLink kind="carriers" partner={s.carrier} /> }, { label: 'Contact', value: s.carrier?.contactPerson }, { label: 'Phone', value: s.carrier?.phone }, { label: 'MC number', value: s.carrier?.MCNumber }]} /></Panel>
                <Panel title="Pickup"><StopDetails stop={s.origin} /></Panel>
                <Panel title="Delivery"><StopDetails stop={s.destination} /></Panel>
              </div>

              {s.isCrossBorder && (
                <Panel title="Border">
                  <div className="space-y-4">
                    <DetailList items={[{ label: 'Border status', value: humanize(s.borderStatus) }]} />
                    {s.borderEvents.length === 0 ? <p className="text-base text-steel-600">No border events yet.</p> : <AdminTimeline label="Border events" items={s.borderEvents.map((e) => ({ id: e.id, at: e.timestamp, title: humanize(e.event), detail: e.note ?? undefined }))} />}
                    {live && <BorderEventForm shipment={s} onSaved={state.reload} />}
                  </div>
                </Panel>
              )}

              <Panel title="Exceptions">
                {s.exceptions.length === 0 ? (
                  <p className="text-base text-steel-600">No exceptions have been raised on this shipment.</p>
                ) : (
                  <ul className="divide-y divide-steel-200">
                    {s.exceptions.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-3 text-lg font-bold">{humanize(e.reason)} <Badge tone={e.resolvedAt ? 'success' : 'danger'}>{e.resolvedAt ? 'Resolved' : 'Open'}</Badge></p>
                          <p className="text-base text-steel-600">Raised {formatDateTime(e.reportedAt)}{e.note ? ` · ${e.note}` : ''}</p>
                          {e.resolvedAt && <p className="text-base text-steel-600">Resolved {formatDateTime(e.resolvedAt)}{e.resolutionNote ? ` · ${e.resolutionNote}` : ''}</p>}
                        </div>
                        {!e.resolvedAt && <Button variant="secondary" onClick={() => setResolving(e)} aria-label={`Resolve the ${humanize(e.reason)} exception`}>Resolve</Button>}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              {live && <Panel title="Record a location update" description="Only locations you enter here are shown. Nothing is guessed."><LocationForm shipment={s} onSaved={state.reload} /></Panel>}

              <RelatedDocumentsPanel entityType="shipment" entityId={s.id} label={`shipment ${s.trackingNumber}`} proofOfDelivery={s.proofOfDelivery} />

              <div className="grid gap-6 xl:grid-cols-2">
                <Panel title="Tracking timeline">{events(s).length === 0 ? <p className="text-base text-steel-600">No tracking events yet.</p> : <AdminTimeline label="Tracking events" items={events(s)} />}</Panel>
                <Panel title="Activity log"><ActivityTimeline entityId={s.id} refreshKey={s.updatedAt} /></Panel>
              </div>
              <p className="text-base text-steel-600"><Link className="font-semibold underline underline-offset-4" to="/admin/shipments">Back to all shipments</Link></p>
            </div>
          );
        }}
      </AdminAsyncView>

      <AdminConfirmDialog
        open={Boolean(resolving)}
        title="Resolve this exception?"
        description={resolving && <p>{humanize(resolving.reason)} · raised {formatDateTime(resolving.reportedAt)}. The shipment returns to the status it was in before the exception.</p>}
        confirmLabel="Resolve exception"
        fields={[{ ...NOTE_FIELD, label: 'Resolution note', maxLength: 1500 }]}
        onCancel={() => setResolving(null)}
        onConfirm={async (v) => {
          await admin.resolveException(shipment.id, resolving.id, v.note ? { note: v.note } : {});
          toast.success('Exception resolved.');
          setResolving(null);
          state.reload();
        }}
      />
    </AdminPage>
  );
}
