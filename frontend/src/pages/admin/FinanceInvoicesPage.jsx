import AdminListView from '../../components/admin/AdminListView';
import AdminPage from '../../components/admin/AdminPage';
import { EntityLink, PartnerLink } from '../../components/admin/adminLinks';
import { customerOptions } from '../../components/admin/filterOptions';
import Button from '../../components/common/Button';
import { InvoiceStatus, Money } from '../../components/finance/FinanceBits';
import { options } from '../../config/adminStatuses';
import { INVOICE_FILTER_STATUSES } from '../../config/finance';
import { listInvoices } from '../../services/financeService';
import { formatDate } from '../../utils/format';

const FIELDS = [
  { name: 'q', label: 'Invoice number', type: 'search' },
  { name: 'status', label: 'Status', type: 'select', options: options(INVOICE_FILTER_STATUSES) },
  { name: 'customerId', label: 'Customer', type: 'select', optionsLoader: customerOptions },
  { name: 'dueFrom', label: 'Due from', type: 'date' },
  { name: 'dueTo', label: 'Due to', type: 'date' },
  { name: 'sort', label: 'Sort by', type: 'select', options: [{ value: 'createdAt', label: 'Created' }, { value: 'dueDate', label: 'Due date' }, { value: 'total', label: 'Total' }, { value: 'invoiceNumber', label: 'Invoice number' }] },
  { name: 'order', label: 'Order', type: 'select', options: [{ value: 'desc', label: 'Newest / highest first' }, { value: 'asc', label: 'Oldest / lowest first' }] },
];
const COLUMNS = [
  { key: 'number', header: 'Invoice', primary: true, render: (i) => <EntityLink to={`/admin/finance/invoices/${i.id}`} touch>{i.invoiceNumber}</EntityLink> },
  { key: 'customer', header: 'Customer', render: (i) => <PartnerLink kind="customers" partner={{ id: i.customerId, companyName: i.customerName }} /> },
  { key: 'load', header: 'Load', render: (i) => i.loadNumber ?? '—' },
  { key: 'status', header: 'Status', render: (i) => <InvoiceStatus invoice={i} /> },
  { key: 'total', header: 'Total', render: (i) => <Money amount={i.total} currency={i.currency} /> },
  { key: 'paid', header: 'Paid (recorded)', render: (i) => <Money amount={i.amountPaid} currency={i.currency} /> },
  { key: 'outstanding', header: 'Outstanding', render: (i) => <Money amount={i.outstanding} currency={i.currency} /> },
  { key: 'due', header: 'Due', render: (i) => formatDate(i.dueDate, { utc: true }) },
];

export default function FinanceInvoicesPage() {
  return (
    <AdminPage
      title="Customer invoices"
      trail={[{ label: 'Finance', to: '/admin/finance' }, { label: 'Customer invoices' }]}
      description="Invoices created from loads. Issued invoices cannot be edited; void and reissue to correct one."
      actions={<Button to="/admin/finance/invoices/new">New invoice</Button>}
    >
      <AdminListView fetcher={listInvoices} fields={FIELDS} columns={COLUMNS} getKey={(i) => i.id} caption="Customer invoices" emptyTitle="No invoices yet" emptyDescription="Create a draft invoice from a load to get started." />
    </AdminPage>
  );
}
