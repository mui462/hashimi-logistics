import AdminListView from '../../components/admin/AdminListView';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import { CROSS_BORDER_OPTIONS, carrierOptions, customerOptions } from '../../components/admin/filterOptions';
import { EntityLink, PartnerLink, adminPath, stopLabel } from '../../components/admin/adminLinks';
import Button from '../../components/common/Button';
import { SHIPMENT_FILTER_STATUSES, humanize, options } from '../../config/adminStatuses';
import { listShipments } from '../../services/adminService';
import { formatDateTime } from '../../utils/format';

const FIELDS = [
  { name: 'q', label: 'Search shipment or tracking number', type: 'search' },
  { name: 'status', label: 'Status', type: 'select', options: options(SHIPMENT_FILTER_STATUSES) },
  { name: 'customerId', label: 'Customer', type: 'select', optionsLoader: customerOptions },
  { name: 'carrierId', label: 'Carrier', type: 'select', optionsLoader: carrierOptions },
  { name: 'crossBorder', label: 'Domestic or cross-border', type: 'select', options: CROSS_BORDER_OPTIONS },
  { name: 'exception', label: 'Exceptions', type: 'select', options: [{ value: 'true', label: 'Open exceptions only' }] },
  { name: 'createdFrom', label: 'Created from', type: 'date' },
  { name: 'createdTo', label: 'Created to', type: 'date' },
];

const COLUMNS = [
  { key: 'number', header: 'Shipment #', primary: true, render: (s) => <EntityLink to={adminPath('shipments', s.id)}>{s.shipmentNumber ?? s.trackingNumber}</EntityLink> },
  { key: 'tracking', header: 'Tracking #', render: (s) => s.trackingNumber },
  { key: 'load', header: 'Load #', render: (s) => (s.loadNumber ? <EntityLink to={adminPath('loads', s.loadId)}>{s.loadNumber}</EntityLink> : '—') },
  { key: 'customer', header: 'Customer', render: (s) => <PartnerLink kind="customers" partner={s.customer} /> },
  { key: 'carrier', header: 'Carrier', render: (s) => <PartnerLink kind="carriers" partner={s.carrier} /> },
  { key: 'origin', header: 'Origin', render: (s) => stopLabel(s.origin) },
  { key: 'destination', header: 'Destination', render: (s) => stopLabel(s.destination) },
  { key: 'status', header: 'Status', render: (s) => <AdminStatusBadge status={s.status} operationsStatus={s.operationsStatus} /> },
  { key: 'border', header: 'Border status', render: (s) => (s.isCrossBorder ? humanize(s.borderStatus) : 'Not applicable') },
  { key: 'updated', header: 'Last update', render: (s) => formatDateTime(s.updatedAt) },
  { key: 'actions', header: 'Actions', render: (s) => <Button to={adminPath('shipments', s.id)} variant="secondary" size="sm" aria-label={`Open shipment ${s.shipmentNumber ?? s.trackingNumber}`}>Open</Button> },
];

export default function ShipmentsPage() {
  return (
    <AdminPage title="Shipments" description="Freight in motion. Open a shipment to dispatch it, record progress and handle exceptions.">
      <AdminListView fetcher={listShipments} fields={FIELDS} columns={COLUMNS} getKey={(s) => s.id} caption="Shipments" emptyTitle="No shipments yet" emptyDescription="A shipment is created from a load once a carrier is assigned." />
    </AdminPage>
  );
}
