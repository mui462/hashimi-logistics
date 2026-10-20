import AdminListView from '../../components/admin/AdminListView';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import { EntityLink, adminPath } from '../../components/admin/adminLinks';
import Button from '../../components/common/Button';
import { humanize, options } from '../../config/adminStatuses';
import { listContactMessages } from '../../services/adminService';
import { formatDate } from '../../utils/format';

const FIELDS = [
  { name: 'q', label: 'Search name, company, email or subject', type: 'search' },
  { name: 'status', label: 'Status', type: 'select', options: options(['new', 'handled']) },
  { name: 'interest', label: 'About', type: 'select', options: [{ value: 'shipping', label: 'Shipping' }, { value: 'carrier', label: 'Carrier' }, { value: 'general', label: 'General inquiry' }] },
];
const COLUMNS = [
  { key: 'subject', header: 'Subject', primary: true, render: (m) => <EntityLink to={adminPath('contact-messages', m.id)}>{m.subject}</EntityLink> },
  { key: 'from', header: 'From', render: (m) => [m.name, m.company].filter(Boolean).join(' · ') },
  { key: 'email', header: 'Email', render: (m) => m.email },
  { key: 'interest', header: 'About', render: (m) => humanize(m.interest) },
  { key: 'status', header: 'Status', render: (m) => <AdminStatusBadge status={m.status} /> },
  { key: 'received', header: 'Received', render: (m) => formatDate(m.createdAt) },
  { key: 'actions', header: 'Actions', render: (m) => <Button to={adminPath('contact-messages', m.id)} variant="secondary" size="sm" aria-label={`Open message: ${m.subject}`}>Open</Button> },
];

export default function ContactMessagesPage() {
  return (
    <AdminPage title="Contact messages" description="Messages sent through the website contact form. Nothing is e-mailed automatically; reply to the sender yourself, then mark the message handled.">
      <AdminListView fetcher={listContactMessages} fields={FIELDS} columns={COLUMNS} getKey={(m) => m.id} caption="Contact messages" emptyTitle="No messages yet" emptyDescription="Messages from the website contact form appear here." />
    </AdminPage>
  );
}
