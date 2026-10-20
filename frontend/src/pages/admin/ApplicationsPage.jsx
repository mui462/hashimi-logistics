import AdminListView from '../../components/admin/AdminListView';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import { EntityLink, adminPath } from '../../components/admin/adminLinks';
import Button from '../../components/common/Button';
import { options } from '../../config/adminStatuses';
import { listApplications } from '../../services/adminService';
import { formatDate } from '../../utils/format';

const FIELDS = [
  { name: 'q', label: 'Search name, contact, email, MC or DOT', type: 'search' },
  { name: 'status', label: 'Status', type: 'select', options: options(['pending', 'under_review', 'approved', 'rejected']) },
];
const COLUMNS = [
  { key: 'company', header: 'Company', primary: true, render: (a) => <EntityLink to={adminPath('carrier-applications', a.id)}>{a.companyName}</EntityLink> },
  { key: 'contact', header: 'Contact', render: (a) => a.contactPerson },
  { key: 'email', header: 'Email', render: (a) => a.email },
  { key: 'mc', header: 'MC / DOT', render: (a) => [a.MCNumber && `MC ${a.MCNumber}`, a.DOTNumber && `DOT ${a.DOTNumber}`].filter(Boolean).join(' · ') || '—' },
  { key: 'status', header: 'Status', render: (a) => <AdminStatusBadge status={a.status} /> },
  { key: 'submitted', header: 'Submitted', render: (a) => formatDate(a.createdAt) },
  { key: 'actions', header: 'Actions', render: (a) => <Button to={adminPath('carrier-applications', a.id)} variant="secondary" size="sm" aria-label={`Open application from ${a.companyName}`}>Open</Button> },
];

export default function ApplicationsPage() {
  return (
    <AdminPage title="Carrier applications" description="Companies that applied to become carriers.">
      <AdminListView fetcher={listApplications} fields={FIELDS} columns={COLUMNS} getKey={(a) => a.id} caption="Carrier applications" emptyTitle="No applications yet" emptyDescription="Applications from the Become a Carrier form appear here." />
    </AdminPage>
  );
}
