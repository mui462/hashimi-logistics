import { Info, SearchX } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import LoadingState from '../../components/common/LoadingState';
import PageHeader from '../../components/common/PageHeader';
import { safeMessage } from '../../components/customer/AsyncView';
import Panel from '../../components/customer/Panel';
import PanelLink from '../../components/customer/PanelLink';
import TextInput from '../../components/forms/TextInput';
import TrackingTimeline from '../../components/tracking/TrackingTimeline';
import { PATHS } from '../../config/paths';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { listShipments } from '../../services/customerService';
import { ShipmentNotFoundError, TrackingUnavailableError, trackShipment } from '../../services/trackingService';

export default function TrackingPage() {
  useDocumentTitle('Tracking');
  const [number, setNumber] = useState('');
  const [validation, setValidation] = useState('');
  const [state, setState] = useState({ status: 'idle', shipment: null, error: null, searched: '' });
  const requestId = useRef(0);
  const recent = useAsyncData(useCallback(() => listShipments({ limit: 5 }), []));

  const search = async (value) => {
    const id = ++requestId.current;
    setState({ status: 'loading', shipment: null, error: null, searched: value });
    try {
      const shipment = await trackShipment(value, { scope: 'customer' });
      if (id === requestId.current) setState({ status: shipment ? 'found' : 'notfound', shipment, error: null, searched: value });
    } catch (error) {
      if (id !== requestId.current) return;
      const status = error instanceof ShipmentNotFoundError ? 'notfound' : error instanceof TrackingUnavailableError ? 'unavailable' : 'error';
      setState({ status, shipment: null, error, searched: value });
    }
  };

  const onSubmit = (event) => {
    event.preventDefault();
    const value = number.trim();
    if (!value) {
      setValidation('Enter a tracking number.');
      return;
    }
    setValidation('');
    search(value);
  };

  const ownShipments = recent.data?.items ?? [];

  return (
    <div className="space-y-8">
      <PageHeader title="Tracking" description="Look up the progress of any shipment on your account by its tracking number." />
      <Panel title="Track a shipment">
        <form onSubmit={onSubmit} noValidate aria-label="Track a shipment" className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <TextInput label="Tracking number" name="trackingNumber" autoComplete="off" value={number} onChange={(e) => setNumber(e.target.value)} error={validation} />
          </div>
          <Button type="submit" size="lg" loading={state.status === 'loading'}>Track shipment</Button>
        </form>
        {ownShipments.length > 0 && (
          <div className="mt-6">
            <p className="text-base font-semibold text-steel-600">Your recent shipments</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {ownShipments.map((shipment) => (
                <li key={shipment.id}>
                  <button type="button" onClick={() => { setNumber(shipment.trackingNumber); search(shipment.trackingNumber); }} className="min-h-11 rounded-md border-2 border-steel-300 px-3 text-base font-semibold hover:bg-steel-50">
                    {shipment.trackingNumber}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <div aria-live="polite">
        {state.status === 'loading' && <LoadingState label="Looking up your shipment" />}
        {state.status === 'found' && (
          <Panel title="Shipment progress" action={<PanelLink to={`${PATHS.customer}/shipments`}>All shipments</PanelLink>}>
            <TrackingTimeline shipment={state.shipment} />
          </Panel>
        )}
        {state.status === 'notfound' && (
          <EmptyState icon={SearchX} title="No shipment found" titleAs="h2" description={`No shipment on your account matches “${state.searched}”. Check the number and try again.`} />
        )}
        {state.status === 'unavailable' && (
          <EmptyState icon={Info} title="Online tracking is not available yet" titleAs="h2" description="Online tracking is not available yet." action={<Button to={PATHS.contact} variant="secondary">Contact us</Button>} />
        )}
        {state.status === 'error' && <ErrorState title="Tracking is unavailable right now" message={safeMessage(state.error)} onRetry={() => search(state.searched)} />}
        {state.status === 'idle' && <p className="text-base text-steel-600">Your shipment’s progress will appear here after you search.</p>}
      </div>
    </div>
  );
}
