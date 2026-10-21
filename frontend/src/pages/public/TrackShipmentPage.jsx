import { Info, SearchX } from 'lucide-react';
import FormCard from '../../components/common/FormCard';
import { useRef, useState } from 'react';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import LoadingState from '../../components/common/LoadingState';
import TextInput from '../../components/forms/TextInput';
import CmsPageContent from '../../components/sections/CmsPageContent';
import { useCmsPage } from '../../hooks/useCmsPage';
import Seo from '../../components/seo/Seo';
import HeroSection from '../../components/sections/HeroSection';
import SectionShell from '../../components/sections/SectionShell';
import TrackingTimeline from '../../components/tracking/TrackingTimeline';
import { PATHS } from '../../config/paths';
import { ShipmentNotFoundError, TrackingUnavailableError, trackShipment } from '../../services/trackingService';
import { brand } from '../../config/brand';

export default function TrackShipmentPage() {
  const { page: cms } = useCmsPage('track-shipment');
  const [number, setNumber] = useState('');
  const [validation, setValidation] = useState('');
  const [state, setState] = useState({ status: 'idle', shipment: null, error: null, searched: '' });
  const requestId = useRef(0);

  const search = async (value) => {
    const id = ++requestId.current;
    setState({ status: 'loading', shipment: null, error: null, searched: value });
    try {
      const shipment = await trackShipment(value);
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

  return (
    <>
      <Seo title="Track Shipment" description={`Track your ${brand.name} shipment with your tracking number.`} path={PATHS.trackShipment} seo={cms?.seo} />
      <HeroSection eyebrow="Track Shipment" title="Track Your Shipment" description="Enter the tracking number provided by our team." scene="highway" cms={cms} />
      <CmsPageContent page={cms} />
      <SectionShell id="tracking" labelledBy="tracking-heading">
        <div className="mx-auto max-w-3xl">
          <h2 id="tracking-heading" className="sr-only">Shipment lookup</h2>
          <FormCard className="space-y-8">
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 sm:flex-row sm:items-end" aria-label="Track a shipment">
            <div className="flex-1">
              <TextInput label="Tracking number" name="trackingNumber" autoComplete="off" value={number} onChange={(e) => setNumber(e.target.value)} error={validation} />
            </div>
            <Button type="submit" size="lg" loading={state.status === 'loading'}>Track Shipment</Button>
          </form>

          <div aria-live="polite">
            {state.status === 'loading' && <LoadingState label="Looking up your shipment" />}
            {state.status === 'found' && <TrackingTimeline shipment={state.shipment} />}
            {state.status === 'notfound' && (
              <EmptyState icon={SearchX} title="No shipment found" titleAs="h3" description={`We could not find a shipment for “${state.searched}”. Check the number and try again, or contact our team.`} action={<Button to={PATHS.contact} variant="secondary">Contact us</Button>} />
            )}
            {state.status === 'unavailable' && (
              <EmptyState icon={Info} title="Online tracking is not available yet" titleAs="h3" description={state.error.message} action={<Button to={PATHS.contact} variant="secondary">Contact us</Button>} />
            )}
            {state.status === 'error' && <ErrorState titleAs="h3" title="Tracking is unavailable right now" message={state.error?.message} onRetry={() => search(state.searched)} />}
            {state.status === 'idle' && <p className="text-base text-steel-600">Your shipment’s progress will appear here after you search.</p>}
          </div>
          </FormCard>
        </div>
      </SectionShell>
    </>
  );
}
