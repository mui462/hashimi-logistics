import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import { EntityLink, PartnerLink } from '../../components/admin/adminLinks';
import { useAdminToast } from '../../components/admin/AdminToast';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import { humanize } from '../../config/adminStatuses';
import { useAsyncData } from '../../hooks/useAsyncData';
import * as admin from '../../services/adminService';
import { ApiRequestError } from '../../utils/apiRequestError';
import { formatMoney } from '../../utils/format';
import { centsToDollars, dollarsToCents } from '../../utils/money';

const LOSS_FIELD = {
  name: 'lossPolicy',
  label: 'If this would sell the load at a loss',
  type: 'select',
  defaultValue: 'stop',
  options: [
    { value: 'stop', label: 'Stop and warn me (recommended)' },
    { value: 'allow', label: 'Allow a negative margin' },
  ],
};

// Dollars typed by the admin become integer cents here; the server calculates the margin from them.
function rateFrom(values, { required }) {
  const text = (values.carrierRate ?? '').trim();
  if (!text) {
    if (required) throw new ApiRequestError('Enter the carrier rate before assigning a carrier.', { status: 400 });
    return undefined;
  }
  const cents = dollarsToCents(text);
  if (cents == null) throw new ApiRequestError('Enter the carrier rate as an amount such as 1980.00.', { status: 400 });
  return cents;
}

function Consequence({ load, carrier, children }) {
  return (
    <div className="space-y-2">
      <DetailList columns={1} items={[{ label: 'Load', value: load.loadNumber }, { label: 'Carrier', value: carrier }]} />
      {children}
    </div>
  );
}

export default function LoadMatchingPage() {
  const { id } = useParams();
  const toast = useAdminToast();
  const loadState = useAsyncData(useCallback(() => admin.getLoad(id), [id]));
  const matchState = useAsyncData(useCallback(() => admin.getCarrierMatches(id), [id]));
  const [dialog, setDialog] = useState(null);

  const reloadAll = () => {
    loadState.reload();
    matchState.reload();
  };
  const load = loadState.data;
  const hasCarrier = Boolean(load?.carrier);
  const canAssign = Boolean(load) && !hasCarrier && load.nextStatuses.some((entry) => entry.status === 'assigned');

  const carrierRateField = (required) => ({
    name: 'carrierRate',
    label: 'Carrier rate',
    required,
    inputMode: 'decimal',
    defaultValue: centsToDollars(load?.pricing?.carrierRate?.amount),
    help: load?.pricing?.customerRate ? `The customer rate on this load is ${formatMoney(load.pricing.customerRate)}. The server calculates the margin.` : undefined,
  });

  const open = (kind, carrier) => setDialog({ kind, carrier });
  const done = (message) => {
    toast.success(message);
    setDialog(null);
    reloadAll();
  };

  const dialogProps = () => {
    if (!dialog || !load) return null;
    const { kind, carrier } = dialog;
    if (kind === 'assign') {
      return {
        title: `Assign ${carrier.companyName}?`,
        description: <Consequence load={load} carrier={carrier.companyName}><p>The carrier is notified and the load moves to “Carrier assigned”. The customer is told a carrier was assigned (without the carrier’s name or rate).</p></Consequence>,
        confirmLabel: 'Assign carrier',
        fields: [carrierRateField(!load.pricing?.carrierRate), { name: 'reason', label: 'Reason', type: 'textarea', maxLength: 500 }, LOSS_FIELD],
        onConfirm: async (v) => {
          await admin.assignCarrier(load.id, { carrierId: carrier.carrierId, carrierRate: rateFrom(v, { required: !load.pricing?.carrierRate }), ...(v.reason ? { reason: v.reason } : {}), ...(v.lossPolicy === 'allow' ? { allowNegativeMargin: true } : {}) });
          done(`${carrier.companyName} assigned.`);
        },
      };
    }
    if (kind === 'reassign') {
      return {
        title: `Replace ${load.carrier.companyName} with ${carrier.companyName}?`,
        description: <Consequence load={load} carrier={`${load.carrier.companyName} → ${carrier.companyName}`}><p>The current carrier loses this load and is notified; the new carrier is notified. The change is recorded in the assignment history.</p></Consequence>,
        confirmLabel: 'Replace carrier',
        tone: 'danger',
        fields: [carrierRateField(false), { name: 'reason', label: 'Reason', type: 'textarea', required: true, maxLength: 500 }, LOSS_FIELD],
        onConfirm: async (v) => {
          await admin.reassignCarrier(load.id, { carrierId: carrier.carrierId, carrierRate: rateFrom(v, { required: false }), reason: v.reason, ...(v.lossPolicy === 'allow' ? { allowNegativeMargin: true } : {}) });
          done(`Carrier replaced with ${carrier.companyName}.`);
        },
      };
    }
    return {
      title: `Remove ${load.carrier.companyName} from ${load.loadNumber}?`,
      description: <Consequence load={load} carrier={load.carrier.companyName}><p>The load has no carrier afterwards and goes back to the carrier search. The carrier is notified.</p></Consequence>,
      confirmLabel: 'Remove carrier',
      tone: 'danger',
      fields: [
        { name: 'reason', label: 'Reason', type: 'textarea', required: true, maxLength: 500 },
        { name: 'returnTo', label: 'Return the load to', type: 'select', defaultValue: 'carrier_search', options: [{ value: 'carrier_search', label: 'Carrier search' }, { value: 'open', label: 'Open' }] },
      ],
      onConfirm: async (v) => {
        await admin.unassignCarrier(load.id, { reason: v.reason, returnTo: v.returnTo });
        done('Carrier removed from the load.');
      },
    };
  };
  const props = dialogProps();

  return (
    <AdminPage
      title={load ? `Carrier matching for ${load.loadNumber}` : 'Carrier matching'}
      trail={[{ label: 'Loads', to: '/admin/loads' }, { label: load ? load.loadNumber : 'Load', to: `/admin/loads/${encodeURIComponent(id)}` }, { label: 'Carrier matching' }]}
      description="The server decides which carriers are eligible and why others are not. This page only shows its answer."
    >
      <AdminAsyncView state={loadState} label="Loading load" errorTitle="We could not load this load" notFound="load">
        {(l) => (
          <Panel title="Load" action={<AdminStatusBadge status={l.status} operationsStatus={l.operationsStatus} />}>
            <DetailList items={[
              { label: 'Load', value: <EntityLink to={`/admin/loads/${encodeURIComponent(l.id)}`}>{l.loadNumber}</EntityLink> },
              { label: 'Customer', value: <PartnerLink kind="customers" partner={l.customer} /> },
              { label: 'Customer rate', value: formatMoney(l.pricing?.customerRate) },
              { label: 'Carrier rate', value: formatMoney(l.pricing?.carrierRate) },
              {
                label: 'Assigned carrier',
                value: l.carrier ? (
                  <span className="flex flex-wrap items-center gap-3">
                    <PartnerLink kind="carriers" partner={l.carrier} />
                    <Button variant="secondary" size="sm" onClick={() => open('unassign')}>Remove carrier</Button>
                  </span>
                ) : 'None',
              },
            ]} />
          </Panel>
        )}
      </AdminAsyncView>

      <AdminAsyncView state={matchState} label="Evaluating carriers" errorTitle="We could not load carrier matches" notFound="load">
        {(m) => (
          <div className="space-y-6">
            <Panel title="What the server matched on" description={`Evaluated ${m.counts.evaluated} carriers: ${m.counts.eligible} eligible, ${m.counts.excluded} not eligible.`}>
              <DetailList items={[
                { label: 'Equipment', value: m.criteria.equipmentType },
                { label: 'Lane', value: `${m.criteria.originCountry ?? '—'} → ${m.criteria.destinationCountry ?? '—'}${m.criteria.crossBorder ? ' (cross-border)' : ''}` },
                { label: 'Pickup', value: [m.criteria.pickupCity, m.criteria.pickupState].filter(Boolean).join(', ') },
              ]} />
              {m.truncated && <p className="mt-3 text-base text-steel-600">Only the first carriers were evaluated.</p>}
            </Panel>

            <Panel title="Eligible carriers" description="Ranked by the server, best match first.">
              {m.matches.length === 0 ? (
                <EmptyState title="No eligible carriers" description="No carrier currently meets this load’s requirements. See the reasons below." />
              ) : (
                <ul className="divide-y divide-steel-200">
                  {m.matches.map((carrier) => (
                    <li key={carrier.carrierId} className="flex flex-wrap items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-3 text-lg font-bold">
                          <Link to={`/admin/carriers/${encodeURIComponent(carrier.carrierId)}`} className="break-words underline underline-offset-4">{carrier.companyName}</Link>
                          <Badge tone="success"><CheckCircle2 className="mr-1 size-4" aria-hidden="true" />Eligible</Badge>
                        </p>
                        <p className="text-base text-steel-600">Score {carrier.score} · Pickup coverage: {carrier.coverage?.pickup ? humanize(carrier.coverage.pickup) : 'none recorded'} · Delivery coverage: {carrier.coverage?.delivery ? humanize(carrier.coverage.delivery) : 'none recorded'}</p>
                        <p className="text-base text-steel-600">{(carrier.equipmentTypes ?? []).join(', ') || 'No equipment listed'}{carrier.crossBorderCapability ? ' · Cross-border' : ''}</p>
                      </div>
                      {canAssign && <Button onClick={() => open('assign', carrier)} aria-label={`Assign ${carrier.companyName}`}>Assign</Button>}
                      {hasCarrier && load.carrier.id !== carrier.carrierId && <Button variant="secondary" onClick={() => open('reassign', carrier)} aria-label={`Replace the carrier with ${carrier.companyName}`}>Reassign</Button>}
                      {hasCarrier && load.carrier.id === carrier.carrierId && <Badge tone="info">Current carrier</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Not eligible" description="The server’s reasons for each carrier that cannot take this load.">
              {m.excluded.length === 0 ? (
                <p className="text-base text-steel-600">Every evaluated carrier is eligible.</p>
              ) : (
                <ul className="divide-y divide-steel-200">
                  {m.excluded.map((carrier) => (
                    <li key={carrier.carrierId} className="py-4 first:pt-0 last:pb-0">
                      <p className="flex flex-wrap items-center gap-3 text-lg font-bold">
                        <Link to={`/admin/carriers/${encodeURIComponent(carrier.carrierId)}`} className="break-words underline underline-offset-4">{carrier.companyName}</Link>
                        <Badge tone="danger"><XCircle className="mr-1 size-4" aria-hidden="true" />Not eligible</Badge>
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-6 text-base">
                        {carrier.reasons.map((reason) => <li key={reason.code}>{reason.message}</li>)}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
              {m.counts.excluded > m.excluded.length && <p className="mt-3 text-base text-steel-600">Showing the first {m.excluded.length} of {m.counts.excluded} carriers that are not eligible.</p>}
            </Panel>
          </div>
        )}
      </AdminAsyncView>

      {props && <AdminConfirmDialog open {...props} onCancel={() => setDialog(null)} />}
    </AdminPage>
  );
}
