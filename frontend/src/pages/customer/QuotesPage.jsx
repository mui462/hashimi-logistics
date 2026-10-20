import { FileText } from 'lucide-react';
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import FilterChips from '../../components/customer/FilterChips';
import Pagination from '../../components/customer/Pagination';
import ResponsiveTable from '../../components/customer/ResponsiveTable';
import StatusBadge from '../../components/customer/StatusBadge';
import { QUOTE_STATUS, QUOTE_STATUS_VALUES } from '../../config/customerStatuses';
import { PATHS } from '../../config/paths';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { listQuotes } from '../../services/customerService';
import { formatDate, formatMoney, formatRoute, orDash } from '../../utils/format';

const COLUMNS = [
  { key: 'quote', header: 'Quote', primary: true, render: (q) => <Link className="underline underline-offset-4" to={`${PATHS.customer}/quotes/${q.id}`}>{q.quoteNumber}</Link> },
  { key: 'route', header: 'Route', render: (q) => formatRoute(q.origin, q.destination) },
  { key: 'equipment', header: 'Equipment', render: (q) => orDash(q.equipmentType) },
  { key: 'pickup', header: 'Pickup date', render: (q) => formatDate(q.pickupDate, { utc: true }) },
  { key: 'status', header: 'Status', render: (q) => <StatusBadge kind="quote" status={q.status} /> },
  { key: 'rate', header: 'Rate', render: (q) => formatMoney(q.rate) },
  { key: 'dates', header: 'Requested / updated', render: (q) => <>{formatDate(q.createdAt)}<span className="block text-steel-600">Updated {formatDate(q.updatedAt)}</span></> },
  { key: 'action', header: 'Action', render: (q) => <Link className="font-semibold underline underline-offset-4" to={`${PATHS.customer}/quotes/${q.id}`}>View<span className="sr-only"> {q.quoteNumber}</span></Link> },
];

export default function QuotesPage() {
  useDocumentTitle('My quotes');
  const [params, setParams] = useSearchParams();
  const status = QUOTE_STATUS_VALUES.includes(params.get('status')) ? params.get('status') : '';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);

  const load = useCallback(() => listQuotes({ page, ...(status ? { status } : {}) }), [page, status]);
  const state = useAsyncData(load);

  const update = (next) => setParams((previous) => {
    const merged = new URLSearchParams(previous);
    Object.entries(next).forEach(([key, value]) => (value ? merged.set(key, value) : merged.delete(key)));
    return merged;
  });

  return (
    <div className="space-y-8">
      <PageHeader title="My quotes" description="Every freight quote you have requested, with its current status." actions={<Button to={`${PATHS.customer}/quotes/new`}>Request a quote</Button>} />
      <FilterChips label="Filter by status" value={status} onChange={(value) => update({ status: value, page: '' })} options={QUOTE_STATUS_VALUES.map((value) => ({ value, label: QUOTE_STATUS[value].label }))} />
      <AsyncView
        state={state}
        label="Loading your quotes"
        errorTitle="We could not load your quotes"
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={FileText}
            title={status ? `No ${QUOTE_STATUS[status].label.toLowerCase()} quotes` : 'No quote requests yet'}
            description={status ? 'Try a different status filter.' : 'When you request a quote, it will appear here with its status.'}
            action={status ? <Button variant="secondary" onClick={() => update({ status: '', page: '' })}>Show all quotes</Button> : <Button to={`${PATHS.customer}/quotes/new`}>Request a quote</Button>}
          />
        }
      >
        {(data) => (
          <div className="rounded-lg border border-steel-200 bg-white p-4 shadow-sm sm:p-6">
            <ResponsiveTable caption="Your quote requests" columns={COLUMNS} rows={data.items} getKey={(q) => q.id} />
            <Pagination pagination={data.pagination} onPage={(next) => update({ page: next === 1 ? '' : String(next) })} />
          </div>
        )}
      </AsyncView>
    </div>
  );
}
