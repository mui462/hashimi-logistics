import AdminListView from '../../components/admin/AdminListView';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import { EntityLink, adminPath } from '../../components/admin/adminLinks';
import Button from '../../components/common/Button';
import { options } from '../../config/adminStatuses';
import { listCustomers } from '../../services/adminService';
import { formatDate } from '../../utils/format';

const FIELDS = [
  { name: 'q', label: 'Search name, contact or email', type: 'search' },
  { name: 'status', label: 'Status', type: 'select', options: options(['active', 'inactive', 'suspended']) },
];
const COLUMNS = [
  { key: 'company', header: 'Company', primary: true, render: (c) => <EntityLink to={adminPath('customers', c.id)}>{c.companyName}</EntityLink> },
  { key: 'contact', header: 'Contact', render: (c) => c.contactPerson ?? '—' },
  { key: 'email', header: 'Email', render: (c) => c.email ?? '—' },
  { key: 'phone', header: 'Phone', render: (c) => c.phone ?? '—' },
  { key: 'status', header: 'Status', render: (c) => <AdminStatusBadge status={c.status} /> },
  { key: 'created', header: 'Joined', render: (c) => formatDate(c.createdAt) },
  { key: 'actions', header: 'Actions', render: (c) => <Button to={adminPath('customers', c.id)} variant="secondary" size="sm" aria-label={`Open ${c.companyName}`}>Open</Button> },
];

export default function CustomersPage() {
  return (
    <AdminPage title="Customers" description="Shippers with a portal account.">
      <AdminListView fetcher={listCustomers} fields={FIELDS} columns={COLUMNS} getKey={(c) => c.id} caption="Customers" emptyTitle="No customers yet" emptyDescription="Customers appear here after they register." />
    </AdminPage>
  );
}
