import AdminListView from '../../components/admin/AdminListView';
import AdminPage from '../../components/admin/AdminPage';
import { EntityLink, PartnerLink } from '../../components/admin/adminLinks';
import { carrierOptions } from '../../components/admin/filterOptions';
import Button from '../../components/common/Button';
import { FinanceBadge, Money } from '../../components/finance/FinanceBits';
import { options } from '../../config/adminStatuses';
import { PAYABLE_STATUSES } from '../../config/finance';
import { listPayables } from '../../services/financeService';
import { formatDate } from '../../utils/format';

const FIELDS = [
  { name: 'q', label: 'Payable number', type: 'search' },
  { name: 'status', label: 'Status', type: 'select', options: options(PAYABLE_STATUSES) },
  { name: 'carrierId', label: 'Carrier', type: 'select', optionsLoader: carrierOptions },
  { name: 'sort', label: 'Sort by', type: 'select', options: [{ value: 'createdAt', label: 'Created' }, { value: 'dueDate', label: 'Due date' }, { value: 'amount', label: 'Amount' }, { value: 'payableNumber', label: 'Payable number' }] },
  { name: 'order', label: 'Order', type: 'select', options: [{ value: 'desc', label: 'Newest / highest first' }, { value: 'asc', label: 'Oldest / lowest first' }] },
];
const COLUMNS = [
  { key: 'number', header: 'Payable', primary: true, render: (p) => <EntityLink to={`/admin/finance/payables/${p.id}`} touch>{p.payableNumber}</EntityLink> },
  { key: 'carrier', header: 'Carrier', render: (p) => <PartnerLink kind="carriers" partner={{ id: p.carrierId, companyName: p.carrierName }} /> },
  { key: 'load', header: 'Load', render: (p) => p.loadNumber ?? '—' },
  { key: 'status', header: 'Status', render: (p) => <FinanceBadge status={p.status} /> },
  { key: 'amount', header: 'Amount owed', render: (p) => <Money amount={p.amount} currency={p.currency} /> },
  { key: 'paid', header: 'Paid (recorded)', render: (p) => <Money amount={p.amountPaid} currency={p.currency} /> },
  { key: 'outstanding', header: 'Outstanding', render: (p) => <Money amount={p.outstanding} currency={p.currency} /> },
  { key: 'due', header: 'Due', render: (p) => formatDate(p.dueDate, { utc: true }) },
];

export default function FinancePayablesPage() {
  return (
    <AdminPage
      title="Carrier payables"
      trail={[{ label: 'Finance', to: '/admin/finance' }, { label: 'Carrier payables' }]}
      description="Amounts owed to carriers for assigned loads. A payable is an obligation, not proof that the carrier was paid."
      actions={<Button to="/admin/finance/payables/new">New payable</Button>}
    >
      <AdminListView fetcher={listPayables} fields={FIELDS} columns={COLUMNS} getKey={(p) => p.id} caption="Carrier payables" emptyTitle="No carrier payables yet" emptyDescription="Create a payable from a load that has an assigned carrier." />
    </AdminPage>
  );
}
