import { Truck } from 'lucide-react';
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import FilterChips from '../../components/customer/FilterChips';
import Pagination from '../../components/customer/Pagination';
import ResponsiveTable from '../../components/customer/ResponsiveTable';
import StatusBadge from '../../components/customer/StatusBadge';
import { SHIPMENT_FILTERS, shipmentStatus } from '../../config/customerStatuses';
import { PATHS } from '../../config/paths';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { listShipments } from '../../services/customerService';
import { formatDate, formatStop, orDash } from '../../utils/format';

const COLUMNS = [
  { key: 'tracking', header: 'Tracking number', primary: true, render: (s) => <Link className="underline underline-offset-4" to={`${PATHS.customer}/shipments/${s.id}`}>{s.trackingNumber}</Link> },
  { key: 'status', header: 'Status', render: (s) => <StatusBadge kind="shipment" status={s.status} /> },
  { key: 'origin', header: 'Origin', render: (s) => formatStop(s.origin) },
  { key: 'destination', header: 'Destination', render: (s) => formatStop(s.destination) },
  { key: 'equipment', header: 'Equipment', render: (s) => orDash(s.equipmentType) },
  { key: 'eta', header: 'Estimated delivery', render: (s) => (s.actualDelivery ? `Delivered ${formatDate(s.actualDelivery)}` : formatDate(s.estimatedDelivery)) },
  { key: 'action', header: 'Action', render: (s) => <Link className="font-semibold underline underline-offset-4" to={`${PATHS.customer}/shipments/${s.id}`}>View<span className="sr-only"> {s.trackingNumber}</span></Link> },
];

export default function ShipmentsPage() {
  useDocumentTitle('My shipments');
  const [params, setParams] = useSearchParams();
  const status = SHIPMENT_FILTERS.includes(params.get('status')) ? params.get('status') : '';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const load = useCallback(() => listShipments({ page, ...(status ? { status } : {}) }), [page, status]);
  const state = useAsyncData(load);

  const update = (next) => setParams((previous) => {
    const merged = new URLSearchParams(previous);
    Object.entries(next).forEach(([key, value]) => (value ? merged.set(key, value) : merged.delete(key)));
    return merged;
  });

  return (
    <div className="space-y-8">
      <PageHeader title="My shipments" description="Every shipment booked for your account." actions={<Button to={`${PATHS.customer}/tracking`} variant="secondary">Track a shipment</Button>} />
      <FilterChips label="Filter by status" value={status} onChange={(value) => update({ status: value, page: '' })} options={SHIPMENT_FILTERS.map((value) => ({ value, label: shipmentStatus(value).label }))} />
      <AsyncView
        state={state}
        label="Loading your shipments"
        errorTitle="We could not load your shipments"
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={Truck}
            title={status ? `No ${shipmentStatus(status).label.toLowerCase()} shipments` : 'No shipments yet'}
            description={status ? 'Try a different status filter.' : 'Once your freight is booked, your shipments will appear here.'}
            action={status ? <Button variant="secondary" onClick={() => update({ status: '', page: '' })}>Show all shipments</Button> : <Button to={`${PATHS.customer}/quotes/new`}>Request a quote</Button>}
          />
        }
      >
        {(data) => (
          <div className="rounded-lg border border-steel-200 bg-white p-4 shadow-sm sm:p-6">
            <ResponsiveTable caption="Your shipments" columns={COLUMNS} rows={data.items} getKey={(s) => s.id} />
            <Pagination pagination={data.pagination} onPage={(next) => update({ page: next === 1 ? '' : String(next) })} />
          </div>
        )}
      </AsyncView>
    </div>
  );
}
