import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminPage from '../../components/admin/AdminPage';
import { useAdminToast } from '../../components/admin/AdminToast';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import Panel from '../../components/customer/Panel';
import SelectInput from '../../components/forms/SelectInput';
import TextArea from '../../components/forms/TextArea';
import TextInput from '../../components/forms/TextInput';
import { EQUIPMENT_TYPES, NA_TIMEZONES, options } from '../../config/adminStatuses';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useSubmitState } from '../../hooks/useSubmitState';
import * as admin from '../../services/adminService';
import { focusFirstInvalid } from '../../utils/focus';
import { centsToDollars, dollarsToCents } from '../../utils/money';

const tzOptions = (current) => options([...new Set([...(current ? [current] : []), ...NA_TIMEZONES])]).map((o) => ({ value: o.value, label: o.value }));
const localInput = (local) => (local ? local.replace(' ', 'T') : '');

function useSection(onSaved, message) {
  const toast = useAdminToast();
  const submit = useSubmitState();
  const [errors, setErrors] = useState({});
  const save = async (validate, action) => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstInvalid();
      return;
    }
    if (await submit.run(action)) {
      toast.success(message);
      onSaved();
    }
  };
  return { ...submit, errors: { ...submit.fieldErrors, ...errors }, save };
}

function DetailsForm({ load, onSaved }) {
  const section = useSection(onSaved, 'Load details saved.');
  const [v, setV] = useState({ commodity: load.commodity ?? '', equipmentType: load.equipmentType ?? '', weight: load.weight?.value ?? '', unit: load.weight?.unit ?? 'lb', specialInstructions: load.specialInstructions ?? '', internalNotes: load.internalNotes ?? '' });
  const set = (name) => (event) => setV((current) => ({ ...current, [name]: event.target.value }));
  const submit = (event) => {
    event.preventDefault();
    section.save(
      () => {
        const found = {};
        if (!v.commodity.trim()) found.commodity = 'Commodity is required.';
        if (v.weight !== '' && !(Number(v.weight) > 0)) found.weight = 'Enter a weight greater than zero.';
        return found;
      },
      () =>
        admin.updateLoad(load.id, {
          commodity: v.commodity.trim(),
          ...(v.equipmentType ? { equipmentType: v.equipmentType } : {}),
          ...(v.weight !== '' ? { weight: { value: Number(v.weight), unit: v.unit } } : {}),
          specialInstructions: v.specialInstructions.trim(),
          internalNotes: v.internalNotes.trim(),
        })
    );
  };
  return (
    <form onSubmit={submit} noValidate aria-label="Load details" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Commodity" value={v.commodity} onChange={set('commodity')} error={section.errors.commodity} maxLength={200} />
        <SelectInput label="Equipment" value={v.equipmentType} onChange={set('equipmentType')} options={options(EQUIPMENT_TYPES)} placeholder="Not set" error={section.errors.equipmentType} />
        <TextInput label="Weight" inputMode="decimal" value={v.weight} onChange={set('weight')} error={section.errors.weight} />
        <SelectInput label="Weight unit" value={v.unit} onChange={set('unit')} options={[{ value: 'lb', label: 'Pounds (lb)' }, { value: 'kg', label: 'Kilograms (kg)' }]} />
      </div>
      <TextArea label="Special instructions" rows={3} value={v.specialInstructions} onChange={set('specialInstructions')} maxLength={3000} error={section.errors.specialInstructions} />
      <TextArea label="Internal notes" hint="Only the Super Admin can see these." rows={3} value={v.internalNotes} onChange={set('internalNotes')} maxLength={5000} error={section.errors.internalNotes} />
      {section.error && <Alert>{section.error}</Alert>}
      <Button type="submit" loading={section.isSubmitting}>Save details</Button>
    </form>
  );
}

function ScheduleForm({ load, onSaved }) {
  const section = useSection(onSaved, 'Schedule saved.');
  const [v, setV] = useState({
    pickupEarliest: localInput(load.pickup?.earliestLocal), pickupLatest: localInput(load.pickup?.latestLocal), pickupTz: load.pickup?.timezone ?? '',
    deliveryEarliest: localInput(load.delivery?.earliestLocal), deliveryLatest: localInput(load.delivery?.latestLocal), deliveryTz: load.delivery?.timezone ?? '',
  });
  const set = (name) => (event) => setV((current) => ({ ...current, [name]: event.target.value }));
  const windowBody = (earliest, latest, timezone) => ({ ...(earliest ? { earliest } : {}), ...(latest ? { latest } : {}), timezone });
  const submit = (event) => {
    event.preventDefault();
    section.save(
      () => {
        const found = {};
        if ((v.pickupEarliest || v.pickupLatest) && !v.pickupTz) found.pickupTz = 'Choose the time zone of the pickup location.';
        if ((v.deliveryEarliest || v.deliveryLatest) && !v.deliveryTz) found.deliveryTz = 'Choose the time zone of the delivery location.';
        if (!v.pickupEarliest && !v.pickupLatest && !v.deliveryEarliest && !v.deliveryLatest) found.pickupEarliest = 'Enter at least one pickup or delivery time.';
        return found;
      },
      () =>
        admin.scheduleLoad(load.id, {
          ...(v.pickupEarliest || v.pickupLatest ? { pickup: windowBody(v.pickupEarliest, v.pickupLatest, v.pickupTz) } : {}),
          ...(v.deliveryEarliest || v.deliveryLatest ? { delivery: windowBody(v.deliveryEarliest, v.deliveryLatest, v.deliveryTz) } : {}),
        })
    );
  };
  return (
    <form onSubmit={submit} noValidate aria-label="Schedule" className="space-y-4">
      <p className="text-base text-steel-600">Times are the local wall-clock time at each stop, in that stop’s time zone. They are never converted from your own time zone.</p>
      <fieldset className="space-y-4">
        <legend className="text-lg font-bold">Pickup window</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput label="Earliest" type="datetime-local" value={v.pickupEarliest} onChange={set('pickupEarliest')} error={section.errors['pickup.earliest'] ?? section.errors.pickupEarliest} />
          <TextInput label="Latest" type="datetime-local" value={v.pickupLatest} onChange={set('pickupLatest')} error={section.errors['pickup.latest']} />
          <SelectInput label="Pickup time zone" value={v.pickupTz} onChange={set('pickupTz')} options={tzOptions(load.pickup?.timezone)} placeholder="Choose a time zone" error={section.errors.pickupTz ?? section.errors['pickup.timezone']} />
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="text-lg font-bold">Delivery window</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput label="Earliest" type="datetime-local" value={v.deliveryEarliest} onChange={set('deliveryEarliest')} error={section.errors['delivery.earliest']} />
          <TextInput label="Latest" type="datetime-local" value={v.deliveryLatest} onChange={set('deliveryLatest')} error={section.errors['delivery.latest'] ?? section.errors.delivery} />
          <SelectInput label="Delivery time zone" value={v.deliveryTz} onChange={set('deliveryTz')} options={tzOptions(load.delivery?.timezone)} placeholder="Choose a time zone" error={section.errors.deliveryTz ?? section.errors['delivery.timezone']} />
        </div>
      </fieldset>
      {section.error && <Alert>{section.error}</Alert>}
      <Button type="submit" loading={section.isSubmitting}>Save schedule</Button>
    </form>
  );
}

function CarrierRateForm({ load, onSaved }) {
  const section = useSection(onSaved, 'Carrier rate saved.');
  const [rate, setRate] = useState(centsToDollars(load.pricing?.carrierRate?.amount));
  const [allowLoss, setAllowLoss] = useState('stop');
  const submit = (event) => {
    event.preventDefault();
    section.save(
      () => (dollarsToCents(rate) == null ? { carrierRate: 'Enter the carrier rate as an amount such as 1980.00.' } : {}),
      () => admin.setCarrierRate(load.id, { carrierRate: dollarsToCents(rate), ...(allowLoss === 'allow' ? { allowNegativeMargin: true } : {}) })
    );
  };
  return (
    <form onSubmit={submit} noValidate aria-label="Carrier rate" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Carrier rate" inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} error={section.errors.carrierRate} autoComplete="off" />
        <SelectInput label="If this would sell the load at a loss" value={allowLoss} onChange={(event) => setAllowLoss(event.target.value)} options={[{ value: 'stop', label: 'Stop and warn me (recommended)' }, { value: 'allow', label: 'Allow a negative margin' }]} />
      </div>
      <p className="text-base text-steel-600">The margin is calculated by the server from the customer rate and this carrier rate.</p>
      {section.error && <Alert>{section.error}</Alert>}
      <Button type="submit" loading={section.isSubmitting}>Save carrier rate</Button>
    </form>
  );
}

export default function LoadEditPage() {
  const { id } = useParams();
  const state = useAsyncData(useCallback(() => admin.getLoad(id), [id]));
  const load = state.data;
  return (
    <AdminPage
      title={load ? `Edit load ${load.loadNumber}` : 'Edit load'}
      trail={[{ label: 'Loads', to: '/admin/loads' }, { label: load ? load.loadNumber : 'Load', to: `/admin/loads/${encodeURIComponent(id)}` }, { label: 'Edit' }]}
      description="Each section saves on its own. The server refuses changes that are no longer allowed for this load’s status."
    >
      <AdminAsyncView state={state} label="Loading load" errorTitle="We could not load this load" notFound="load">
        {(l) => (
          <div className="space-y-6">
            <Panel title="Details"><DetailsForm key={`${l.updatedAt}-d`} load={l} onSaved={state.reload} /></Panel>
            <Panel title="Schedule"><ScheduleForm key={`${l.updatedAt}-s`} load={l} onSaved={state.reload} /></Panel>
            <Panel title="Carrier rate"><CarrierRateForm key={`${l.updatedAt}-r`} load={l} onSaved={state.reload} /></Panel>
          </div>
        )}
      </AdminAsyncView>
    </AdminPage>
  );
}
