import { useState } from 'react';
import Alert from '../common/Alert';
import Button from '../common/Button';
import Panel from '../customer/Panel';
import PanelLink from '../customer/PanelLink';
import ResponsiveTable from '../customer/ResponsiveTable';
import SelectInput from '../forms/SelectInput';
import TextInput from '../forms/TextInput';
import { DOCUMENT_TYPE_LABELS } from '../../config/customerStatuses';
import { PATHS } from '../../config/paths';
import { requestDocumentDownload, uploadProofOfDelivery, uploadShipmentDocument } from '../../services/carrierService';
import { formatDate } from '../../utils/format';
import FileUploadForm from './FileUploadForm';
import SecureFileActions from './SecureFileActions';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';
const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const LABEL = 'PDF, JPEG, PNG or WebP.';
const MAX_MB = 25;

/** Proof of delivery and supporting documents for one of the carrier's own shipments. The server decides what is allowed. */
export default function CarrierDocumentsPanel({ shipment, onChanged }) {
  const pod = shipment.proofOfDelivery ?? { onFile: false, uploadAllowed: false, reason: 'Proof of delivery upload is not available for this shipment.' };
  const [replacing, setReplacing] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [type, setType] = useState(shipment.documentUploadTypes?.[0] ?? 'BOL');
  const [name, setName] = useState('');
  const current = (shipment.documents ?? []).find((d) => d.type === 'POD' && d.isPrimary);
  const columns = [
    { key: 'name', header: 'Document', primary: true, render: (d) => d.name },
    { key: 'type', header: 'Type', render: (d) => (d.type === 'POD' && d.isPrimary ? 'Proof of delivery (current)' : DOCUMENT_TYPE_LABELS[d.type] ?? d.type) },
    { key: 'added', header: 'Added', render: (d) => formatDate(d.createdAt) },
    { key: 'open', header: 'Open', render: (d) => <SecureFileActions name={d.name} previewable={d.previewable} fetchAccess={(disposition) => requestDocumentDownload(d.id, disposition)} /> },
  ];
  const showPodForm = pod.uploadAllowed && (!pod.onFile || replacing);

  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <Panel title="Proof of delivery" description="Upload the signed proof of delivery once the shipment is out for delivery or delivered.">
        <div className="space-y-4">
          {pod.onFile && <Alert tone="success">A proof of delivery is on file{current ? `: ${current.name}` : ''}. Our team and your customer can see it.</Alert>}
          {!pod.uploadAllowed && <p role="note" className="rounded-md border border-steel-300 bg-steel-50 p-4 text-base">{pod.reason}</p>}
          {pod.uploadAllowed && pod.onFile && !replacing && (
            <Button variant="secondary" onClick={() => setReplacing(true)}>Replace proof of delivery</Button>
          )}
          {showPodForm && (
            <FileUploadForm
              label={pod.onFile ? 'New proof of delivery' : 'Proof of delivery file'}
              accept={ACCEPT}
              acceptedTypes={TYPES}
              acceptLabel={LABEL}
              maxMB={MAX_MB}
              submitLabel={pod.onFile ? 'Replace proof of delivery' : 'Upload proof of delivery'}
              validateExtra={() => (pod.onFile && !understood ? 'Confirm that you want to replace the current proof of delivery.' : '')}
              onUpload={async (file, onProgress) => {
                await uploadProofOfDelivery(shipment.id, file, { replace: pod.onFile }, { onProgress });
                setReplacing(false);
                setUnderstood(false);
                onChanged();
              }}
            >
              {pod.onFile && (
                <label className="flex min-h-11 items-start gap-3 text-base">
                  <input type="checkbox" className="mt-1 size-5" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} />
                  <span>Replace the current proof of delivery. The previous file is archived, not deleted.</span>
                </label>
              )}
            </FileUploadForm>
          )}
        </div>
      </Panel>

      <Panel title="Documents">
        {(shipment.documents ?? []).length === 0 ? (
          <p className="text-base text-steel-600">No documents are available for this shipment yet.</p>
        ) : (
          <ResponsiveTable caption="Shipment documents" columns={columns} rows={shipment.documents ?? []} getKey={(d) => d.id} />
        )}
        <div className="mt-6 border-t border-steel-200 pt-6">
          <h3 className="mb-3 text-lg font-bold">Add a supporting document</h3>
          <FileUploadForm
            label="Document file"
            accept={ACCEPT}
            acceptedTypes={TYPES}
            acceptLabel={LABEL}
            maxMB={MAX_MB}
            submitLabel="Upload document"
            disabledReason={shipment.documentUpload?.allowed === false ? shipment.documentUpload.reason : undefined}
            onUpload={async (file, onProgress) => {
              await uploadShipmentDocument(shipment.id, file, { type, name: name.trim() || undefined }, { onProgress });
              setName('');
              onChanged();
            }}
          >
            <SelectInput label="Document type" value={type} onChange={(event) => setType(event.target.value)} options={(shipment.documentUploadTypes ?? ['BOL']).map((value) => ({ value, label: DOCUMENT_TYPE_LABELS[value] ?? value }))} />
            <TextInput label="Display name (optional)" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} />
          </FileUploadForm>
        </div>
        <p className="mt-4"><PanelLink to={`${PATHS.carrier}/documents`}>All my documents</PanelLink></p>
      </Panel>
    </div>
  );
}
