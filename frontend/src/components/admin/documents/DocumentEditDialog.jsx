import { useState } from 'react';
import { updateDocument } from '../../../services/adminService';
import Alert from '../../common/Alert';
import Button from '../../common/Button';
import SelectInput from '../../forms/SelectInput';
import TextInput from '../../forms/TextInput';
import { toFieldErrors } from '../../../utils/apiRequestError';
import { useAdminToast } from '../AdminToast';
import AdminModal from '../cms/AdminModal';
import RecordPicker from './RecordPicker';
import { RELATED_LABELS, TYPE_OPTIONS, VISIBILITY_OPTIONS } from './documentOptions';

/** Edits a document's name, type, visibility and (optionally) the record it belongs to. The server re-derives the owners. */
export default function DocumentEditDialog({ document, onClose, onSaved }) {
  const toast = useAdminToast();
  const [v, setV] = useState({ name: document.name, type: document.type, visibility: document.visibility, relatedEntityType: document.relatedEntityType ?? 'shipment', relatedEntityId: '' });
  const [move, setMove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const set = (name) => (event) => setV((current) => ({ ...current, [name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (move && !v.relatedEntityId) { setErrors({ relatedEntityId: 'Choose the new record.' }); setError('Choose the new record.'); return; }
    setBusy(true);
    setError('');
    setErrors({});
    try {
      await updateDocument(document.id, { name: v.name.trim(), type: v.type, visibility: v.visibility, ...(move ? { relatedEntityType: v.relatedEntityType, relatedEntityId: v.relatedEntityId } : {}) });
      toast.success('Document saved.');
      onSaved();
    } catch (caught) {
      setError(caught?.message || 'That did not work. Please try again.');
      setErrors(toFieldErrors(caught?.errors));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AdminModal open wide title="Edit document" onClose={() => !busy && onClose()}>
      <form onSubmit={submit} noValidate className="space-y-4" aria-busy={busy || undefined}>
        <TextInput label="Display name" value={v.name} onChange={set('name')} error={errors.name} maxLength={200} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectInput label="Document type" value={v.type} onChange={set('type')} options={TYPE_OPTIONS} error={errors.type} />
          <SelectInput label="Who can see it" value={v.visibility} onChange={set('visibility')} options={VISIBILITY_OPTIONS} error={errors.visibility} />
        </div>
        <p className="text-base text-steel-600">Currently attached to: <strong>{document.related?.label ?? RELATED_LABELS[document.relatedEntityType] ?? '—'}</strong>. The customer and carrier always follow the record.</p>
        {!move ? <Button variant="secondary" onClick={() => setMove(true)}>Attach to a different record</Button> : <RecordPicker value={v} onChange={(changes) => setV((current) => ({ ...current, ...changes }))} errors={errors} />}
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" loading={busy}>Save</Button>
        </div>
      </form>
    </AdminModal>
  );
}
