import { useCallback, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ActivityTimeline from '../../components/admin/ActivityTimeline';
import AdminActionBar from '../../components/admin/AdminActionBar';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import AdminTimeline from '../../components/admin/AdminTimeline';
import PricingSummary from '../../components/admin/PricingSummary';
import StopDetails from '../../components/admin/StopDetails';
import { EntityLink, PartnerLink } from '../../components/admin/adminLinks';
import { useAdminToast } from '../../components/admin/AdminToast';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import SelectInput from '../../components/forms/SelectInput';
import TextArea from '../../components/forms/TextArea';
import TextInput from '../../components/forms/TextInput';
import { CURRENCIES, humanize, options } from '../../config/adminStatuses';
import { useAdminAction } from '../../hooks/useAdminAction';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useSubmitState } from '../../hooks/useSubmitState';
import * as admin from '../../services/adminService';
import { focusFirstInvalid } from '../../utils/focus';
import { formatDate, formatDateTime, formatWeight } from '../../utils/format';
import { centsToDollars, dollarsToCents } from '../../utils/money';

// Who triggers a transition: these two targets belong to the customer (accept / decline from their portal).
const CUSTOMER_ONLY = ['customer_accepted', 'declined'];

function PricingForm({ quote, onSaved }) {
  const toast = useAdminToast();
  const inFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [needsLossConfirmation, setNeedsLossConfirmation] = useState(false);
  const [values, setValues] = useState({
    customerRate: centsToDollars(quote.pricing?.customerRate?.amount),
    carrierRate: centsToDollars(quote.pricing?.carrierRate?.amount),
    currency: quote.pricing?.customerRate?.currency ?? 'USD',
  });
  const [errors, setErrors] = useState({});
  const [confirmNegative, setConfirmNegative] = useState(false);
  const set = (name) => (event) => setValues((current) => ({ ...current, [name]: event.target.value }));

  const payload = (allowNegativeMargin) => {
    const body = { customerRate: dollarsToCents(values.customerRate), currency: values.currency };
    if (values.carrierRate.trim()) body.carrierRate = dollarsToCents(values.carrierRate);
    if (allowNegativeMargin) body.allowNegativeMargin = true;
    return body;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current) return;
    const next = {};
    if (dollarsToCents(values.customerRate) == null) next.customerRate = 'Enter the customer rate as an amount such as 2450.00.';
    if (values.carrierRate.trim() && dollarsToCents(values.carrierRate) == null) next.carrierRate = 'Enter the carrier rate as an amount such as 1980.00, or leave it blank.';
    setErrors(next);
    if (Object.keys(next).length > 0) {
      focusFirstInvalid();
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setServerError('');
    setNeedsLossConfirmation(false);
    try {
      await admin.setQuotePricing(quote.id, payload(false));
      toast.success('Pricing saved.');
      onSaved();
    } catch (error) {
      setServerError(error?.message || 'Pricing could not be saved.');
      // The server refuses a negative margin unless it is explicitly accepted: offer that choice, never assume it.
      if (error?.code === 'NEGATIVE_MARGIN') setNeedsLossConfirmation(true);
      if (error?.errors?.length) setErrors(Object.fromEntries(error.errors.filter((item) => item.field).map((item) => [item.field, item.message])));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <>
    <form onSubmit={submit} noValidate aria-label="Set pricing" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextInput label="Customer rate" inputMode="decimal" value={values.customerRate} onChange={set('customerRate')} error={errors.customerRate} autoComplete="off" />
        <TextInput label="Carrier rate (optional)" inputMode="decimal" value={values.carrierRate} onChange={set('carrierRate')} error={errors.carrierRate} autoComplete="off" />
        <SelectInput label="Currency" value={values.currency} onChange={set('currency')} options={options(CURRENCIES)} />
      </div>
      <p className="text-base text-steel-600">Margin is calculated by the server when you save. It cannot be typed in.</p>
      {serverError && <Alert>{serverError}</Alert>}
      {needsLossConfirmation && <Button variant="secondary" onClick={() => setConfirmNegative(true)}>Review and accept a negative margin</Button>}
      <div><Button type="submit" loading={submitting}>Save pricing</Button></div>
    </form>
    {/* Outside the form: a dialog inside it would nest a form in a form and its submit would also submit the pricing form. */}
      <AdminConfirmDialog
        open={confirmNegative}
        title="Save with a negative margin?"
        description={<p>The carrier rate is higher than the customer rate, so this quote would lose money. Save it only if that is intended.</p>}
        confirmLabel="Save anyway"
        tone="danger"
        onCancel={() => setConfirmNegative(false)}
        onConfirm={async () => {
          await admin.setQuotePricing(quote.id, payload(true));
          toast.success('Pricing saved with a negative margin.');
          setConfirmNegative(false);
          onSaved();
        }}
      />
    </>
  );
}

function NotesForm({ quote, onSaved }) {
  const toast = useAdminToast();
  const { run, isSubmitting, error } = useSubmitState();
  const [notes, setNotes] = useState(quote.internalNotes ?? '');
  const submit = async (event) => {
    event.preventDefault();
    if (await run(() => admin.updateQuoteNotes(quote.id, notes))) {
      toast.success('Notes saved.');
      onSaved();
    }
  };
  return (
    <form onSubmit={submit} noValidate aria-label="Internal notes" className="space-y-4">
      <TextArea label="Internal notes" hint="Only the Super Admin can see these." rows={4} value={notes} maxLength={5000} onChange={(event) => setNotes(event.target.value)} />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" variant="secondary" loading={isSubmitting}>Save notes</Button>
    </form>
  );
}

export default function QuoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useAdminToast();
  const state = useAsyncData(useCallback(() => admin.getQuote(id), [id]));
  const { run, busy } = useAdminAction(state.reload);
  const quote = state.data;

  const buildActions = (q) => {
    const next = q.nextStatuses.map((entry) => entry.status);
    const has = (status) => next.includes(status);
    const actions = [];
    // A guest quote (public website, no customer account) cannot be sent through the portal or become a load; the server
    // refuses both with QUOTE_HAS_NO_CUSTOMER. The buttons stay visible but disabled so the reason is clear.
    const guestHint = q.isGuest ? 'This is a guest request from the website with no customer account. Contact the requester directly.' : undefined;
    if (has('reviewing')) actions.push({ key: 'review', label: 'Start review', variant: 'primary', onRun: () => run(() => admin.reviewQuote(q.id, {}), 'Quote moved to review.') });
    if (has('pricing')) actions.push({ key: 'pricing', label: 'Start pricing', variant: 'primary', onRun: () => run(() => admin.startQuotePricing(q.id), 'Pricing started.') });
    if (has('quoted')) {
      const priced = q.pricing?.customerRate != null;
      actions.push({
        key: 'send',
        label: 'Send quote to customer',
        variant: 'primary',
        disabled: !priced || q.isGuest,
        hint: guestHint ?? (priced ? undefined : 'Save the customer rate before sending the quote.'),
        dialog: {
          title: `Send quote ${q.quoteNumber}?`,
          description: <p>The customer will be notified in their portal and can accept or decline. They will see the customer rate only, never the carrier rate or margin.</p>,
          confirmLabel: 'Send quote',
          fields: [{ name: 'validForDays', label: 'Valid for', type: 'select', defaultValue: '7', options: [1, 3, 7, 14, 30].map((days) => ({ value: String(days), label: `${days} ${days === 1 ? 'day' : 'days'}` })) }],
        },
        onRun: async (values) => {
          await admin.sendQuote(q.id, { validForDays: Number(values.validForDays) });
          toast.success('Quote sent to the customer.');
          state.reload();
        },
      });
    }
    if (has('converted_to_load')) {
      actions.push({
        key: 'convert',
        label: 'Convert to load',
        variant: 'primary',
        disabled: q.isGuest,
        hint: guestHint,
        dialog: {
          title: `Convert ${q.quoteNumber} to a load?`,
          description: <p>This creates a load from the accepted quote. It can only be done once, and the quote cannot be changed afterwards.</p>,
          confirmLabel: 'Convert to load',
        },
        onRun: async () => {
          const result = await admin.convertQuote(q.id);
          toast.success('Quote converted to a load.');
          navigate(`/admin/loads/${encodeURIComponent(result.load.id)}`);
        },
      });
    }
    if (has('expired')) {
      actions.push({
        key: 'expire',
        label: 'Expire quote',
        dialog: { title: `Expire quote ${q.quoteNumber}?`, description: <p>The customer will no longer be able to accept it. They would need to request a new quote.</p>, confirmLabel: 'Expire quote' },
        tone: 'danger',
        onRun: async () => {
          await admin.expireQuote(q.id);
          toast.success('Quote expired.');
          state.reload();
        },
      });
    }
    if (has('cancelled')) {
      actions.push({
        key: 'cancel',
        label: 'Cancel quote',
        tone: 'danger',
        dialog: {
          title: `Cancel quote ${q.quoteNumber}?`,
          description: <p>This ends the request. The customer is not asked to confirm, so give a reason you can stand behind.</p>,
          confirmLabel: 'Cancel quote',
          fields: [{ name: 'reason', label: 'Reason', type: 'textarea', required: true, maxLength: 500 }],
        },
        onRun: async (values) => {
          await admin.cancelQuote(q.id, values.reason);
          toast.success('Quote cancelled.');
          state.reload();
        },
      });
    }
    return actions;
  };

  const timeline = (q) =>
    [
      { id: 'created', at: q.createdAt, title: 'Quote requested' },
      q.quotedAt && { id: 'quoted', at: q.quotedAt, title: 'Quote sent to the customer' },
      q.acceptedAt && { id: 'accepted', at: q.acceptedAt, title: 'Customer accepted' },
      q.declinedAt && { id: 'declined', at: q.declinedAt, title: 'Customer declined' },
      q.convertedAt && { id: 'converted', at: q.convertedAt, title: 'Converted to a load' },
    ].filter(Boolean);

  return (
    <AdminPage
      title={quote ? `Quote ${quote.quoteNumber}` : 'Quote details'}
      trail={[{ label: 'Quotes', to: '/admin/quotes' }, { label: quote ? quote.quoteNumber : 'Details' }]}
    >
      <AdminAsyncView state={state} label="Loading quote" errorTitle="We could not load this quote" notFound="quote">
        {(q) => {
          const actions = buildActions(q);
          const waitingOnCustomer = q.nextStatuses.some((entry) => CUSTOMER_ONLY.includes(entry.status));
          return (
            <div className="space-y-6">
              <Panel title="Overview" action={<AdminStatusBadge status={q.status} operationsStatus={q.operationsStatus} />}>
                <DetailList
                  items={[
                    { label: 'Quote number', value: q.quoteNumber },
                    { label: 'Status', value: humanize(q.operationsStatus) },
                    { label: 'Requested', value: formatDateTime(q.createdAt) },
                    { label: 'Quote valid until', value: q.quoteExpiresAt ? formatDateTime(q.quoteExpiresAt) : '—' },
                    { label: 'Type', value: q.isCrossBorder ? 'Cross-border' : 'Domestic' },
                    { label: 'Source', value: q.isGuest ? 'Website guest (no account)' : 'Customer portal' },
                    { label: 'Load', value: q.load ? <EntityLink to={`/admin/loads/${encodeURIComponent(q.load.id)}`}>{q.load.loadNumber ?? 'Open load'}</EntityLink> : '—' },
                    ...(q.cancelledReason ? [{ label: 'Cancellation reason', value: q.cancelledReason, wide: true }] : []),
                  ]}
                />
              </Panel>

              <Panel title="Actions" description="Only the steps the server allows from the current status are shown.">
                {actions.length > 0 ? (
                  <AdminActionBar actions={actions} busy={busy} />
                ) : (
                  <p className="text-base text-steel-600">No further actions are available for this quote.</p>
                )}
                {waitingOnCustomer && <p className="mt-3 text-base text-steel-600">The customer accepts or declines from their own portal; that step cannot be taken from here.</p>}
              </Panel>

              <div className="grid gap-6 xl:grid-cols-2">
                {q.isGuest ? (
                  <Panel title="Website guest" description="Submitted from the public quote form. There is no customer account, so nothing is sent to a portal.">
                    <DetailList items={[
                      { label: 'Name', value: q.contactInformation?.name },
                      { label: 'Company', value: q.contactInformation?.company },
                      { label: 'Email', value: q.contactInformation?.email },
                      { label: 'Phone', value: q.contactInformation?.phone },
                    ]} />
                  </Panel>
                ) : (
                  <Panel title="Customer">
                    <DetailList items={[
                      { label: 'Company', value: <PartnerLink kind="customers" partner={q.customer} /> },
                      { label: 'Contact', value: q.customer?.contactPerson },
                      { label: 'Email', value: q.customer?.email },
                      { label: 'Phone', value: q.customer?.phone },
                    ]} />
                  </Panel>
                )}
                <Panel title="Shipment">
                  <DetailList items={[
                    { label: 'Equipment', value: q.equipmentType },
                    { label: 'Commodity', value: q.commodity },
                    { label: 'Weight', value: formatWeight(q.weight) },
                    { label: 'Pickup date', value: formatDate(q.pickupDate, { utc: true }) },
                    { label: 'Delivery date', value: q.deliveryDate ? formatDate(q.deliveryDate, { utc: true }) : '—' },
                  ]} />
                </Panel>
                <Panel title="Origin"><StopDetails stop={q.origin} /></Panel>
                <Panel title="Destination"><StopDetails stop={q.destination} /></Panel>
              </div>

              <Panel title="Pricing" description="Customer and carrier rates are visible to the Super Admin only.">
                <div className="space-y-6">
                  <PricingSummary pricing={q.pricing} />
                  {q.nextStatuses.some((entry) => entry.status === 'quoted') && <PricingForm key={`${q.updatedAt}`} quote={q} onSaved={state.reload} />}
                </div>
              </Panel>

              <Panel title="Notes"><NotesForm key={`${q.updatedAt}-notes`} quote={q} onSaved={state.reload} /></Panel>

              <div className="grid gap-6 xl:grid-cols-2">
                <Panel title="Timeline"><AdminTimeline label="Quote timeline" items={timeline(q)} /></Panel>
                <Panel title="Activity log"><ActivityTimeline entityId={q.id} refreshKey={q.updatedAt} /></Panel>
              </div>
            </div>
          );
        }}
      </AdminAsyncView>
    </AdminPage>
  );
}
