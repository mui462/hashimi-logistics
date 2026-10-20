import { useState } from 'react';
import { uploadDocument } from '../../../services/adminService';
import FileUploadForm from '../../files/FileUploadForm';
import SelectInput from '../../forms/SelectInput';
import TextInput from '../../forms/TextInput';
import { useAdminToast } from '../AdminToast';
import AdminModal from '../cms/AdminModal';
import RecordPicker from './RecordPicker';
import { DOCUMENT_ACCEPT, DOCUMENT_ACCEPT_LABEL, DOCUMENT_FILE_TYPES, DOCUMENT_MAX_MB, TYPE_OPTIONS, VISIBILITY_OPTIONS } from './documentOptions';

/** Super Admin upload. `fixed` ({ relatedEntityType, relatedEntityId, label }) pins the record when opened from its own page. */
export default function DocumentUploadDialog({ fixed, onClose, onDone }) {
  const toast = useAdminToast();
  const [v, setV] = useState({ type: 'BOL', visibility: 'private', name: '', relatedEntityType: fixed?.relatedEntityType ?? 'shipment', relatedEntityId: fixed?.relatedEntityId ?? '' });
  const [errors, setErrors] = useState({});
  const set = (name) => (event) => setV((current) => ({ ...current, [name]: event.target.value }));
  const validateExtra = () => {
    if (!v.relatedEntityId) { setErrors({ relatedEntityId: 'Search for and choose the record this document belongs to.' }); return 'Choose the record this document belongs to.'; }
    setErrors({});
    return '';
  };
  return (
    <AdminModal open wide title="Upload a document" onClose={onClose}>
      <FileUploadForm
        label="File"
        accept={DOCUMENT_ACCEPT}
        acceptedTypes={DOCUMENT_FILE_TYPES}
        acceptLabel={DOCUMENT_ACCEPT_LABEL}
        maxMB={DOCUMENT_MAX_MB}
        submitLabel="Upload document"
        validateExtra={validateExtra}
        onUpload={async (file, onProgress) => {
          await uploadDocument(file, { type: v.type, visibility: v.visibility, relatedEntityType: v.relatedEntityType, relatedEntityId: v.relatedEntityId, name: v.name.trim() }, { onProgress });
          toast.success('Document uploaded.');
          onDone();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectInput label="Document type" value={v.type} onChange={set('type')} options={TYPE_OPTIONS} />
          <SelectInput label="Who can see it" value={v.visibility} onChange={set('visibility')} options={VISIBILITY_OPTIONS} hint="The customer and carrier are taken from the record you choose." />
        </div>
        <TextInput label="Display name (optional)" hint="Defaults to the file name." value={v.name} onChange={set('name')} maxLength={200} />
        {fixed ? <p className="text-base">Belongs to: <strong>{fixed.label}</strong></p> : <RecordPicker value={v} onChange={(changes) => setV((current) => ({ ...current, ...changes }))} errors={errors} />}
      </FileUploadForm>
    </AdminModal>
  );
}
