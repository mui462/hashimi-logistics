import { useState } from 'react';
import { useSubmitState } from '../../hooks/useSubmitState';
import { updateProfile } from '../../services/carrierService';
import { focusFirstInvalid } from '../../utils/focus';
import { hasErrors, maxLength, required, validEmail, validPhone } from '../../utils/validators';
import Alert from '../common/Alert';
import Button from '../common/Button';
import ChoiceGroup from './ChoiceGroup';
import { EQUIPMENT_OPTIONS } from './CustomerQuoteForm';
import SelectInput from './SelectInput';
import TextInput from './TextInput';

const COUNTRIES = [{ value: '', label: 'Select country' }, { value: 'US', label: 'United States' }, { value: 'CA', label: 'Canada' }, { value: 'MX', label: 'Mexico' }];
const EQUIPMENT_CHOICES = EQUIPMENT_OPTIONS.map((value) => ({ value, label: value }));
const v = (value) => value ?? '';

function initialValues({ account, company }) {
  return {
    firstName: v(account.firstName), lastName: v(account.lastName), phone: v(account.phone),
    companyName: v(company.companyName), contactPerson: v(company.contactPerson), businessEmail: v(company.businessEmail),
    'address.street': v(company.address?.street), 'address.city': v(company.address?.city), 'address.state': v(company.address?.state),
    'address.zipCode': v(company.address?.zipCode), 'address.country': v(company.address?.country),
    equipmentTypes: [...(company.equipmentTypes ?? [])],
    operatingRegions: (company.operatingRegions ?? []).join(', '),
    crossBorderCapability: Boolean(company.crossBorderCapability),
  };
}

const optionalEmail = (value, label) => (value.trim() ? validEmail(value, label) : '');
export const splitRegions = (text) => [...new Set(text.split(',').map((region) => region.trim()).filter(Boolean))];

export function validateProfile(values) {
  const regions = splitRegions(values.operatingRegions);
  return {
    firstName: required(values.firstName, 'First name') || maxLength(values.firstName, 60, 'First name'),
    lastName: required(values.lastName, 'Last name') || maxLength(values.lastName, 60, 'Last name'),
    phone: validPhone(values.phone, 'Phone', { optional: true }),
    companyName: required(values.companyName, 'Company name') || maxLength(values.companyName, 150, 'Company name'),
    contactPerson: maxLength(values.contactPerson, 120, 'Contact person'),
    businessEmail: optionalEmail(values.businessEmail, 'Business email'),
    operatingRegions: regions.length > 60 ? 'Use 60 regions or fewer.' : regions.some((region) => region.length > 100) ? 'Each region must be 100 characters or fewer.' : '',
  };
}

const compactObject = (entries) => Object.fromEntries(entries.filter(([, value]) => String(value ?? '').trim() !== '').map(([key, value]) => [key, String(value).trim()]));

// Only the fields a carrier is allowed to change. MC and DOT numbers, authority and compliance status, rating, role
// and security fields do not exist here, and the server rejects them anyway.
export function buildProfilePayload(values) {
  const address = compactObject(['street', 'city', 'state', 'zipCode', 'country'].map((key) => [key, values[`address.${key}`]]));
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    ...compactObject([['phone', values.phone], ['contactPerson', values.contactPerson], ['businessEmail', values.businessEmail]]),
    companyName: values.companyName.trim(),
    ...(Object.keys(address).length ? { address } : {}),
    equipmentTypes: values.equipmentTypes,
    operatingRegions: splitRegions(values.operatingRegions),
    crossBorderCapability: values.crossBorderCapability,
  };
}

export default function CarrierProfileForm({ profile, onSaved, save = updateProfile }) {
  const [values, setValues] = useState(() => initialValues(profile));
  const [errors, setErrors] = useState({});
  const submission = useSubmitState();
  const merged = { ...errors, ...submission.fieldErrors };
  const set = (name) => (event) => setValues((current) => ({ ...current, [name]: event.target.value }));

  const onSubmit = async (event) => {
    event.preventDefault();
    const found = validateProfile(values);
    setErrors(found);
    if (hasErrors(found)) {
      focusFirstInvalid();
      return;
    }
    const ok = await submission.run(async () => {
      const updated = await save(buildProfilePayload(values));
      onSaved(updated);
      return updated;
    });
    if (!ok) focusFirstInvalid();
  };

  return (
    <form noValidate aria-label="Profile details" onSubmit={onSubmit} className="space-y-10">
      {submission.status === 'error' && <Alert>{submission.error}</Alert>}
      {submission.status === 'success' && <Alert tone="success">Your profile was updated.</Alert>}

      <fieldset className="space-y-6">
        <legend className="text-xl font-bold">Your details</legend>
        <div className="grid gap-6 sm:grid-cols-2">
          <TextInput label="First name" name="firstName" autoComplete="given-name" required value={values.firstName} onChange={set('firstName')} error={merged.firstName} />
          <TextInput label="Last name" name="lastName" autoComplete="family-name" required value={values.lastName} onChange={set('lastName')} error={merged.lastName} />
          <TextInput label="Phone" type="tel" name="phone" autoComplete="tel" value={values.phone} onChange={set('phone')} error={merged.phone} />
        </div>
      </fieldset>

      <fieldset className="space-y-6">
        <legend className="text-xl font-bold">Company</legend>
        <div className="grid gap-6 sm:grid-cols-2">
          <TextInput label="Company name" name="companyName" autoComplete="organization" required value={values.companyName} onChange={set('companyName')} error={merged.companyName} />
          <TextInput label="Contact person" name="contactPerson" value={values.contactPerson} onChange={set('contactPerson')} error={merged.contactPerson} />
          <TextInput label="Business email" type="email" name="businessEmail" hint="Used for company correspondence. It is not your sign-in email." value={values.businessEmail} onChange={set('businessEmail')} error={merged.businessEmail} />
          <div className="hidden sm:block" aria-hidden="true" />
          <div className="sm:col-span-2"><TextInput label="Street address" name="address.street" autoComplete="off" value={values['address.street']} onChange={set('address.street')} /></div>
          <TextInput label="City" name="address.city" value={values['address.city']} onChange={set('address.city')} />
          <TextInput label="State or province" name="address.state" value={values['address.state']} onChange={set('address.state')} />
          <TextInput label="Postal code" name="address.zipCode" value={values['address.zipCode']} onChange={set('address.zipCode')} />
          <SelectInput label="Country" name="address.country" options={COUNTRIES} value={values['address.country']} onChange={set('address.country')} />
        </div>
      </fieldset>

      <fieldset className="space-y-6">
        <legend className="text-xl font-bold">Capacity</legend>
        <ChoiceGroup
          legend="Equipment you operate"
          name="equipmentTypes"
          type="checkbox"
          columns={3}
          options={EQUIPMENT_CHOICES}
          value={values.equipmentTypes}
          onChange={(equipmentTypes) => setValues((current) => ({ ...current, equipmentTypes }))}
        />
        <TextInput label="Operating regions" name="operatingRegions" hint="Where you pick up freight, separated by commas: states, provinces or cities, for example Texas, Illinois, Ontario, or Nationwide. Loads are matched to these." value={values.operatingRegions} onChange={set('operatingRegions')} error={merged.operatingRegions} />
        <ChoiceGroup
          legend="Cross-border"
          name="crossBorderCapability"
          type="checkbox"
          columns={1}
          options={[{ value: 'yes', label: 'We can haul freight across the US, Canada and Mexico borders' }]}
          value={values.crossBorderCapability ? ['yes'] : []}
          onChange={(selected) => setValues((current) => ({ ...current, crossBorderCapability: selected.includes('yes') }))}
        />
      </fieldset>

      <div className="flex justify-end border-t border-steel-200 pt-6">
        <Button type="submit" size="lg" loading={submission.isSubmitting}>{submission.isSubmitting ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </form>
  );
}
