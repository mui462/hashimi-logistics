import { Receipt } from 'lucide-react';
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import FilterChips from '../../components/customer/FilterChips';
import Pagination from '../../components/customer/Pagination';
import ResponsiveTable from '../../components/customer/ResponsiveTable';
import { InvoiceStatus, Money } from '../../components/finance/FinanceBits';
import { NO_ONLINE_PAYMENT } from '../../config/finance';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { listBillingInvoices } from '../../services/financeService';
import { formatDate, orDash } from '../../utils/format';

const STATUSES = [
  { value: 'issued', label: 'Issued' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'void', label: 'Void' },
];

const COLUMNS = [
  { key: 'number', header: 'Invoice', primary: true, render: (i) => <Link className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" to={`/customer/billing/${i.id}`}>{i.invoiceNumber}</Link> },
  { key: 'load', header: 'Load', render: (i) => orDash(i.loadNumber) },
  { key: 'status', header: 'Status', render: (i) => <InvoiceStatus invoice={i} /> },
  { key: 'total', header: 'Total', render: (i) => <Money amount={i.total} currency={i.currency} /> },
  { key: 'paid', header: 'Paid', render: (i) => <Money amount={i.amountPaid} currency={i.currency} /> },
  { key: 'outstanding', header: 'Outstanding', render: (i) => <Money amount={i.outstanding} currency={i.currency} /> },
  { key: 'due', header: 'Due', render: (i) => formatDate(i.dueDate, { utc: true }) },
];

export default function BillingPage() {
  useDocumentTitle('Billing');
  const [params, setParams] = useSearchParams();
  const status = STATUSES.some((s) => s.value === params.get('status')) ? params.get('status') : '';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const state = useAsyncData(useCallback(() => listBillingInvoices({ page, ...(status ? { status } : {}) }), [page, status]));
  const update = (next) => setParams((previous) => {
    const merged = new URLSearchParams(previous);
    Object.entries(next).forEach(([key, value]) => (value ? merged.set(key, value) : merged.delete(key)));
    return merged;
  });

  return (
    <div className="space-y-8">
      <PageHeader title="Billing" description="Invoices issued for your shipments, what has been paid and what is still outstanding." />
      <FilterChips label="Filter by status" value={status} onChange={(value) => update({ status: value, page: '' })} options={STATUSES} />
      <AsyncView
        state={state}
        label="Loading your invoices"
        errorTitle="We could not load your invoices"
        isEmpty={(data) => data.items.length === 0}
        empty={<EmptyState icon={Receipt} title={status ? 'No invoices match this filter' : 'No invoices yet'} description={status ? 'Try a different status filter.' : 'Invoices appear here once they are issued to you.'} />}
      >
        {(data) => (
          <div className="space-y-6">
            <div className="rounded-lg border border-steel-200 bg-white p-4 shadow-sm sm:p-6">
              <ResponsiveTable tableFrom="lg" caption="Your invoices" columns={COLUMNS} rows={data.items} getKey={(i) => i.id} />
              <Pagination pagination={data.pagination} onPage={(next) => update({ page: next === 1 ? '' : String(next) })} />
            </div>
            <p className="text-base text-steel-600">{data.payment?.message ?? NO_ONLINE_PAYMENT}</p>
          </div>
        )}
      </AsyncView>
    </div>
  );
}
