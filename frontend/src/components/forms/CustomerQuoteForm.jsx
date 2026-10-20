import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PATHS } from '../../config/paths';
import { useSubmitState } from '../../hooks/useSubmitState';
import { createQuote } from '../../services/customerService';
import { focusFirstInvalid } from '../../utils/focus';
import {
  dateNotBefore, dateNotInPast, hasErrors, maxLength, positiveNumber, required, validEmail, validPhone,
} from '../../utils/validators';
import Button from '../common/Button';
import { FormErrorSummary, SuccessPanel } from './FormStatus';
import SelectInput from './SelectInput';
import TextArea from './TextArea';
import TextInput from './TextInput';

/**
 * The signed-in customer's quote request. The public QuoteForm (guest wizard) reuses QUOTE_INITIAL, StopFields,
 * validateQuote and buildQuotePayload from here, so both send the same body the API validates. This form: it sends the structured addresses the QuoteRequest model needs, and it carries no
 * customer id at all (the server takes the customer from the session).
 */

export const EQUIPMENT_OPTIONS = ['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Box Truck', 'Straight Truck', 'Cargo Van', 'Sprinter', 'Other'];
export const SHIPMENT_TYPE_OPTIONS = ['FTL', 'LTL', 'Partial', 'Expedited', 'Other'];
const COUNTRIES = [{ value: 'US', label: 'United States' }, { value: 'CA', label: 'Canada' }, { value: 'MX', label: 'Mexico' }];

export const QUOTE_INITIAL = {
  'origin.facilityName': '', 'origin.street': '', 'origin.city': '', 'origin.state': '', 'origin.zipCode': '', 'origin.country': 'US',
  'destination.facilityName': '', 'destination.street': '', 'destination.city': '', 'destination.state': '', 'destination.zipCode': '', 'destination.country': 'US',
  pickupDate: '', deliveryDate: '',
  commodity: '', 'weight.value': '', 'weight.unit': 'lb', quantity: '', pallets: '',
  'dimensions.length': '', 'dimensions.width': '', 'dimensions.height': '', 'dimensions.unit': 'in',
  equipmentType: '', shipmentType: '', 'temperatureRequirements.minimum': '', 'temperatureRequirements.maximum': '', 'temperatureRequirements.unit': 'F',
  'contactInformation.name': '', 'contactInformation.email': '', 'contactInformation.phone': '',
  specialInstructions: '',
};

const blank = (value) => value === '' || value == null;
const num = (value) => Number(value);

export function validateQuote(v) {
  const errors = {
    'origin.city': required(v['origin.city'], 'Pickup city'),
    'destination.city': required(v['destination.city'], 'Delivery city'),
    pickupDate: dateNotInPast(v.pickupDate, 'Pickup date'),
    deliveryDate: v.deliveryDate ? dateNotBefore(v.deliveryDate, v.pickupDate, 'Delivery date', 'pickup date') : '',
    commodity: required(v.commodity, 'Commodity'),
    'weight.value': positiveNumber(v['weight.value'], 'Weight'),
    quantity: positiveNumber(v.quantity, 'Quantity', { optional: true }),
    pallets: positiveNumber(v.pallets, 'Pallets', { optional: true }),
    equipmentType: required(v.equipmentType, 'Equipment'),
    specialInstructions: maxLength(v.specialInstructions, 3000, 'Special requirements'),
    'contactInformation.name': required(v['contactInformation.name'], 'Contact name'),
    'contactInformation.email': validEmail(v['contactInformation.email'], 'Contact email'),
    'contactInformation.phone': validPhone(v['contactInformation.phone'], 'Contact phone'),
  };
  const [from, to] = [v['origin.country'], v['destination.country']];
  if (from !== to && from !== 'US' && to !== 'US') {
    errors['destination.country'] = 'Cross-border freight must move between the US and Canada, or the US and Mexico.';
  }
  const min = v['temperatureRequirements.minimum'];
  const max = v['temperatureRequirements.maximum'];
  if (!blank(min) && !blank(max) && num(max) < num(min)) errors['temperatureRequirements.maximum'] = 'The maximum temperature cannot be below the minimum.';
  return errors;
}

// Builds the request body from the form values. Empty optional values are left out; no customer id is ever included.
export function buildQuotePayload(v) {
  const stop = (prefix) => {
    const out = { city: v[`${prefix}.city`].trim(), country: v[`${prefix}.country`] };
    for (const key of ['facilityName', 'street', 'state', 'zipCode']) if (!blank(v[`${prefix}.${key}`].trim())) out[key] = v[`${prefix}.${key}`].trim();
    return out;
  };
  const payload = {
    origin: stop('origin'),
    destination: stop('destination'),
    pickupDate: v.pickupDate,
    equipmentType: v.equipmentType,
    commodity: v.commodity.trim(),
    weight: { value: num(v['weight.value']), unit: v['weight.unit'] },
    contactInformation: { name: v['contactInformation.name'].trim(), email: v['contactInformation.email'].trim(), phone: v['contactInformation.phone'].trim() },
  };
  if (v.deliveryDate) payload.deliveryDate = v.deliveryDate;
  if (v.shipmentType) payload.shipmentType = v.shipmentType;
  if (!blank(v.quantity)) payload.quantity = num(v.quantity);
  if (!blank(v.pallets)) payload.pallets = num(v.pallets);
  if (v.specialInstructions.trim()) payload.specialInstructions = v.specialInstructions.trim();
  const dims = ['length', 'width', 'height'].filter((key) => !blank(v[`dimensions.${key}`]));
  if (dims.length) payload.dimensions = { ...Object.fromEntries(dims.map((key) => [key, num(v[`dimensions.${key}`])])), unit: v['dimensions.unit'] };
  if (v.equipmentType === 'Reefer' && (!blank(v['temperatureRequirements.minimum']) || !blank(v['temperatureRequirements.maximum']))) {
    payload.temperatureRequirements = { unit: v['temperatureRequirements.unit'] };
    if (!blank(v['temperatureRequirements.minimum'])) payload.temperatureRequirements.minimum = num(v['temperatureRequirements.minimum']);
    if (!blank(v['temperatureRequirements.maximum'])) payload.temperatureRequirements.maximum = num(v['temperatureRequirements.maximum']);
  }
  return payload;
}

export function StopFields({ prefix, title, values, set, errors, dateFields }) {
  return (
    <fieldset className="space-y-6">
      <legend className="text-2xl font-bold">{title}</legend>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextInput label="Facility name (optional)" name={`${prefix}.facilityName`} autoComplete="off" value={values[`${prefix}.facilityName`]} onChange={set(`${prefix}.facilityName`)} error={errors[`${prefix}.facilityName`]} />
        </div>
        <div className="sm:col-span-2">
          <TextInput label="Street address (optional)" name={`${prefix}.street`} autoComplete="off" value={values[`${prefix}.street`]} onChange={set(`${prefix}.street`)} error={errors[`${prefix}.street`]} />
        </div>
        <TextInput label="City" name={`${prefix}.city`} required value={values[`${prefix}.city`]} onChange={set(`${prefix}.city`)} error={errors[`${prefix}.city`]} />
        <TextInput label="State or province (optional)" name={`${prefix}.state`} value={values[`${prefix}.state`]} onChange={set(`${prefix}.state`)} error={errors[`${prefix}.state`]} />
        <TextInput label="Postal code (optional)" name={`${prefix}.zipCode`} value={values[`${prefix}.zipCode`]} onChange={set(`${prefix}.zipCode`)} error={errors[`${prefix}.zipCode`]} />
        <SelectInput label="Country" name={`${prefix}.country`} options={COUNTRIES} value={values[`${prefix}.country`]} onChange={set(`${prefix}.country`)} error={errors[`${prefix}.country`]} />
        {dateFields}
      </div>
    </fieldset>
  );
}

export default function CustomerQuoteForm({ profile, submitQuote = createQuote }) {
  const [values, setValues] = useState(QUOTE_INITIAL);
  const [errors, setErrors] = useState({});
  const submission = useSubmitState();
  const prefilled = useRef(false);
  const merged = { ...errors, ...submission.fieldErrors };

  // Contact details start from the customer's own profile, but only fill fields the customer has not typed in.
  useEffect(() => {
    if (!profile || prefilled.current) return;
    prefilled.current = true;
    const name = [profile.account.firstName, profile.account.lastName].filter(Boolean).join(' ');
    setValues((v) => ({
      ...v,
      'contactInformation.name': v['contactInformation.name'] || name,
      'contactInformation.email': v['contactInformation.email'] || profile.account.email || '',
      'contactInformation.phone': v['contactInformation.phone'] || profile.account.phone || profile.company.phone || '',
    }));
  }, [profile]);

  const set = (name) => (event) => setValues((v) => ({ ...v, [name]: event.target.value }));

  const onSubmit = async (event) => {
    event.preventDefault();
    const found = validateQuote(values);
    setErrors(found);
    if (hasErrors(found)) {
      focusFirstInvalid();
      return;
    }
    const ok = await submission.run(() => submitQuote(buildQuotePayload(values)));
    if (!ok) focusFirstInvalid();
  };

  if (submission.status === 'success') {
    const quote = submission.result;
    return (
      <SuccessPanel
        title="Quote request submitted"
        action={
          <div className="flex flex-wrap gap-3">
            <Button to={`${PATHS.customer}/quotes/${quote.id}`}>View quote {quote.quoteNumber}</Button>
            <Button to={`${PATHS.customer}/quotes`} variant="secondary">Go to My quotes</Button>
          </div>
        }
      >
        <p>Your request <strong>{quote.quoteNumber}</strong> was received. Our team will review it and follow up with a rate.</p>
      </SuccessPanel>
    );
  }

  const isReefer = values.equipmentType === 'Reefer';

  return (
    <form noValidate aria-label="Request a quote" onSubmit={onSubmit} className="space-y-12">
      <FormErrorSummary error={submission.status === 'error' ? submission.error : ''} />

      <StopFields
        prefix="origin" title="Pickup" values={values} set={set} errors={merged}
        dateFields={<TextInput label="Pickup date" type="date" name="pickupDate" required value={values.pickupDate} onChange={set('pickupDate')} error={merged.pickupDate} />}
      />
      <StopFields
        prefix="destination" title="Delivery" values={values} set={set} errors={merged}
        dateFields={<TextInput label="Delivery date (optional)" type="date" name="deliveryDate" value={values.deliveryDate} onChange={set('deliveryDate')} error={merged.deliveryDate} />}
      />

      <fieldset className="space-y-6">
        <legend className="text-2xl font-bold">Freight</legend>
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
        </div>
      </fieldset>

      <fieldset className="space-y-6">
        <legend className="text-2xl font-bold">Equipment</legend>
        <div className="grid gap-6 sm:grid-cols-2">
          <SelectInput label="Equipment type" name="equipmentType" required placeholder="Select equipment" options={EQUIPMENT_OPTIONS.map((value) => ({ value, label: value }))} value={values.equipmentType} onChange={set('equipmentType')} error={merged.equipmentType} />
          <SelectInput label="Shipment type (optional)" name="shipmentType" placeholder="Not sure" options={SHIPMENT_TYPE_OPTIONS.map((value) => ({ value, label: value }))} value={values.shipmentType} onChange={set('shipmentType')} error={merged.shipmentType} />
          {isReefer && (
            <>
              <TextInput label="Minimum temperature (optional)" type="number" inputMode="decimal" name="temperatureRequirements.minimum" value={values['temperatureRequirements.minimum']} onChange={set('temperatureRequirements.minimum')} error={merged['temperatureRequirements.minimum']} />
              <TextInput label="Maximum temperature (optional)" type="number" inputMode="decimal" name="temperatureRequirements.maximum" value={values['temperatureRequirements.maximum']} onChange={set('temperatureRequirements.maximum')} error={merged['temperatureRequirements.maximum']} />
              <SelectInput label="Temperature unit" name="temperatureRequirements.unit" options={[{ value: 'F', label: 'Fahrenheit (°F)' }, { value: 'C', label: 'Celsius (°C)' }]} value={values['temperatureRequirements.unit']} onChange={set('temperatureRequirements.unit')} />
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="space-y-6">
        <legend className="text-2xl font-bold">Contact for this request</legend>
        <p className="text-base text-steel-600">Prefilled from your profile. Change it if someone else should be contacted about this shipment.</p>
        <div className="grid gap-6 sm:grid-cols-2">
          <TextInput label="Name" name="contactInformation.name" autoComplete="name" required value={values['contactInformation.name']} onChange={set('contactInformation.name')} error={merged['contactInformation.name']} />
          <TextInput label="Email" type="email" name="contactInformation.email" autoComplete="email" required value={values['contactInformation.email']} onChange={set('contactInformation.email')} error={merged['contactInformation.email']} />
          <TextInput label="Phone" type="tel" name="contactInformation.phone" autoComplete="tel" required value={values['contactInformation.phone']} onChange={set('contactInformation.phone')} error={merged['contactInformation.phone']} />
        </div>
      </fieldset>

      <fieldset className="space-y-6">
        <legend className="text-2xl font-bold">Special requirements &amp; notes</legend>
        <TextArea label="Anything our team should know (optional)" hint="Appointments, handling, access restrictions, or other notes." name="specialInstructions" value={values.specialInstructions} onChange={set('specialInstructions')} error={merged.specialInstructions} />
        <p className="text-base text-steel-600">File attachments are not available in the portal yet. <Link className="font-semibold underline underline-offset-4" to={PATHS.contact}>Contact our team</Link> if you need to send documents.</p>
      </fieldset>

      <div className="flex flex-col-reverse gap-3 border-t border-steel-200 pt-6 sm:flex-row sm:justify-end">
        <Button to={`${PATHS.customer}/quotes`} variant="secondary">Cancel</Button>
        <Button type="submit" size="lg" loading={submission.isSubmitting}>{submission.isSubmitting ? 'Submitting…' : 'Submit quote request'}</Button>
      </div>
    </form>
  );
}
