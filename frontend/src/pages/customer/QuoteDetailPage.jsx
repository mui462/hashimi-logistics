import { Phone } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import BackLink from '../../components/customer/BackLink';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import StatusBadge from '../../components/customer/StatusBadge';
import { QUOTE_STATUS_HELP } from '../../config/customerStatuses';
import { PATHS } from '../../config/paths';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { acceptQuote, declineQuote, getQuote } from '../../services/customerService';
import { ApiRequestError } from '../../utils/apiRequestError';
import { formatDate, formatDateTime, formatMoney, formatStop, formatWeight } from '../../utils/format';

const stopLines = (stop) => (
  <>
    {stop.facilityName && <span className="block">{stop.facilityName}</span>}
    {stop.street && <span className="block">{stop.street}</span>}
    <span className="block">{[stop.city, stop.state, stop.zipCode].filter(Boolean).join(', ')}</span>
    <span className="block">{stop.country}</span>
  </>
);

function dimensions(value) {
  if (!value || ![value.length, value.width, value.height].some((n) => n != null)) return null;
  return `${value.length ?? '—'} × ${value.width ?? '—'} × ${value.height ?? '—'} ${value.unit}`;
}

// Shown only while the quote is sent and still valid (`canRespond` comes from the server). The server decides everything:
// this just asks it to accept or decline and then reloads the quote.
function QuoteResponse({ quote, onChanged }) {
  const [pending, setPending] = useState(null);
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const [error, setError] = useState('');

  const respond = async (kind) => {
    setPending(kind);
    setError('');
    try {
      await (kind === 'accept' ? acceptQuote(quote.id) : declineQuote(quote.id));
      setConfirmingDecline(false);
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiRequestError && caught.status === 409 ? caught.message : 'We could not record your answer. Please try again.');
      if (caught instanceof ApiRequestError && caught.status === 409) onChanged();
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mt-6 space-y-4" aria-label="Respond to this quote" role="group">
      {error && <Alert>{error}</Alert>}
      {confirmingDecline ? (
        <div className="space-y-3">
          <p className="text-lg font-semibold">Decline this quote? You can request a new quote at any time.</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="danger" loading={pending === 'decline'} disabled={pending !== null} onClick={() => respond('decline')}>Yes, decline</Button>
            <Button variant="secondary" disabled={pending !== null} onClick={() => setConfirmingDecline(false)}>Keep this quote</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button loading={pending === 'accept'} disabled={pending !== null} onClick={() => respond('accept')}>Accept this quote</Button>
          <Button variant="secondary" disabled={pending !== null} onClick={() => setConfirmingDecline(true)}>Decline</Button>
          <Button to={PATHS.contact} variant="ghost"><Phone className="size-5" aria-hidden="true" />Talk to our team first</Button>
        </div>
      )}
    </div>
  );
}

function QuoteDetail({ quote, onChanged }) {
  const temperature = quote.temperatureRequirements;
  return (
    <div className="space-y-8">
      <Panel title="Status">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge kind="quote" status={quote.status} />
          <p className="text-lg">{QUOTE_STATUS_HELP[quote.status]}</p>
        </div>
        <div className="mt-6">
          <DetailList items={[
            { label: 'Quoted rate', value: quote.rate ? formatMoney(quote.rate) : 'Not quoted yet' },
            ...(quote.quoteExpiresAt && ['quoted', 'expired'].includes(quote.status) ? [{ label: quote.status === 'expired' ? 'Expired' : 'Valid until', value: formatDateTime(quote.quoteExpiresAt) }] : []),
            ...(quote.acceptedAt ? [{ label: 'Accepted', value: formatDateTime(quote.acceptedAt) }] : []),
            { label: 'Requested', value: formatDateTime(quote.createdAt) },
            { label: 'Last updated', value: formatDateTime(quote.updatedAt) },
            ...(quote.shipment ? [{ label: 'Shipment', value: <Link className="font-semibold underline underline-offset-4" to={`${PATHS.customer}/shipments/${quote.shipment.id}`}>{quote.shipment.trackingNumber}</Link> }] : []),
          ]} />
        </div>
        {quote.canRespond && <QuoteResponse quote={quote} onChanged={onChanged} />}
        {quote.status === 'quoted' && quote.canRespond === false && (
          <p className="mt-6 text-lg">This quote has passed its expiry date. Contact our team for an updated rate.</p>
        )}
        {(['negotiating', 'approved'].includes(quote.status) || (quote.status === 'quoted' && !quote.canRespond)) && (
          <div className="mt-6">
            <Button to={PATHS.contact} variant="secondary"><Phone className="size-5" aria-hidden="true" />Contact our team about this quote</Button>
          </div>
        )}
      </Panel>

      <div className="grid gap-8 xl:grid-cols-2">
        <Panel title="Pickup">
          <DetailList columns={1} items={[{ label: 'Location', value: stopLines(quote.origin) }, { label: 'Pickup date', value: formatDate(quote.pickupDate, { utc: true }) }]} />
        </Panel>
        <Panel title="Delivery">
          <DetailList columns={1} items={[{ label: 'Location', value: stopLines(quote.destination) }, { label: 'Delivery date', value: formatDate(quote.deliveryDate, { utc: true }) }]} />
        </Panel>
      </div>

      <Panel title="Freight">
        <DetailList items={[
          { label: 'Commodity', value: quote.commodity },
          { label: 'Equipment', value: quote.equipmentType },
          { label: 'Shipment type', value: quote.shipmentType },
          { label: 'Weight', value: formatWeight(quote.weight) },
          { label: 'Quantity', value: quote.quantity },
          { label: 'Pallets', value: quote.pallets },
          { label: 'Dimensions', value: dimensions(quote.dimensions) },
          { label: 'Cross-border', value: quote.isCrossBorder ? `Yes (${formatStop({ country: quote.origin.country })} to ${formatStop({ country: quote.destination.country })})` : 'No' },
          ...(temperature ? [{ label: 'Temperature', value: [temperature.minimum, temperature.maximum].some((n) => n != null) ? `${temperature.minimum ?? '—'} to ${temperature.maximum ?? '—'} °${temperature.unit}` : null }] : []),
          { label: 'Special requirements', value: quote.specialInstructions, wide: true },
        ]} />
      </Panel>

      <Panel title="Contact for this request">
        <DetailList items={[
          { label: 'Name', value: quote.contactInformation?.name },
          { label: 'Email', value: quote.contactInformation?.email },
          { label: 'Phone', value: quote.contactInformation?.phone },
        ]} />
      </Panel>
    </div>
  );
}

export default function QuoteDetailPage() {
  const { id } = useParams();
  const load = useCallback(() => getQuote(id), [id]);
  const state = useAsyncData(load);
  const notFound = state.error instanceof ApiRequestError && [400, 404].includes(state.error.status);
  useDocumentTitle(state.data ? state.data.quoteNumber : 'Quote details');

  return (
    <div className="space-y-8">
      <BackLink to={`${PATHS.customer}/quotes`}>Back to My quotes</BackLink>
      <PageHeader title={state.data ? `Quote ${state.data.quoteNumber}` : 'Quote details'} />
      {notFound ? (
        <EmptyState title="Quote not found" description="We could not find that quote in your account." action={<Button to={`${PATHS.customer}/quotes`}>View my quotes</Button>} />
      ) : (
        <AsyncView state={state} label="Loading quote" errorTitle="We could not load this quote">
          {(quote) => <QuoteDetail quote={quote} onChanged={state.reload} />}
        </AsyncView>
      )}
    </div>
  );
}
