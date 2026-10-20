import { Wallet } from 'lucide-react';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import FilterChips from '../../components/customer/FilterChips';
import Pagination from '../../components/customer/Pagination';
import ResponsiveTable from '../../components/customer/ResponsiveTable';
import StatCard from '../../components/customer/StatCard';
import StatusBadge from '../../components/customer/StatusBadge';
import { PAYMENT_STATUS } from '../../config/customerStatuses';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { listPayments } from '../../services/carrierService';
import { formatAmount, formatDate, orDash } from '../../utils/format';

// Payments are shown as the platform stores them: a reference, the load, an amount, a status and a date.
// Invoice numbers, due dates and line items do not exist yet, so none are shown.
const COLUMNS = [
  { key: 'ref', header: 'Reference', primary: true, render: (p) => p.reference ?? 'Not assigned' },
  { key: 'load', header: 'Load', render: (p) => orDash(p.loadNumber) },
  { key: 'amount', header: 'Amount', render: (p) => formatAmount(p.amount, p.currency) },
  { key: 'status', header: 'Status', render: (p) => <StatusBadge kind="payment" status={p.status} /> },
  { key: 'paid', header: 'Paid on', render: (p) => formatDate(p.paidAt) },
  { key: 'recorded', header: 'Recorded', render: (p) => formatDate(p.recordedAt) },
];
const STATUSES = Object.keys(PAYMENT_STATUS);

export default function PaymentsPage() {
  useDocumentTitle('Payments');
  const [params, setParams] = useSearchParams();
  const status = STATUSES.includes(params.get('status')) ? params.get('status') : '';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const state = useAsyncData(useCallback(() => listPayments({ page, ...(status ? { status } : {}) }), [page, status]));

  const update = (next) => setParams((previous) => {
    const merged = new URLSearchParams(previous);
    Object.entries(next).forEach(([key, value]) => (value ? merged.set(key, value) : merged.delete(key)));
    return merged;
  });

  return (
    <div className="space-y-8">
      <PageHeader title="Payments" description="Payment records for the loads you haul." />
      <FilterChips label="Filter by status" value={status} onChange={(value) => update({ status: value, page: '' })} options={STATUSES.map((value) => ({ value, label: PAYMENT_STATUS[value].label }))} />
      <AsyncView
        state={state}
        label="Loading your payments"
        errorTitle="We could not load your payments"
        isEmpty={(data) => data.items.length === 0}
        empty={<EmptyState icon={Wallet} title={status ? `No ${PAYMENT_STATUS[status].label.toLowerCase()} payments` : 'No payments yet'} description={status ? 'Try a different status filter.' : 'Payments for your completed loads will appear here.'} />}
      >
        {(data) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label="Pending payments" value={data.summary.pendingCount} />
              <StatCard
                label="Amount pending"
                value={data.summary.pendingTotals.length === 0 ? formatAmount(0) : data.summary.pendingTotals.map((t) => formatAmount(t.amount, t.currency)).join(' + ')}
                detail="Pending, processing and failed records"
              />
            </div>
            <div className="rounded-lg border border-steel-200 bg-white p-4 shadow-sm sm:p-6">
              <ResponsiveTable tableFrom="lg" caption="Your payments" columns={COLUMNS} rows={data.items} getKey={(p) => p.id} />
              <Pagination pagination={data.pagination} onPage={(next) => update({ page: next === 1 ? '' : String(next) })} />
            </div>
            <p className="text-base text-steel-600">Online payment processing is not available yet. For payment questions, please contact our team.</p>
          </div>
        )}
      </AsyncView>
    </div>
  );
}
