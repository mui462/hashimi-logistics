import { useState } from 'react';
import { EQUIPMENT_TYPES as EQUIPMENT_VALUES } from '../../config/adminStatuses';
import { useSubmitState } from '../../hooks/useSubmitState';
import { submitCarrierApplication } from '../../services/carrierApplicationService';
import { focusFirstInvalid } from '../../utils/focus';
import { digitsOnly, hasErrors, maxLength, required, validEmail, validPhone } from '../../utils/validators';
import Button from '../common/Button';
import ChoiceGroup from './ChoiceGroup';
import { FormErrorSummary, SuccessPanel } from './FormStatus';
import SelectInput from './SelectInput';
import TextArea from './TextArea';
import TextInput from './TextInput';

// The values are the equipment types the API stores (the same list as quotes, loads and carrier profiles).
export const EQUIPMENT_TYPES = EQUIPMENT_VALUES.map((value) => ({ value, label: value }));

export const OPERATING_REGIONS = [
  { value: 'us_domestic', label: 'U.S. Domestic' },
  { value: 'us_canada', label: 'U.S. ↔ Canada' },
  { value: 'us_mexico', label: 'U.S. ↔ Mexico' },
];

const INITIAL = {
  companyName: '', contactPerson: '', email: '', phone: '', mcNumber: '', dotNumber: '', address: '',
  equipmentTypes: [], operatingRegions: [], crossBorder: '', notes: '',
};

function validate(v) {
  return {
    companyName: required(v.companyName, 'Company name'),
    contactPerson: required(v.contactPerson, 'Contact person'),
    email: validEmail(v.email),
    phone: validPhone(v.phone),
    mcNumber: digitsOnly(v.mcNumber, 'MC number'),
    dotNumber: digitsOnly(v.dotNumber, 'DOT number'),
    address: required(v.address, 'Address'),
    equipmentTypes: v.equipmentTypes.length ? '' : 'Select at least one equipment type.',
    operatingRegions: v.operatingRegions.length ? '' : 'Select at least one operating region.',
    crossBorder: required(v.crossBorder, 'Cross-border capability'),
    notes: maxLength(v.notes, 2000, 'Additional notes'),
  };
}

// JSON body for POST /carrier-applications: exactly the fields the API accepts. Status and review are decided by the server.
export function buildApplicationPayload(v) {
  const payload = {
    companyName: v.companyName.trim(),
    contactPerson: v.contactPerson.trim(),
    email: v.email.trim(),
    phone: v.phone.trim(),
    mcNumber: v.mcNumber.trim(),
    dotNumber: v.dotNumber.trim(),
    address: v.address.trim(),
    equipmentTypes: v.equipmentTypes,
    operatingRegions: v.operatingRegions,
    crossBorder: v.crossBorder,
  };
  if (v.notes.trim()) payload.notes = v.notes.trim();
  return payload;
}

export default function CarrierApplicationForm({ submitApplication = submitCarrierApplication }) {
  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const submission = useSubmitState();
  const set = (name) => (event) => setValues((v) => ({ ...v, [name]: event.target.value }));
  const merged = { ...errors, ...submission.fieldErrors };

  const onSubmit = async (event) => {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (hasErrors(found)) {
      focusFirstInvalid();
      return;
    }
    const ok = await submission.run(() => submitApplication(buildApplicationPayload(values)));
    if (!ok) focusFirstInvalid();
  };

  if (submission.status === 'success') {
    return (
      <SuccessPanel title="Application submitted">
        <p>
          Your carrier application was received. Our team will review your authority, insurance and equipment and contact you
          about next steps. No email confirmation is sent.
        </p>
      </SuccessPanel>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-10" aria-label="Carrier application form">
      <FormErrorSummary error={submission.status === 'error' ? submission.error : ''} />

      <fieldset className="space-y-6">
        <legend className="text-xl font-extrabold">Company details</legend>
        <div className="grid gap-6 sm:grid-cols-2">
          <TextInput label="Company Name" name="companyName" autoComplete="organization" required value={values.companyName} onChange={set('companyName')} error={merged.companyName} />
          <TextInput label="Contact Person" name="contactPerson" autoComplete="name" required value={values.contactPerson} onChange={set('contactPerson')} error={merged.contactPerson} />
          <TextInput label="Email" name="email" type="email" autoComplete="email" required value={values.email} onChange={set('email')} error={merged.email} />
          <TextInput label="Phone" name="phone" type="tel" autoComplete="tel" required value={values.phone} onChange={set('phone')} error={merged.phone} />
          <TextInput label="MC Number" name="mcNumber" inputMode="numeric" required value={values.mcNumber} onChange={set('mcNumber')} error={merged.mcNumber} />
          <TextInput label="DOT Number" name="dotNumber" inputMode="numeric" required value={values.dotNumber} onChange={set('dotNumber')} error={merged.dotNumber} />
        </div>
        <TextInput label="Address" name="address" autoComplete="street-address" required value={values.address} onChange={set('address')} error={merged.address} />
      </fieldset>

      <fieldset className="space-y-6">
        <legend className="text-xl font-extrabold">Equipment and coverage</legend>
        <ChoiceGroup legend="Equipment Types" type="checkbox" name="equipmentTypes" options={EQUIPMENT_TYPES} columns={3} value={values.equipmentTypes} onChange={(equipmentTypes) => setValues((v) => ({ ...v, equipmentTypes }))} error={merged.equipmentTypes} />
        <ChoiceGroup legend="Operating Regions" type="checkbox" name="operatingRegions" options={OPERATING_REGIONS} columns={3} value={values.operatingRegions} onChange={(operatingRegions) => setValues((v) => ({ ...v, operatingRegions }))} error={merged.operatingRegions} />
        <SelectInput
          label="Cross-Border Capability"
          name="crossBorder"
          required
          placeholder="Select an option"
          options={[
            { value: 'yes', label: 'Yes, we can cross the border' },
            { value: 'no', label: 'No, domestic only' },
          ]}
          value={values.crossBorder}
          onChange={set('crossBorder')}
          error={merged.crossBorder}
        />
      </fieldset>

      <fieldset className="space-y-6">
        <legend className="text-xl font-extrabold">Documents and notes</legend>
        <p className="text-base text-steel-600">
          Documents (W-9, insurance, operating authority, carrier agreement) are not uploaded here. After we review your
          application, our team will tell you exactly what is needed and how to send it.
        </p>
        <TextArea label="Additional notes (optional)" name="notes" rows={4} value={values.notes} onChange={set('notes')} error={merged.notes} />
      </fieldset>

      <Button type="submit" size="lg" loading={submission.isSubmitting}>
        {submission.isSubmitting ? 'Submitting…' : 'Submit Application'}
      </Button>
    </form>
  );
}
