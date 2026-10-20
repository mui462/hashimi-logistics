import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import BackLink from '../../components/customer/BackLink';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import PanelLink from '../../components/customer/PanelLink';
import ResponsiveTable from '../../components/customer/ResponsiveTable';
import StatusBadge from '../../components/customer/StatusBadge';
import { DOCUMENT_TYPE_LABELS } from '../../config/customerStatuses';
import { PATHS } from '../../config/paths';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getMyLoad } from '../../services/carrierService';
import { ApiRequestError } from '../../utils/apiRequestError';
import { formatDate, formatDateTime, formatMoney, formatStop, formatWeight } from '../../utils/format';

const C = PATHS.carrier;
const windowText = (value) => (value?.earliest ? `${formatDateTime(value.earliest)}${value.latest ? ` – ${formatDateTime(value.latest)}` : ''}` : null);
const stopText = (stop) => (stop ? [stop.facilityName, stop.street, formatStop(stop), stop.zipCode].filter(Boolean).join(', ') : null);

const DOC_COLUMNS = [
  { key: 'name', header: 'Document', primary: true, render: (d) => <Link className="underline underline-offset-4" to={`${C}/documents/${d.id}`}>{d.name}</Link> },
  { key: 'type', header: 'Type', render: (d) => DOCUMENT_TYPE_LABELS[d.type] ?? d.type },
  { key: 'added', header: 'Added', render: (d) => formatDate(d.createdAt) },
];

function MyLoadDetail({ load }) {
  return (
    <div className="space-y-8">
      <Panel title="Overview">
        <div className="mb-6"><StatusBadge kind="load" status={load.status} /></div>
        <DetailList items={[
          { label: 'Load number', value: load.loadNumber },
          { label: 'Carrier pay', value: load.pay ? formatMoney(load.pay) : 'Not set' },
          { label: 'Pickup', value: stopText(load.origin), wide: true },
          { label: 'Delivery', value: stopText(load.destination), wide: true },
          { label: 'Pickup window', value: windowText(load.pickupWindow) },
          { label: 'Delivery window', value: windowText(load.deliveryWindow) },
          { label: 'Pickup appointment', value: formatDateTime(load.pickupAppointment) },
          { label: 'Delivery appointment', value: formatDateTime(load.deliveryAppointment) },
          { label: 'Equipment', value: load.equipmentType },
          { label: 'Commodity', value: load.commodity },
          { label: 'Weight', value: formatWeight(load.weight) },
          { label: 'Cross-border', value: load.isCrossBorder ? 'Yes' : 'No' },
          { label: 'Special instructions', value: load.specialInstructions, wide: true },
        ]} />
      </Panel>

      <div className="grid gap-8 xl:grid-cols-2">
        <Panel title="Shipment">
          {load.shipment ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge kind="shipment" status={load.shipment.status} />
                <span className="text-lg font-bold">{load.shipment.trackingNumber}</span>
              </div>
              <PanelLink to={`${C}/shipments/${load.shipment.id}`}>View shipment</PanelLink>
            </div>
          ) : (
            <p className="text-base text-steel-600">No shipment has been created for this load yet.</p>
          )}
        </Panel>
        <Panel title="Documents">
          {load.documents.length === 0 ? (
            <p className="text-base text-steel-600">No documents are available for this load yet.</p>
          ) : (
            <ResponsiveTable tableFrom="lg" caption="Load documents" columns={DOC_COLUMNS} rows={load.documents} getKey={(d) => d.id} />
          )}
          <p className="mt-4"><PanelLink to={`${C}/documents`}>All my documents</PanelLink></p>
        </Panel>
      </div>
    </div>
  );
}

export default function MyLoadDetailPage() {
  const { id } = useParams();
  const state = useAsyncData(useCallback(() => getMyLoad(id), [id]));
  const notFound = state.error instanceof ApiRequestError && [400, 404].includes(state.error.status);
  useDocumentTitle(state.data ? `Load ${state.data.loadNumber}` : 'Load details');

  return (
    <div className="space-y-8">
      <BackLink to={`${C}/my-loads`}>Back to My loads</BackLink>
      <PageHeader title={state.data ? `Load ${state.data.loadNumber}` : 'Load details'} />
      {notFound ? (
        <EmptyState title="Load not found" description="We could not find that load in your account." action={<Button to={`${C}/my-loads`}>View my loads</Button>} />
      ) : (
        <AsyncView state={state} label="Loading load" errorTitle="We could not load this load">
          {(load) => <MyLoadDetail load={load} />}
        </AsyncView>
      )}
    </div>
  );
}
