import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import { EntityLink, PartnerLink } from '../../components/admin/adminLinks';
import DocumentEditDialog from '../../components/admin/documents/DocumentEditDialog';
import { RELATED_LABELS, VISIBILITY_LABELS } from '../../components/admin/documents/documentOptions';
import Button from '../../components/common/Button';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import SecureFileActions from '../../components/files/SecureFileActions';
import { useAdminAction } from '../../hooks/useAdminAction';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getDocument, requestDocumentAccess, runDocumentAction } from '../../services/adminService';
import { formatDateTime, formatFileSize } from '../../utils/format';

export default function DocumentDetailPage() {
  const { id } = useParams();
  const state = useAsyncData(useCallback(() => getDocument(id), [id]));
  const { run } = useAdminAction(state.reload);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const document = state.data;
  const archive = async () => {
    const done = await run(() => runDocumentAction(id, document.isArchived ? 'restore' : 'archive'), document.isArchived ? 'Document restored.' : 'Document archived.');
    if (done) setConfirm(false);
    else throw new Error('That did not work. Please try again.');
  };
  return (
    <AdminPage
      title={document ? document.name : 'Document details'}
      trail={[{ label: 'Documents', to: '/admin/documents' }, { label: document ? document.name : 'Details' }]}
      actions={document && (
        <>
          <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
          <Button variant={document.isArchived ? 'secondary' : 'danger'} onClick={() => setConfirm(true)}>{document.isArchived ? 'Restore' : 'Archive'}</Button>
        </>
      )}
    >
      <AdminAsyncView state={state} label="Loading document" errorTitle="We could not load this document" notFound="document">
        {(d) => (
          <div className="space-y-6">
            <Panel title="File" action={<AdminStatusBadge status={d.isArchived ? 'archived' : 'active'} />}>
              {d.download.available ? (
                <SecureFileActions name={d.name} previewable={d.previewable} size="md" fetchAccess={(disposition) => requestDocumentAccess(d.id, disposition)} />
              ) : (
                <p className="text-base text-steel-600">{d.download.reason}</p>
              )}
              <p className="mt-3 text-base text-steel-600">Opening a file creates a link that expires in a few minutes. Archiving hides the document from customers and carriers; the stored file is kept.</p>
            </Panel>
            <Panel title="Details">
              <DetailList items={[
                { label: 'Name', value: d.name },
                { label: 'Original file name', value: d.originalFileName },
                { label: 'Type', value: d.type },
                { label: 'Primary proof of delivery', value: d.type === 'POD' ? (d.isPrimary ? 'Yes' : 'No (replaced)') : null },
                { label: 'File type', value: d.mimeType },
                { label: 'Size', value: formatFileSize(d.fileSize) },
                { label: 'Visibility', value: VISIBILITY_LABELS[d.visibility] ?? d.visibility },
                { label: 'Related to', value: d.related?.path ? <span>{RELATED_LABELS[d.related.type]}: <EntityLink to={d.related.path}>{d.related.label}</EntityLink></span> : RELATED_LABELS[d.relatedEntityType] },
                { label: 'Customer', value: <PartnerLink kind="customers" partner={d.customer} /> },
                { label: 'Carrier', value: <PartnerLink kind="carriers" partner={d.carrier} /> },
                { label: 'Uploaded by', value: d.uploadedBy ? `${d.uploadedBy.name} (${d.uploadedBy.role?.replace(/_/g, ' ')})` : null },
                { label: 'Uploaded', value: formatDateTime(d.createdAt) },
                { label: 'Archived', value: d.archivedAt ? formatDateTime(d.archivedAt) : null },
              ]} />
            </Panel>
          </div>
        )}
      </AdminAsyncView>
      {editing && document && <DocumentEditDialog document={document} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); state.reload(); }} />}
      <AdminConfirmDialog
        open={confirm}
        title={document?.isArchived ? 'Restore this document?' : 'Archive this document?'}
        description={<p>{document?.isArchived ? 'Customers and carriers who are allowed to see it can open it again.' : 'Customers and carriers will no longer see it. The stored file is kept and you can restore it.'}</p>}
        confirmLabel={document?.isArchived ? 'Restore' : 'Archive'}
        tone={document?.isArchived ? 'primary' : 'danger'}
        onConfirm={archive}
        onCancel={() => setConfirm(false)}
      />
    </AdminPage>
  );
}
