import { useState } from 'react';
import { useSubmitState } from '../../hooks/useSubmitState';
import { updateProfile } from '../../services/customerService';
import { focusFirstInvalid } from '../../utils/focus';
import { hasErrors, maxLength, required, validEmail, validPhone } from '../../utils/validators';
import Alert from '../common/Alert';
import Button from '../common/Button';
import SelectInput from './SelectInput';
import TextInput from './TextInput';

const COUNTRIES = [{ value: '', label: 'Select country' }, { value: 'US', label: 'United States' }, { value: 'CA', label: 'Canada' }, { value: 'MX', label: 'Mexico' }];
const v = (value) => value ?? '';

function initialValues({ account, company }) {
  return {
    firstName: v(account.firstName), lastName: v(account.lastName), phone: v(account.phone),
    companyName: v(company.companyName), contactPerson: v(company.contactPerson), businessEmail: v(company.businessEmail),
    'address.street': v(company.address?.street), 'address.city': v(company.address?.city), 'address.state': v(company.address?.state),
    'address.zipCode': v(company.address?.zipCode), 'address.country': v(company.address?.country),
    'billing.contactName': v(company.billing?.contactName), 'billing.email': v(company.billing?.email), 'billing.phone': v(company.billing?.phone),
    'billing.address.street': v(company.billing?.address?.street), 'billing.address.city': v(company.billing?.address?.city),
    'billing.address.state': v(company.billing?.address?.state), 'billing.address.zipCode': v(company.billing?.address?.zipCode),
    'billing.address.country': v(company.billing?.address?.country),
  };
}

const optionalEmail = (value, label) => (value.trim() ? validEmail(value, label) : '');

export function validateProfile(values) {
  return {
    firstName: required(values.firstName, 'First name') || maxLength(values.firstName, 60, 'First name'),
    lastName: required(values.lastName, 'Last name') || maxLength(values.lastName, 60, 'Last name'),
    phone: validPhone(values.phone, 'Phone', { optional: true }),
    companyName: required(values.companyName, 'Company name') || maxLength(values.companyName, 150, 'Company name'),
    contactPerson: maxLength(values.contactPerson, 120, 'Contact person'),
    businessEmail: optionalEmail(values.businessEmail, 'Business email'),
    'billing.email': optionalEmail(values['billing.email'], 'Billing email'),
    'billing.phone': validPhone(values['billing.phone'], 'Billing phone', { optional: true }),
  };
}

const compactObject = (entries) => Object.fromEntries(entries.filter(([, value]) => String(value ?? '').trim() !== '').map(([key, value]) => [key, String(value).trim()]));

// Only the fields a customer is allowed to change. Role, status, ids and security fields do not exist here,
// and the server rejects them anyway.
export function buildProfilePayload(values) {
  const address = compactObject(['street', 'city', 'state', 'zipCode', 'country'].map((key) => [key, values[`address.${key}`]]));
  const billingAddress = compactObject(['street', 'city', 'state', 'zipCode', 'country'].map((key) => [key, values[`billing.address.${key}`]]));
  const billing = compactObject([['contactName', values['billing.contactName']], ['email', values['billing.email']], ['phone', values['billing.phone']]]);
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    ...compactObject([['phone', values.phone], ['contactPerson', values.contactPerson], ['businessEmail', values.businessEmail]]),
    companyName: values.companyName.trim(),
    ...(Object.keys(address).length ? { address } : {}),
    ...(Object.keys(billing).length || Object.keys(billingAddress).length ? { billing: { ...billing, ...(Object.keys(billingAddress).length ? { address: billingAddress } : {}) } } : {}),
  };
}

function AddressFields({ prefix, values, set, errors }) {
  return (
    <>
      <div className="sm:col-span-2"><TextInput label="Street address" name={`${prefix}.street`} autoComplete="off" value={values[`${prefix}.street`]} onChange={set(`${prefix}.street`)} error={errors[`${prefix}.street`]} /></div>
      <TextInput label="City" name={`${prefix}.city`} value={values[`${prefix}.city`]} onChange={set(`${prefix}.city`)} error={errors[`${prefix}.city`]} />
      <TextInput label="State or province" name={`${prefix}.state`} value={values[`${prefix}.state`]} onChange={set(`${prefix}.state`)} error={errors[`${prefix}.state`]} />
      <TextInput label="Postal code" name={`${prefix}.zipCode`} value={values[`${prefix}.zipCode`]} onChange={set(`${prefix}.zipCode`)} error={errors[`${prefix}.zipCode`]} />
      <SelectInput label="Country" name={`${prefix}.country`} options={COUNTRIES} value={values[`${prefix}.country`]} onChange={set(`${prefix}.country`)} error={errors[`${prefix}.country`]} />
    </>
  );
}

export default function CustomerProfileForm({ profile, onSaved, save = updateProfile }) {
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
          <AddressFields prefix="address" values={values} set={set} errors={merged} />
        </div>
      </fieldset>

      <fieldset className="space-y-6">
        <legend className="text-xl font-bold">Billing contact</legend>
        <div className="grid gap-6 sm:grid-cols-2">
          <TextInput label="Billing contact name" name="billing.contactName" value={values['billing.contactName']} onChange={set('billing.contactName')} error={merged['billing.contactName']} />
          <TextInput label="Billing email" type="email" name="billing.email" value={values['billing.email']} onChange={set('billing.email')} error={merged['billing.email']} />
          <TextInput label="Billing phone" type="tel" name="billing.phone" value={values['billing.phone']} onChange={set('billing.phone')} error={merged['billing.phone']} />
          <div className="hidden sm:block" aria-hidden="true" />
          <AddressFields prefix="billing.address" values={values} set={set} errors={merged} />
        </div>
      </fieldset>

      <div className="flex justify-end border-t border-steel-200 pt-6">
        <Button type="submit" size="lg" loading={submission.isSubmitting}>{submission.isSubmitting ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </form>
  );
}
