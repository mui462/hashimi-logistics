import { Receipt } from 'lucide-react';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import Pagination from '../../components/customer/Pagination';
import ResponsiveTable from '../../components/customer/ResponsiveTable';
import StatCard from '../../components/customer/StatCard';
import StatusBadge from '../../components/customer/StatusBadge';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { listInvoices } from '../../services/customerService';
import { formatAmount, formatDate, orDash } from '../../utils/format';

// Billing records are shown as the platform stores them: a reference, the load, an amount, a status and a date.
// Invoice numbers, issue and due dates and line items do not exist yet, so none are shown.
const COLUMNS = [
  { key: 'ref', header: 'Reference', primary: true, render: (i) => i.reference ?? 'Not assigned' },
  { key: 'load', header: 'Load', render: (i) => orDash(i.loadNumber) },
  { key: 'amount', header: 'Amount', render: (i) => formatAmount(i.amount, i.currency) },
  { key: 'status', header: 'Status', render: (i) => <StatusBadge kind="payment" status={i.status} /> },
  { key: 'paid', header: 'Paid on', render: (i) => formatDate(i.paidAt) },
  { key: 'recorded', header: 'Recorded', render: (i) => formatDate(i.recordedAt) },
];

export default function InvoicesPage() {
  useDocumentTitle('Invoices');
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const state = useAsyncData(useCallback(() => listInvoices({ page }), [page]));

  return (
    <div className="space-y-8">
      <PageHeader title="Invoices" description="Billing records for your shipments." />
      <AsyncView
        state={state}
        label="Loading your invoices"
        errorTitle="We could not load your invoices"
        isEmpty={(data) => data.items.length === 0}
        empty={<EmptyState icon={Receipt} title="No invoices available" description="Invoices for your shipments will appear here once they are issued." />}
      >
        {(data) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label="Outstanding invoices" value={data.summary.outstandingCount} />
              <StatCard
                label="Amount outstanding"
                value={data.summary.outstandingTotals.length === 0 ? formatAmount(0) : data.summary.outstandingTotals.map((t) => formatAmount(t.amount, t.currency)).join(' + ')}
                detail="Pending, processing and failed records"
              />
            </div>
            <div className="rounded-lg border border-steel-200 bg-white p-4 shadow-sm sm:p-6">
              <ResponsiveTable tableFrom="lg" caption="Your invoices" columns={COLUMNS} rows={data.items} getKey={(i) => i.id} />
              <Pagination pagination={data.pagination} onPage={(next) => setParams(next === 1 ? {} : { page: String(next) })} />
            </div>
            <p className="text-base text-steel-600">Online payment is not available yet. For billing questions, please contact our team.</p>
          </div>
        )}
      </AsyncView>
    </div>
  );
}
