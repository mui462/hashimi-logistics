import { useCallback } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import BackLink from '../../components/customer/BackLink';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import StatusBadge from '../../components/customer/StatusBadge';
import { PATHS } from '../../config/paths';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getLoad } from '../../services/carrierService';
import { ApiRequestError } from '../../utils/apiRequestError';
import { formatDateTime, formatMoney, formatStop, formatWeight } from '../../utils/format';

const windowText = (value) => (value?.earliest ? `${formatDateTime(value.earliest)}${value.latest ? ` – ${formatDateTime(value.latest)}` : ''}` : null);

function OpenLoad({ load }) {
  return (
    <div className="space-y-8">
      <Panel title="Load details">
        <div className="mb-6"><StatusBadge kind="load" status={load.status} /></div>
        <DetailList items={[
          { label: 'Load number', value: load.loadNumber },
          { label: 'Pickup', value: formatStop(load.origin) },
          { label: 'Delivery', value: formatStop(load.destination) },
          { label: 'Pickup window', value: windowText(load.pickupWindow) },
          { label: 'Delivery window', value: windowText(load.deliveryWindow) },
          { label: 'Equipment', value: load.equipmentType },
          { label: 'Commodity', value: load.commodity },
          { label: 'Weight', value: formatWeight(load.weight) },
          { label: 'Cross-border', value: load.isCrossBorder ? 'Yes' : 'No' },
          { label: 'Carrier pay', value: load.pay ? formatMoney(load.pay) : 'Not set' },
        ]} />
      </Panel>
      <Panel title="Interested in this load?">
        <p className="text-base">Booking loads online is not available yet. Contact our team and mention load <strong>{load.loadNumber}</strong>. Street addresses and facility details are shared once a load is assigned to you.</p>
        <p className="mt-4"><Button to={PATHS.contact} variant="secondary">Contact our team</Button></p>
      </Panel>
    </div>
  );
}

export default function LoadDetailPage() {
  const { id } = useParams();
  const state = useAsyncData(useCallback(() => getLoad(id), [id]));
  const notFound = state.error instanceof ApiRequestError && [400, 404].includes(state.error.status);
  useDocumentTitle(state.data ? `Load ${state.data.loadNumber}` : 'Load details');

  // A load that is already assigned to this carrier lives under My Loads, with its full detail.
  if (state.data?.ownedByYou) return <Navigate to={`${PATHS.carrier}/my-loads/${id}`} replace />;

  return (
    <div className="space-y-8">
      <BackLink to={`${PATHS.carrier}/loads`}>Back to Available loads</BackLink>
      <PageHeader title={state.data ? `Load ${state.data.loadNumber}` : 'Load details'} />
      {notFound ? (
        <EmptyState title="Load not found" description="That load is not available to you. It may have been assigned or removed." action={<Button to={`${PATHS.carrier}/loads`}>View available loads</Button>} />
      ) : (
        <AsyncView state={state} label="Loading load" errorTitle="We could not load this load">
          {(load) => <OpenLoad load={load} />}
        </AsyncView>
      )}
    </div>
  );
}
