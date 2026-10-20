import { useState } from 'react';
import { listCarriers, listCustomers, listLoads, listShipments } from '../../../services/adminService';
import Button from '../../common/Button';
import SelectInput from '../../forms/SelectInput';
import TextInput from '../../forms/TextInput';
import { PICKER_TYPES, RELATED_LABELS } from './documentOptions';

const SEARCH = {
  shipment: (q) => listShipments({ q, limit: 20 }).then((d) => d.items.map((i) => ({ value: i.id, label: `${i.trackingNumber}` }))),
  load: (q) => listLoads({ q, limit: 20 }).then((d) => d.items.map((i) => ({ value: i.id, label: `${i.loadNumber}` }))),
  customer: (q) => listCustomers({ q, limit: 20 }).then((d) => d.items.map((i) => ({ value: i.id, label: i.companyName }))),
  carrier: (q) => listCarriers({ q, limit: 20 }).then((d) => d.items.map((i) => ({ value: i.id, label: i.companyName }))),
};

/**
 * Chooses the record a document belongs to by searching real records. Only the record's id leaves this component: the
 * server derives the customer and carrier from that record, so they cannot be typed in or forged here.
 */
export default function RecordPicker({ value, onChange, errors = {} }) {
  const [results, setResults] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const type = value.relatedEntityType;

  const search = async () => {
    const q = query.trim();
    if (q.length === 1) { setMessage('Search needs at least 2 characters.'); return; }
    setBusy(true);
    setMessage('');
    try {
      const found = await SEARCH[type](q || undefined);
      setResults(found);
      if (found.length === 0) setMessage('Nothing matched. Try another search.');
    } catch {
      setMessage('We could not search right now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="space-y-4 rounded-md border border-steel-300 p-4">
      <legend className="px-1 text-base font-semibold">Belongs to</legend>
      <SelectInput label="Record type" value={type} onChange={(event) => { setResults(null); setMessage(''); onChange({ relatedEntityType: event.target.value, relatedEntityId: '' }); }} options={PICKER_TYPES.map((t) => ({ value: t, label: RELATED_LABELS[t] }))} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <TextInput label={`Search ${RELATED_LABELS[type].toLowerCase()}s`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); search(); } }} maxLength={60} autoComplete="off" />
        </div>
        <Button variant="secondary" loading={busy} onClick={search}>Search</Button>
      </div>
      {message && <p role="status" className="text-base text-steel-600">{message}</p>}
      {results && results.length > 0 && (
        <SelectInput label="Matching records" value={value.relatedEntityId} onChange={(event) => onChange({ relatedEntityId: event.target.value })} options={results} placeholder="Choose one" error={errors.relatedEntityId} />
      )}
      {!results && errors.relatedEntityId && <p className="text-base font-medium text-danger-700">{errors.relatedEntityId}</p>}
    </fieldset>
  );
}
