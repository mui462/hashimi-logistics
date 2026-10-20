import AdminListView from '../../components/admin/AdminListView';
import AdminPage from '../../components/admin/AdminPage';
import { EntityLink } from '../../components/admin/adminLinks';
import { FinanceBadge, Money, RecordedNotice } from '../../components/finance/FinanceBits';
import { options } from '../../config/adminStatuses';
import { methodLabel } from '../../config/finance';
import { listTransactions } from '../../services/financeService';
import { formatDate, formatDateTime } from '../../utils/format';

const FIELDS = [
  { name: 'kind', label: 'Kind', type: 'select', options: [{ value: 'customer_receipt', label: 'Customer receipt' }, { value: 'carrier_payout', label: 'Carrier payout' }] },
  { name: 'status', label: 'Status', type: 'select', options: options(['succeeded', 'failed', 'reversed']) },
  { name: 'entryType', label: 'Entry', type: 'select', options: [{ value: 'payment', label: 'Payment' }, { value: 'reversal', label: 'Reversal' }] },
  { name: 'from', label: 'Payment date from', type: 'date' },
  { name: 'to', label: 'Payment date to', type: 'date' },
  { name: 'sort', label: 'Sort by', type: 'select', options: [{ value: 'recordedAt', label: 'Recorded' }, { value: 'paymentDate', label: 'Payment date' }, { value: 'amount', label: 'Amount' }] },
  { name: 'order', label: 'Order', type: 'select', options: [{ value: 'desc', label: 'Newest / highest first' }, { value: 'asc', label: 'Oldest / lowest first' }] },
];
const COLUMNS = [
  { key: 'date', header: 'Payment date', primary: true, render: (t) => <time dateTime={t.paymentDate}>{formatDate(t.paymentDate, { utc: true })}</time> },
  { key: 'kind', header: 'Kind', render: (t) => `${t.kind === 'customer_receipt' ? 'Customer receipt' : 'Carrier payout'}${t.entryType === 'reversal' ? ' (reversal)' : ''}` },
  { key: 'amount', header: 'Amount', render: (t) => <Money amount={t.amount} currency={t.currency} /> },
  { key: 'method', header: 'Method / reference', render: (t) => <span className="block">{methodLabel(t.method)}<span className="block text-steel-600">{t.reference ?? 'No reference'}</span></span> },
  { key: 'status', header: 'Status', render: (t) => <FinanceBadge status={t.status} /> },
  { key: 'recorded', header: 'Recorded', render: (t) => <time dateTime={t.recordedAt}>{formatDateTime(t.recordedAt)}</time> },
  { key: 'record', header: 'Record', render: (t) => <EntityLink touch to={t.invoiceId ? `/admin/finance/invoices/${t.invoiceId}` : `/admin/finance/payables/${t.payableId}`}>Open</EntityLink> },
];

export default function FinanceTransactionsPage() {
  
  return (
    <AdminPage title="Payment records" trail={[{ label: 'Finance', to: '/admin/finance' }, { label: 'Payment records' }]} description="Every customer receipt and carrier payout entry. Entries are never edited or deleted; a mistake is corrected with a linked reversal.">
      <RecordedNotice />
      <AdminListView fetcher={listTransactions} fields={FIELDS} columns={COLUMNS} getKey={(t) => t.id} caption="Payment records" emptyTitle="No payment records yet" emptyDescription="Recorded customer receipts and carrier payouts will be listed here." />
    </AdminPage>
  );
}
