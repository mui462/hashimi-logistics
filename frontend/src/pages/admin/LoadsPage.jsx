import AdminListView from '../../components/admin/AdminListView';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import { CROSS_BORDER_OPTIONS, COUNTRY_OPTIONS, EQUIPMENT_OPTIONS, carrierOptions, customerOptions } from '../../components/admin/filterOptions';
import { EntityLink, PartnerLink, adminPath, stopLabel } from '../../components/admin/adminLinks';
import Button from '../../components/common/Button';
import { LOAD_FILTER_STATUSES, options } from '../../config/adminStatuses';
import { listLoads } from '../../services/adminService';
import { formatDate, formatMoney } from '../../utils/format';

const FIELDS = [
  { name: 'q', label: 'Search', type: 'search' },
  { name: 'status', label: 'Status', type: 'select', options: options(LOAD_FILTER_STATUSES) },
  { name: 'unassigned', label: 'Carrier', type: 'select', options: [{ value: 'true', label: 'No carrier assigned' }] },
  { name: 'customerId', label: 'Customer', type: 'select', optionsLoader: customerOptions },
  { name: 'carrierId', label: 'Assigned carrier', type: 'select', optionsLoader: carrierOptions },
  { name: 'equipmentType', label: 'Equipment', type: 'select', options: EQUIPMENT_OPTIONS },
  { name: 'crossBorder', label: 'Domestic or cross-border', type: 'select', options: CROSS_BORDER_OPTIONS },
  { name: 'originCountry', label: 'Origin country', type: 'select', options: COUNTRY_OPTIONS },
  { name: 'destinationCountry', label: 'Destination country', type: 'select', options: COUNTRY_OPTIONS },
  { name: 'pickupFrom', label: 'Pickup from', type: 'date' },
  { name: 'pickupTo', label: 'Pickup to', type: 'date' },
];

const COLUMNS = [
  { key: 'number', header: 'Load #', primary: true, render: (load) => <EntityLink to={adminPath('loads', load.id)}>{load.loadNumber}</EntityLink> },
  { key: 'customer', header: 'Customer', render: (load) => <PartnerLink kind="customers" partner={load.customer} /> },
  { key: 'origin', header: 'Origin', render: (load) => stopLabel(load.origin) },
  { key: 'destination', header: 'Destination', render: (load) => stopLabel(load.destination) },
  { key: 'equipment', header: 'Equipment', render: (load) => load.equipmentType ?? '—' },
  { key: 'pickup', header: 'Pickup', render: (load) => (load.pickup?.earliestLocal ? load.pickup.earliestLocal : formatDate(load.pickup?.earliest)) },
  { key: 'carrier', header: 'Carrier', render: (load) => (load.carrier ? <PartnerLink kind="carriers" partner={load.carrier} /> : <span className="text-steel-600">Unassigned</span>) },
  { key: 'status', header: 'Status', render: (load) => <AdminStatusBadge status={load.status} operationsStatus={load.operationsStatus} /> },
  { key: 'margin', header: 'Margin', render: (load) => formatMoney(load.pricing?.brokerMargin) },
  { key: 'created', header: 'Created', render: (load) => formatDate(load.createdAt) },
  { key: 'actions', header: 'Actions', render: (load) => <Button to={adminPath('loads', load.id)} variant="secondary" size="sm" aria-label={`Open load ${load.loadNumber}`}>Open</Button> },
];

export default function LoadsPage() {
  return (
    <AdminPage title="Loads" description="Freight created from accepted quotes. Open a load to schedule it, find a carrier and follow it through delivery.">
      <AdminListView fetcher={listLoads} fields={FIELDS} columns={COLUMNS} getKey={(load) => load.id} caption="Loads" emptyTitle="No loads yet" emptyDescription="Loads are created when you convert an accepted quote." />
    </AdminPage>
  );
}
