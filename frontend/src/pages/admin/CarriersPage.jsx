import AdminListView from '../../components/admin/AdminListView';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import { EQUIPMENT_OPTIONS } from '../../components/admin/filterOptions';
import { EntityLink, adminPath } from '../../components/admin/adminLinks';
import Button from '../../components/common/Button';
import { options } from '../../config/adminStatuses';
import { listCarriers } from '../../services/adminService';
import { formatDate } from '../../utils/format';

const FIELDS = [
  { name: 'q', label: 'Search name, contact, email, MC or DOT', type: 'search' },
  { name: 'status', label: 'Status', type: 'select', options: options(['active', 'inactive', 'suspended', 'pending']) },
  { name: 'complianceStatus', label: 'Compliance', type: 'select', options: options(['pending', 'approved', 'rejected', 'expired']) },
  { name: 'equipmentType', label: 'Equipment', type: 'select', options: EQUIPMENT_OPTIONS },
  { name: 'crossBorder', label: 'Cross-border capability', type: 'select', options: [{ value: 'true', label: 'Can cross borders' }, { value: 'false', label: 'Domestic only' }] },
];
const COLUMNS = [
  { key: 'company', header: 'Company', primary: true, render: (c) => <EntityLink to={adminPath('carriers', c.id)}>{c.companyName}</EntityLink> },
  { key: 'contact', header: 'Contact', render: (c) => c.contactPerson ?? '—' },
  { key: 'mc', header: 'MC / DOT', render: (c) => [c.MCNumber && `MC ${c.MCNumber}`, c.DOTNumber && `DOT ${c.DOTNumber}`].filter(Boolean).join(' · ') || '—' },
  { key: 'equipment', header: 'Equipment', render: (c) => c.equipmentTypes.join(', ') || '—' },
  { key: 'status', header: 'Status', render: (c) => <AdminStatusBadge status={c.status} /> },
  { key: 'compliance', header: 'Compliance', render: (c) => <AdminStatusBadge status={c.complianceStatus} /> },
  { key: 'border', header: 'Cross-border', render: (c) => (c.crossBorderCapability ? 'Yes' : 'No') },
  { key: 'created', header: 'Joined', render: (c) => formatDate(c.createdAt) },
  { key: 'actions', header: 'Actions', render: (c) => <Button to={adminPath('carriers', c.id)} variant="secondary" size="sm" aria-label={`Open ${c.companyName}`}>Open</Button> },
];

export default function CarriersPage() {
  return (
    <AdminPage title="Carriers" description="Trucking companies with a portal account.">
      <AdminListView fetcher={listCarriers} fields={FIELDS} columns={COLUMNS} getKey={(c) => c.id} caption="Carriers" emptyTitle="No carriers yet" emptyDescription="Carriers appear here after they register." />
    </AdminPage>
  );
}
