import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PATHS } from '../../config/paths';
import { useSubmitState } from '../../hooks/useSubmitState';
import { submitQuoteRequest } from '../../services/quoteService';
import { cx } from '../../utils/cx';
import { focusFirstInvalid } from '../../utils/focus';
import { formatStop } from '../../utils/format';
import { hasErrors, maxLength, required } from '../../utils/validators';
import Button from '../common/Button';
import ChoiceGroup from './ChoiceGroup';
import { EQUIPMENT_OPTIONS, QUOTE_INITIAL, SHIPMENT_TYPE_OPTIONS, StopFields, buildQuotePayload, validateQuote } from './CustomerQuoteForm';
import { FormErrorSummary, SuccessPanel } from './FormStatus';
import SelectInput from './SelectInput';
import TextArea from './TextArea';
import TextInput from './TextInput';

// The public (guest) quote wizard. It collects the same structured request as the customer portal and sends it as JSON to
// POST /quotes; the only extra field is the requester's optional company. No files are uploaded from the public site.

export const QUOTE_STEPS = [
  { key: 'route', number: '01', title: 'Pickup & Delivery' },
  { key: 'freight', number: '02', title: 'Freight Details' },
  { key: 'transport', number: '03', title: 'Transportation' },
  { key: 'contact', number: '04', title: 'Contact' },
  { key: 'additional', number: '05', title: 'Additional' },
];
const REVIEW = QUOTE_STEPS.length; // index of the review screen

const INITIAL = { ...QUOTE_INITIAL, 'contactInformation.company': '' };

const SHIPMENT_CHOICES = [
  { value: 'FTL', label: 'Full Truckload (FTL)' },
  { value: 'LTL', label: 'Less-Than-Truckload (LTL)' },
  { value: 'Partial', label: 'Partial' },
  { value: 'Expedited', label: 'Expedited' },
  { value: 'Other', label: 'Other / not sure' },
].filter((choice) => SHIPMENT_TYPE_OPTIONS.includes(choice.value));

const stop = (prefix) => ['facilityName', 'street', 'city', 'state', 'zipCode', 'country'].map((key) => `${prefix}.${key}`);

// Which form fields (and server error fields) belong to which step.
const STEP_FIELDS = {
  route: [...stop('origin'), ...stop('destination'), 'origin', 'destination', 'pickupDate', 'deliveryDate'],
  freight: ['commodity', 'weight', 'weight.value', 'weight.unit', 'quantity', 'pallets', 'dimensions', 'dimensions.length', 'dimensions.width', 'dimensions.height', 'dimensions.unit', 'equipmentType', 'temperatureRequirements', 'temperatureRequirements.minimum', 'temperatureRequirements.maximum'],
  transport: ['shipmentType'],
  contact: ['contactInformation', 'contactInformation.name', 'contactInformation.company', 'contactInformation.email', 'contactInformation.phone'],
  additional: ['specialInstructions'],
};

function validateStep(key, values) {
  const all = {
    ...validateQuote(values),
    shipmentType: required(values.shipmentType, 'Transportation type'),
    'contactInformation.company': maxLength(values['contactInformation.company'], 150, 'Company'),
  };
  return Object.fromEntries(STEP_FIELDS[key].filter((name) => name in all).map((name) => [name, all[name]]));
}

function buildPayload(values) {
  const payload = buildQuotePayload(values);
  const company = values['contactInformation.company'].trim();
  if (company) payload.contactInformation.company = company;
  return payload;
}

function StepIndicator({ current }) {
  return (
    <nav aria-label="Quote request progress">
      <ol className="grid grid-cols-5 gap-1 sm:gap-2">
        {QUOTE_STEPS.map((step, index) => {
          const state = current === REVIEW || index < current ? 'done' : index === current ? 'current' : 'todo';
          return (
            <li key={step.key} aria-current={state === 'current' ? 'step' : undefined} className="min-w-0">
              <div className={cx('h-1.5', state === 'todo' ? 'bg-steel-200' : state === 'current' ? 'bg-signal-500' : 'bg-ink-900')} />
              <p className={cx('mt-2 text-base font-bold', state === 'todo' ? 'text-steel-500' : 'text-ink-900')}>
                {step.number}
                <span className="hidden sm:inline"> {step.title}</span>
                <span className="sr-only sm:hidden"> {step.title}</span>
              </p>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-base font-semibold sm:hidden" aria-hidden="true">
        {current === REVIEW ? 'Review' : QUOTE_STEPS[current].title}
      </p>
    </nav>
  );
}

function ReviewRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="grid gap-1 border-b border-steel-200 py-2 sm:grid-cols-[12rem_1fr]">
      <dt className="font-semibold">{label}</dt>
      <dd className="break-words text-steel-600">{value}</dd>
    </div>
  );
}

export default function QuoteForm({ submitQuote = submitQuoteRequest }) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const submission = useSubmitState();
  const [showServerErrors, setShowServerErrors] = useState(false);
  const headingRef = useRef(null);
  const shownStep = useRef(step);
  const merged = { ...errors, ...submission.fieldErrors };

  // When the server rejects specific fields, take the user to the first step that contains one.
  useEffect(() => {
    if (!showServerErrors) return;
    setShowServerErrors(false);
    const names = Object.keys(submission.fieldErrors || {});
    const index = QUOTE_STEPS.findIndex((item) => names.some((name) => STEP_FIELDS[item.key].includes(name)));
    if (index >= 0) setStep(index);
  }, [showServerErrors, submission.fieldErrors]);

  useEffect(() => {
    // Only when the step really changes: never on mount (React StrictMode re-runs effects, which used to focus the form and scroll the page to it).
    if (shownStep.current === step) return;
    shownStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  const set = (name) => (event) => setValues((v) => ({ ...v, [name]: event.target.value }));

  const checkStep = (index) => {
    const found = validateStep(QUOTE_STEPS[index].key, values);
    setErrors(found);
    const valid = !hasErrors(found);
    if (!valid) focusFirstInvalid();
    return valid;
  };

  const next = () => checkStep(step) && setStep(step + 1 === QUOTE_STEPS.length ? REVIEW : step + 1);
  const back = () => {
    setErrors({});
    setStep(step === REVIEW ? REVIEW - 1 : Math.max(0, step - 1));
  };

  const submit = async () => {
    for (let index = 0; index < QUOTE_STEPS.length; index += 1) {
      if (!checkStep(index)) {
        setStep(index);
        return;
      }
    }
    const ok = await submission.run(() => submitQuote(buildPayload(values)));
    if (!ok) setShowServerErrors(true);
  };

  if (submission.status === 'success') {
    const reference = submission.result?.quoteNumber;
    return (
      <SuccessPanel title="Quote request submitted">
        <p>
          Your request{reference ? <> <strong>{reference}</strong></> : ''} was received. Our team will review it and contact you
          using the details you gave. No email confirmation is sent, so keep this reference if you contact us.
        </p>
      </SuccessPanel>
    );
  }

  const isReefer = values.equipmentType === 'Reefer';
  const where = (prefix) => formatStop({ city: values[`${prefix}.city`], state: values[`${prefix}.state`], country: values[`${prefix}.country`] });
  const dims = ['length', 'width', 'height'].map((key) => values[`dimensions.${key}`]).filter(Boolean);
  const temperature = [values['temperatureRequirements.minimum'], values['temperatureRequirements.maximum']].filter((v) => v !== '');
  const title = step === REVIEW ? 'Review your request' : `${QUOTE_STEPS[step].number} ${QUOTE_STEPS[step].title}`;

  return (
    <form
      noValidate
      aria-label="Request a quote"
      onSubmit={(event) => {
        event.preventDefault();
        if (step === REVIEW) submit();
        else next();
      }}
      className="space-y-8"
    >
      <StepIndicator current={step} />
      <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-extrabold outline-none">
        {title}
      </h2>
      <FormErrorSummary error={submission.status === 'error' ? submission.error : ''} />

      {step === 0 && (
        <div className="space-y-10">
          <StopFields
            prefix="origin" title="Pickup" values={values} set={set} errors={merged}
            dateFields={<TextInput label="Pickup date" type="date" name="pickupDate" required value={values.pickupDate} onChange={set('pickupDate')} error={merged.pickupDate} />}
          />
          <StopFields
            prefix="destination" title="Delivery" values={values} set={set} errors={merged}
            dateFields={<TextInput label="Delivery date (optional)" type="date" name="deliveryDate" value={values.deliveryDate} onChange={set('deliveryDate')} error={merged.deliveryDate} />}
          />
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextInput label="Commodity" hint="What is being shipped?" name="commodity" required value={values.commodity} onChange={set('commodity')} error={merged.commodity} />
          </div>
          <TextInput label="Weight" type="number" inputMode="decimal" min="0" name="weight.value" required value={values['weight.value']} onChange={set('weight.value')} error={merged['weight.value']} />
          <SelectInput label="Weight unit" name="weight.unit" options={[{ value: 'lb', label: 'Pounds (lb)' }, { value: 'kg', label: 'Kilograms (kg)' }]} value={values['weight.unit']} onChange={set('weight.unit')} />
          <TextInput label="Quantity (optional)" type="number" inputMode="numeric" min="0" name="quantity" value={values.quantity} onChange={set('quantity')} error={merged.quantity} />
          <TextInput label="Pallets (optional)" type="number" inputMode="numeric" min="0" name="pallets" value={values.pallets} onChange={set('pallets')} error={merged.pallets} />
          <TextInput label="Length (optional)" type="number" inputMode="decimal" min="0" name="dimensions.length" value={values['dimensions.length']} onChange={set('dimensions.length')} error={merged['dimensions.length']} />
          <TextInput label="Width (optional)" type="number" inputMode="decimal" min="0" name="dimensions.width" value={values['dimensions.width']} onChange={set('dimensions.width')} error={merged['dimensions.width']} />
          <TextInput label="Height (optional)" type="number" inputMode="decimal" min="0" name="dimensions.height" value={values['dimensions.height']} onChange={set('dimensions.height')} error={merged['dimensions.height']} />
          <SelectInput label="Dimension unit" name="dimensions.unit" options={[{ value: 'in', label: 'Inches (in)' }, { value: 'cm', label: 'Centimetres (cm)' }]} value={values['dimensions.unit']} onChange={set('dimensions.unit')} />
          <SelectInput label="Equipment" name="equipmentType" required placeholder="Select equipment" options={EQUIPMENT_OPTIONS.map((value) => ({ value, label: value }))} value={values.equipmentType} onChange={set('equipmentType')} error={merged.equipmentType} />
          {isReefer && (
            <>
              <TextInput label="Minimum temperature (optional)" type="number" inputMode="decimal" name="temperatureRequirements.minimum" value={values['temperatureRequirements.minimum']} onChange={set('temperatureRequirements.minimum')} error={merged['temperatureRequirements.minimum']} />
              <TextInput label="Maximum temperature (optional)" type="number" inputMode="decimal" name="temperatureRequirements.maximum" value={values['temperatureRequirements.maximum']} onChange={set('temperatureRequirements.maximum')} error={merged['temperatureRequirements.maximum']} />
              <SelectInput label="Temperature unit" name="temperatureRequirements.unit" options={[{ value: 'F', label: 'Fahrenheit (°F)' }, { value: 'C', label: 'Celsius (°C)' }]} value={values['temperatureRequirements.unit']} onChange={set('temperatureRequirements.unit')} />
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <ChoiceGroup legend="Transportation type" name="shipmentType" options={SHIPMENT_CHOICES} value={values.shipmentType} onChange={(shipmentType) => setValues((v) => ({ ...v, shipmentType }))} error={merged.shipmentType} />
      )}

      {step === 3 && (
        <div className="grid gap-6 sm:grid-cols-2">
          <TextInput label="Name" name="contactInformation.name" autoComplete="name" required value={values['contactInformation.name']} onChange={set('contactInformation.name')} error={merged['contactInformation.name']} />
          <TextInput label="Company (optional)" name="contactInformation.company" autoComplete="organization" value={values['contactInformation.company']} onChange={set('contactInformation.company')} error={merged['contactInformation.company']} />
          <TextInput label="Email" type="email" name="contactInformation.email" autoComplete="email" required value={values['contactInformation.email']} onChange={set('contactInformation.email')} error={merged['contactInformation.email']} />
          <TextInput label="Phone" type="tel" name="contactInformation.phone" autoComplete="tel" required value={values['contactInformation.phone']} onChange={set('contactInformation.phone')} error={merged['contactInformation.phone']} />
        </div>
      )}

      {step === 4 && (
        <div className="space-y-6">
          <TextArea label="Special instructions (optional)" hint="Appointments, handling, access restrictions, or other notes." name="specialInstructions" value={values.specialInstructions} onChange={set('specialInstructions')} error={merged.specialInstructions} />
          <p className="text-base text-steel-600">
            Files cannot be uploaded from the website. If documents are needed, our team will ask for them when we contact you,
            or you can <Link className="font-semibold underline underline-offset-4" to={PATHS.register}>create a customer account</Link>.
          </p>
        </div>
      )}

      {step === REVIEW && (
        <div className="space-y-6">
          <p className="text-base text-steel-600">Check the details below. Use Back to change anything, then submit.</p>
          <dl className="text-base">
            <ReviewRow label="Pickup" value={`${where('origin')}${values.pickupDate ? ` on ${values.pickupDate}` : ''}`} />
            <ReviewRow label="Delivery" value={`${where('destination')}${values.deliveryDate ? ` by ${values.deliveryDate}` : ''}`} />
            <ReviewRow label="Commodity" value={values.commodity} />
            <ReviewRow label="Weight" value={`${values['weight.value']} ${values['weight.unit']}`} />
            <ReviewRow label="Quantity" value={values.quantity} />
            <ReviewRow label="Pallets" value={values.pallets} />
            <ReviewRow label="Dimensions" value={dims.length ? `${dims.join(' × ')} ${values['dimensions.unit']}` : ''} />
            <ReviewRow label="Equipment" value={values.equipmentType} />
            <ReviewRow label="Temperature" value={isReefer && temperature.length ? `${temperature.join(' to ')} °${values['temperatureRequirements.unit']}` : ''} />
            <ReviewRow label="Transportation" value={SHIPMENT_CHOICES.find((o) => o.value === values.shipmentType)?.label} />
            <ReviewRow label="Name" value={values['contactInformation.name']} />
            <ReviewRow label="Company" value={values['contactInformation.company']} />
            <ReviewRow label="Email" value={values['contactInformation.email']} />
            <ReviewRow label="Phone" value={values['contactInformation.phone']} />
            <ReviewRow label="Instructions" value={values.specialInstructions} />
          </dl>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-steel-200 pt-6 sm:flex-row sm:justify-between">
        {step > 0 ? (
          <Button variant="secondary" onClick={back} disabled={submission.isSubmitting}>Back</Button>
        ) : (
          <span />
        )}
        {step === REVIEW ? (
          <Button type="submit" size="lg" loading={submission.isSubmitting}>
            {submission.isSubmitting ? 'Submitting…' : 'Submit Quote Request'}
          </Button>
        ) : (
          <Button type="submit" size="lg">{step === REVIEW - 1 ? 'Review' : 'Next'}</Button>
        )}
      </div>
    </form>
  );
}
