import { Upload } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { getCmsStorage, listDocuments, requestDocumentAccess } from '../../../services/adminService';
import { formatDate } from '../../../utils/format';
import Button from '../../common/Button';
import Panel from '../../customer/Panel';
import SecureFileActions from '../../files/SecureFileActions';
import AdminAsyncView from '../AdminAsyncView';
import AdminTable from '../AdminTable';
import { EntityLink, adminPath } from '../adminLinks';
import DocumentUploadDialog from './DocumentUploadDialog';
import { VISIBILITY_LABELS } from './documentOptions';

/** Documents attached to one shipment or load, with the proof-of-delivery state and (when storage exists) an upload button. */
export default function RelatedDocumentsPanel({ entityType, entityId, label, proofOfDelivery }) {
  const [uploading, setUploading] = useState(false);
  const storage = useAsyncData(useCallback(() => getCmsStorage(), []));
  const docs = useAsyncData(useCallback(() => listDocuments({ [entityType === 'shipment' ? 'shipmentId' : 'loadId']: entityId, limit: 50 }), [entityId, entityType]));
  const ready = Boolean(storage.data?.uploadsAvailable);
  const columns = [
    { key: 'name', header: 'Document', primary: true, render: (d) => <EntityLink to={adminPath('documents', d.id)}>{d.name}</EntityLink> },
    { key: 'type', header: 'Type', render: (d) => (d.type === 'POD' && d.isPrimary ? 'POD (current)' : d.type) },
    { key: 'visibility', header: 'Visibility', render: (d) => VISIBILITY_LABELS[d.visibility] ?? d.visibility },
    { key: 'added', header: 'Added', render: (d) => formatDate(d.createdAt) },
    { key: 'open', header: 'Open', render: (d) => <SecureFileActions name={d.name} available={d.download.available} previewable={d.previewable} unavailableText="Not available" fetchAccess={(disposition) => requestDocumentAccess(d.id, disposition)} /> },
  ];
  return (
    <Panel title="Documents" action={<Button variant="secondary" size="sm" disabled={!ready} onClick={() => setUploading(true)}><Upload aria-hidden="true" className="h-4 w-4" />Upload document</Button>}>
      {entityType === 'shipment' && proofOfDelivery && (
        <p className="mb-4 text-base"><strong>Proof of delivery:</strong> {proofOfDelivery.recorded ? 'on file.' : `not on file. ${proofOfDelivery.reason ?? ''}`}</p>
      )}
      {!ready && storage.data && <p role="note" className="mb-4 text-base text-steel-600">{storage.data.message}</p>}
      <AdminAsyncView state={docs} label="Loading documents" errorTitle="We could not load the documents" isEmpty={(data) => data.items.length === 0} empty={<p className="text-base text-steel-600">No documents are attached yet.</p>}>
        {(data) => <AdminTable caption={`Documents for ${label}`} columns={columns} rows={data.items} getKey={(d) => d.id} />}
      </AdminAsyncView>
      {uploading && <DocumentUploadDialog fixed={{ relatedEntityType: entityType, relatedEntityId: entityId, label }} onClose={() => setUploading(false)} onDone={() => { setUploading(false); docs.reload(); }} />}
    </Panel>
  );
}
