import { Upload } from 'lucide-react';
import { useCallback, useState } from 'react';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminListView from '../../components/admin/AdminListView';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import { EntityLink, PartnerLink, adminPath } from '../../components/admin/adminLinks';
import DocumentUploadDialog from '../../components/admin/documents/DocumentUploadDialog';
import { DOCUMENT_TYPES, RELATED_LABELS, VISIBILITY_LABELS } from '../../components/admin/documents/documentOptions';
import { customerOptions, carrierOptions } from '../../components/admin/filterOptions';
import Button from '../../components/common/Button';
import { options } from '../../config/adminStatuses';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getCmsStorage, listDocuments } from '../../services/adminService';
import { formatDate, formatFileSize } from '../../utils/format';

const FIELDS = [
  { name: 'q', label: 'Search document name', type: 'search' },
  { name: 'type', label: 'Type', type: 'select', options: DOCUMENT_TYPES.map((value) => ({ value, label: value })) },
  { name: 'status', label: 'Status', type: 'select', options: [{ value: 'uploaded', label: 'Active' }, { value: 'archived', label: 'Archived' }] },
  { name: 'visibility', label: 'Visibility', type: 'select', options: Object.entries(VISIBILITY_LABELS).map(([value, label]) => ({ value, label })) },
  { name: 'relatedEntityType', label: 'Related to', type: 'select', options: options(['quote', 'load', 'shipment', 'customer', 'carrier', 'payment']) },
  { name: 'customerId', label: 'Customer', type: 'select', optionsLoader: customerOptions },
  { name: 'carrierId', label: 'Carrier', type: 'select', optionsLoader: carrierOptions },
  { name: 'createdFrom', label: 'Uploaded from', type: 'date' },
  { name: 'createdTo', label: 'Uploaded to', type: 'date' },
];
const COLUMNS = [
  { key: 'name', header: 'Document', primary: true, render: (d) => <EntityLink touch to={adminPath('documents', d.id)}>{d.name}</EntityLink> },
  { key: 'type', header: 'Type', render: (d) => d.type },
  { key: 'related', header: 'Related to', render: (d) => (d.related?.path ? <EntityLink to={d.related.path}>{d.related.label}</EntityLink> : RELATED_LABELS[d.relatedEntityType] ?? '—') },
  { key: 'visibility', header: 'Visibility', render: (d) => VISIBILITY_LABELS[d.visibility] ?? d.visibility },
  { key: 'customer', header: 'Customer', render: (d) => <PartnerLink kind="customers" partner={d.customer} /> },
  { key: 'carrier', header: 'Carrier', render: (d) => <PartnerLink kind="carriers" partner={d.carrier} /> },
  { key: 'size', header: 'Size', render: (d) => formatFileSize(d.fileSize) },
  { key: 'status', header: 'Status', render: (d) => <AdminStatusBadge status={d.isArchived ? 'archived' : 'active'} /> },
  { key: 'uploaded', header: 'Uploaded', render: (d) => formatDate(d.createdAt) },
  { key: 'actions', header: 'Actions', render: (d) => <Button to={adminPath('documents', d.id)} variant="secondary" size="sm" aria-label={`Details for ${d.name}`}>Details</Button> },
];

export default function DocumentsPage() {
  const [version, setVersion] = useState(0);
  const [uploading, setUploading] = useState(false);
  const storage = useAsyncData(useCallback(() => getCmsStorage(), []));
  const ready = Boolean(storage.data?.uploadsAvailable);
  return (
    <AdminPage
      title="Documents"
      description="Private business documents. Files open through short-lived secure links and are never public."
      actions={<Button disabled={!ready} aria-describedby="doc-storage-status" onClick={() => setUploading(true)}><Upload aria-hidden="true" className="h-4 w-4" />Upload document</Button>}
    >
      <AdminAsyncView state={storage} label="Checking file storage" errorTitle="We could not check file storage">
        {(data) => (
          <p id="doc-storage-status" role="note" className="rounded-md border border-steel-300 bg-steel-50 p-4 text-base">
            {data.uploadsAvailable ? `File storage is ready (${data.provider}). Documents can be PDF, JPEG, PNG or WebP, up to ${data.limits?.documentMB ?? 25} MB.` : data.message}
          </p>
        )}
      </AdminAsyncView>
      <AdminListView key={version} fetcher={listDocuments} fields={FIELDS} columns={COLUMNS} getKey={(d) => d.id} caption="Documents" emptyTitle="No documents yet" emptyDescription={ready ? 'Upload a document to get started.' : 'File storage is not configured yet.'} />
      {uploading && <DocumentUploadDialog onClose={() => setUploading(false)} onDone={() => { setUploading(false); setVersion((current) => current + 1); }} />}
    </AdminPage>
  );
}
