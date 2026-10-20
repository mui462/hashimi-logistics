import { Wallet } from 'lucide-react';
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import FilterChips from '../../components/customer/FilterChips';
import Pagination from '../../components/customer/Pagination';
import ResponsiveTable from '../../components/customer/ResponsiveTable';
import { FinanceBadge, Money } from '../../components/finance/FinanceBits';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { listCarrierPayables } from '../../services/financeService';
import { formatDate, orDash } from '../../utils/format';

const STATUSES = [
  { value: 'approved', label: 'Approved' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'paid', label: 'Paid' },
];
const COLUMNS = [
  { key: 'number', header: 'Payable', primary: true, render: (p) => <Link className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" to={`/carrier/payables/${p.id}`}>{p.payableNumber}</Link> },
  { key: 'load', header: 'Load', render: (p) => orDash(p.loadNumber) },
  { key: 'status', header: 'Status', render: (p) => <FinanceBadge status={p.status} /> },
  { key: 'amount', header: 'Approved amount', render: (p) => <Money amount={p.amount} currency={p.currency} /> },
  { key: 'paid', header: 'Paid (recorded)', render: (p) => <Money amount={p.amountPaid} currency={p.currency} /> },
  { key: 'due', header: 'Due', render: (p) => formatDate(p.dueDate, { utc: true }) },
];

export default function PayablesPage() {
  useDocumentTitle('Payables');
  const [params, setParams] = useSearchParams();
  const status = STATUSES.some((s) => s.value === params.get('status')) ? params.get('status') : '';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const state = useAsyncData(useCallback(() => listCarrierPayables({ page, ...(status ? { status } : {}) }), [page, status]));
  const update = (next) => setParams((previous) => {
    const merged = new URLSearchParams(previous);
    Object.entries(next).forEach(([key, value]) => (value ? merged.set(key, value) : merged.delete(key)));
    return merged;
  });

  return (
    <div className="space-y-8">
      <PageHeader title="Payables" description="Amounts approved for the loads you haul and the payments recorded against them." />
      <FilterChips label="Filter by status" value={status} onChange={(value) => update({ status: value, page: '' })} options={STATUSES} />
      <AsyncView
        state={state}
        label="Loading your payables"
        errorTitle="We could not load your payables"
        isEmpty={(data) => data.items.length === 0}
        empty={<EmptyState icon={Wallet} title={status ? 'No payables match this filter' : 'No approved payables yet'} description={status ? 'Try a different status filter.' : 'Approved payables for your loads will appear here.'} />}
      >
        {(data) => (
          <div className="space-y-6">
            <div className="rounded-lg border border-steel-200 bg-white p-4 shadow-sm sm:p-6">
              <ResponsiveTable tableFrom="lg" caption="Your payables" columns={COLUMNS} rows={data.items} getKey={(p) => p.id} />
              <Pagination pagination={data.pagination} onPage={(next) => update({ page: next === 1 ? '' : String(next) })} />
            </div>
            <p className="text-base text-steel-600">An approved payable is not a payment. Payments are recorded by our team after they are made. You cannot change amounts or mark a payable as paid.</p>
          </div>
        )}
      </AsyncView>
    </div>
  );
}
