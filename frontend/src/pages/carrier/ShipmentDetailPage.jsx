import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import BackLink from '../../components/customer/BackLink';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import CarrierDocumentsPanel from '../../components/files/CarrierDocumentsPanel';
import ResponsiveTable from '../../components/customer/ResponsiveTable';
import StatusBadge from '../../components/customer/StatusBadge';
import TrackingTimeline from '../../components/tracking/TrackingTimeline';
import { PATHS } from '../../config/paths';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getShipment } from '../../services/carrierService';
import { ApiRequestError } from '../../utils/apiRequestError';
import { formatAmount, formatDate, formatDateTime, formatMoney, formatStop, formatWeight } from '../../utils/format';

const C = PATHS.carrier;
const windowText = (value) => (value?.earliest ? `${formatDateTime(value.earliest)}${value.latest ? ` – ${formatDateTime(value.latest)}` : ''}` : null);
const BORDER_LABELS = { not_applicable: 'Not applicable', pending: 'Pending', in_progress: 'In progress', cleared: 'Cleared', held: 'Held' };

const PAYMENT_COLUMNS = [
  { key: 'ref', header: 'Reference', primary: true, render: (p) => p.reference ?? 'Not assigned' },
  { key: 'amount', header: 'Amount', render: (p) => formatAmount(p.amount, p.currency) },
  { key: 'status', header: 'Status', render: (p) => <StatusBadge kind="payment" status={p.status} /> },
  { key: 'paid', header: 'Paid on', render: (p) => formatDate(p.paidAt) },
];

function ShipmentDetail({ shipment, onChanged }) {
  return (
    <div className="space-y-8">
      <Panel title="Overview">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <StatusBadge kind="shipment" status={shipment.status} />
          {shipment.currentLocation && <p className="text-lg">Last known location: <strong>{formatStop(shipment.currentLocation)}</strong></p>}
        </div>
        <DetailList items={[
          { label: 'Tracking number', value: shipment.trackingNumber },
          { label: 'Load number', value: shipment.loadNumber },
          { label: 'Origin', value: formatStop(shipment.origin) },
          { label: 'Destination', value: formatStop(shipment.destination) },
          { label: 'Equipment', value: shipment.equipmentType },
          { label: 'Commodity', value: shipment.commodity },
          { label: 'Weight', value: formatWeight(shipment.weight) },
          { label: 'Border status', value: BORDER_LABELS[shipment.borderStatus] ?? shipment.borderStatus },
          { label: 'Estimated pickup', value: formatDateTime(shipment.estimatedPickup) },
          { label: 'Actual pickup', value: formatDateTime(shipment.actualPickup) },
          { label: 'Estimated delivery', value: formatDateTime(shipment.estimatedDelivery) },
          { label: 'Actual delivery', value: formatDateTime(shipment.actualDelivery) },
          { label: 'Pickup window', value: windowText(shipment.pickupWindow) },
          { label: 'Delivery window', value: windowText(shipment.deliveryWindow) },
        ]} />
        {shipment.exception && (
          <p role="status" className="mt-6 border-l-4 border-danger-700 bg-danger-50 p-4 text-base font-medium text-danger-700">
            An issue was reported on this shipment ({shipment.exception.reason.replace(/_/g, ' ')}){shipment.exception.resolved ? ' and has been resolved' : ''}. Please contact our team for details.
          </p>
        )}
      </Panel>

      <Panel title="Tracking timeline">
        <TrackingTimeline shipment={shipment} />
      </Panel>

      {shipment.borderEvents.length > 0 && (
        <Panel title="Border events">
          <ul className="divide-y divide-steel-200">
            {shipment.borderEvents.map((event, index) => (
              <li key={`${event.event}-${event.timestamp}-${index}`} className="py-3">
                <p className="text-base font-semibold capitalize">{event.event.replace(/_/g, ' ')}</p>
                <p className="text-base text-steel-600">{formatDateTime(event.timestamp)}{event.location ? ` · ${event.location}` : ''}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <CarrierDocumentsPanel shipment={shipment} onChanged={onChanged} />

      <div className="grid gap-8 xl:grid-cols-2">
        <Panel title="Charges">
          <DetailList columns={1} items={[{ label: 'Your pay for this load', value: shipment.pay ? formatMoney(shipment.pay) : 'Not available yet' }]} />
          <div className="mt-6">
            {shipment.payments.length === 0 ? (
              <p className="text-base text-steel-600">No payments recorded yet.</p>
            ) : (
              <ResponsiveTable caption="Payments for this shipment" columns={PAYMENT_COLUMNS} rows={shipment.payments} getKey={(p) => p.id} />
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default function ShipmentDetailPage() {
  const { id } = useParams();
  const state = useAsyncData(useCallback(() => getShipment(id), [id]));
  const notFound = state.error instanceof ApiRequestError && [400, 404].includes(state.error.status);
  useDocumentTitle(state.data ? `Shipment ${state.data.trackingNumber}` : 'Shipment details');

  return (
    <div className="space-y-8">
      <BackLink to={`${C}/shipments`}>Back to Shipments</BackLink>
      <PageHeader title={state.data ? `Shipment ${state.data.trackingNumber}` : 'Shipment details'} />
      {notFound ? (
        <EmptyState title="Shipment not found" description="We could not find that shipment in your account." action={<Button to={`${C}/shipments`}>View my shipments</Button>} />
      ) : (
        <AsyncView state={state} label="Loading shipment" errorTitle="We could not load this shipment">
          {(shipment) => <ShipmentDetail shipment={shipment} onChanged={state.reload} />}
        </AsyncView>
      )}
    </div>
  );
}
