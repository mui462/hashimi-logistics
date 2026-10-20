import { Search } from 'lucide-react';
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import FilterChips from '../../components/customer/FilterChips';
import Pagination from '../../components/customer/Pagination';
import ResponsiveTable from '../../components/customer/ResponsiveTable';
import { PATHS } from '../../config/paths';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { listLoads } from '../../services/carrierService';
import { formatDate, formatMoney, formatStop, formatWeight, orDash } from '../../utils/format';

export const EQUIPMENT_FILTERS = ['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Box Truck', 'Straight Truck', 'Cargo Van', 'Sprinter', 'Other'];

const COLUMNS = [
  { key: 'load', header: 'Load', primary: true, render: (l) => <Link className="underline underline-offset-4" to={`${PATHS.carrier}/loads/${l.id}`}>{l.loadNumber}</Link> },
  { key: 'origin', header: 'Pickup', render: (l) => formatStop(l.origin) },
  { key: 'destination', header: 'Delivery', render: (l) => formatStop(l.destination) },
  { key: 'pickup', header: 'Pickup date', render: (l) => formatDate(l.pickupWindow?.earliest) },
  { key: 'equipment', header: 'Equipment', render: (l) => orDash(l.equipmentType) },
  { key: 'weight', header: 'Weight', render: (l) => formatWeight(l.weight) },
  { key: 'pay', header: 'Carrier pay', render: (l) => (l.pay ? formatMoney(l.pay) : 'Not set') },
  { key: 'action', header: 'Action', render: (l) => <Link className="font-semibold underline underline-offset-4" to={`${PATHS.carrier}/loads/${l.id}`}>View<span className="sr-only"> {l.loadNumber}</span></Link> },
];

export default function LoadsPage() {
  useDocumentTitle('Available loads');
  const [params, setParams] = useSearchParams();
  const equipmentType = EQUIPMENT_FILTERS.includes(params.get('equipmentType')) ? params.get('equipmentType') : '';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const state = useAsyncData(useCallback(() => listLoads({ page, ...(equipmentType ? { equipmentType } : {}) }), [page, equipmentType]));

  const update = (next) => setParams((previous) => {
    const merged = new URLSearchParams(previous);
    Object.entries(next).forEach(([key, value]) => (value ? merged.set(key, value) : merged.delete(key)));
    return merged;
  });

  return (
    <div className="space-y-8">
      <PageHeader title="Available loads" description="Open loads that are not yet assigned to a carrier. Contact our team to book one." />
      <FilterChips label="Filter by equipment" value={equipmentType} onChange={(value) => update({ equipmentType: value, page: '' })} options={EQUIPMENT_FILTERS.map((value) => ({ value, label: value }))} />
      <AsyncView
        state={state}
        label="Loading available loads"
        errorTitle="We could not load available loads"
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={Search}
            title={state.data?.eligibility && !state.data.eligibility.eligible ? 'Available loads aren’t shown yet' : equipmentType ? `No open ${equipmentType} loads` : 'No open loads right now'}
            description={state.data?.eligibility && !state.data.eligibility.eligible ? state.data.eligibility.reason : state.data?.eligibility?.hint ? state.data.eligibility.hint : equipmentType ? 'Try a different equipment filter.' : 'New loads will appear here when they are posted.'}
          />
        }
      >
        {(data) => (
          <div className="rounded-lg border border-steel-200 bg-white p-4 shadow-sm sm:p-6">
            <ResponsiveTable caption="Available loads" columns={COLUMNS} rows={data.items} getKey={(l) => l.id} />
            <Pagination pagination={data.pagination} onPage={(next) => update({ page: next === 1 ? '' : String(next) })} />
          </div>
        )}
      </AsyncView>
    </div>
  );
}
