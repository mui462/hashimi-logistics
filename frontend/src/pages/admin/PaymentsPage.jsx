import AdminListView from '../../components/admin/AdminListView';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import { EntityLink, PartnerLink, adminPath } from '../../components/admin/adminLinks';
import { carrierOptions, customerOptions } from '../../components/admin/filterOptions';
import Button from '../../components/common/Button';
import { humanize, options } from '../../config/adminStatuses';
import { listPayments } from '../../services/adminService';
import { formatDate, formatMoney } from '../../utils/format';

const FIELDS = [
  { name: 'status', label: 'Status', type: 'select', options: options(['pending', 'processing', 'paid', 'failed', 'cancelled']) },
  { name: 'paymentType', label: 'Type', type: 'select', options: options(['customer_payment', 'carrier_payment', 'other']) },
  { name: 'customerId', label: 'Customer', type: 'select', optionsLoader: customerOptions },
  { name: 'carrierId', label: 'Carrier', type: 'select', optionsLoader: carrierOptions },
  { name: 'createdFrom', label: 'Created from', type: 'date' },
  { name: 'createdTo', label: 'Created to', type: 'date' },
];
const COLUMNS = [
  { key: 'reference', header: 'Reference', primary: true, render: (p) => <EntityLink to={adminPath('payments', p.id)}>{p.referenceNumber ?? 'No reference'}</EntityLink> },
  { key: 'type', header: 'Type', render: (p) => humanize(p.paymentType) },
  { key: 'amount', header: 'Amount', render: (p) => formatMoney(p.amount) },
  { key: 'status', header: 'Status', render: (p) => <AdminStatusBadge status={p.status} /> },
  { key: 'load', header: 'Load', render: (p) => (p.load?.loadNumber ? <EntityLink to={adminPath('loads', p.load.id)}>{p.load.loadNumber}</EntityLink> : '—') },
  { key: 'customer', header: 'Customer', render: (p) => <PartnerLink kind="customers" partner={p.customer} /> },
  { key: 'carrier', header: 'Carrier', render: (p) => <PartnerLink kind="carriers" partner={p.carrier} /> },
  { key: 'paid', header: 'Payment date', render: (p) => formatDate(p.paymentDate) },
  { key: 'created', header: 'Created', render: (p) => formatDate(p.createdAt) },
  { key: 'actions', header: 'Actions', render: (p) => <Button to={adminPath('payments', p.id)} variant="secondary" size="sm" aria-label={`Open payment ${p.referenceNumber ?? ''}`}>Details</Button> },
];

export default function PaymentsPage() {
  return (
    <AdminPage title="Payments" description="Payment records only. No payment processor is connected, so nothing here moves money.">
      <AdminListView fetcher={listPayments} fields={FIELDS} columns={COLUMNS} getKey={(p) => p.id} caption="Payments" emptyTitle="No payment records yet" emptyDescription="Payment records are listed here when they exist." />
    </AdminPage>
  );
}
