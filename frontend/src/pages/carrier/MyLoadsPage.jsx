import { Truck } from 'lucide-react';
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
import { LOAD_FILTERS, LOAD_STATUS } from '../../config/customerStatuses';
import { PATHS } from '../../config/paths';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { listMyLoads } from '../../services/carrierService';
import { formatDate, formatMoney, formatStop, orDash } from '../../utils/format';

const COLUMNS = [
  { key: 'load', header: 'Load', primary: true, render: (l) => <Link className="underline underline-offset-4" to={`${PATHS.carrier}/my-loads/${l.id}`}>{l.loadNumber}</Link> },
  { key: 'status', header: 'Status', render: (l) => <StatusBadge kind="load" status={l.status} /> },
  { key: 'origin', header: 'Pickup', render: (l) => formatStop(l.origin) },
  { key: 'destination', header: 'Delivery', render: (l) => formatStop(l.destination) },
  { key: 'pickup', header: 'Pickup date', render: (l) => formatDate(l.pickupWindow?.earliest) },
  { key: 'equipment', header: 'Equipment', render: (l) => orDash(l.equipmentType) },
  { key: 'pay', header: 'Carrier pay', render: (l) => (l.pay ? formatMoney(l.pay) : 'Not set') },
  { key: 'action', header: 'Action', render: (l) => <Link className="font-semibold underline underline-offset-4" to={`${PATHS.carrier}/my-loads/${l.id}`}>View<span className="sr-only"> {l.loadNumber}</span></Link> },
];

export default function MyLoadsPage() {
  useDocumentTitle('My loads');
  const [params, setParams] = useSearchParams();
  const status = LOAD_FILTERS.includes(params.get('status')) ? params.get('status') : '';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const state = useAsyncData(useCallback(() => listMyLoads({ page, ...(status ? { status } : {}) }), [page, status]));

  const update = (next) => setParams((previous) => {
    const merged = new URLSearchParams(previous);
    Object.entries(next).forEach(([key, value]) => (value ? merged.set(key, value) : merged.delete(key)));
    return merged;
  });

  return (
    <div className="space-y-8">
      <PageHeader title="My loads" description="Loads assigned to your company." />
      <FilterChips label="Filter by status" value={status} onChange={(value) => update({ status: value, page: '' })} options={LOAD_FILTERS.map((value) => ({ value, label: LOAD_STATUS[value].label }))} />
      <AsyncView
        state={state}
        label="Loading your loads"
        errorTitle="We could not load your loads"
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={Truck}
            title={status ? `No ${LOAD_STATUS[status].label.toLowerCase()} loads` : 'No loads assigned yet'}
            description={status ? 'Try a different status filter.' : 'Loads assigned to your company will appear here.'}
            action={status ? <Button variant="secondary" onClick={() => update({ status: '', page: '' })}>Show all loads</Button> : <Button to={`${PATHS.carrier}/loads`} variant="secondary">Browse available loads</Button>}
          />
        }
      >
        {(data) => (
          <div className="rounded-lg border border-steel-200 bg-white p-4 shadow-sm sm:p-6">
            <ResponsiveTable caption="Your loads" columns={COLUMNS} rows={data.items} getKey={(l) => l.id} />
            <Pagination pagination={data.pagination} onPage={(next) => update({ page: next === 1 ? '' : String(next) })} />
          </div>
        )}
      </AsyncView>
    </div>
  );
}
