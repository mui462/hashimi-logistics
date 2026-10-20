import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import BackLink from '../../components/customer/BackLink';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import { DOCUMENT_TYPE_LABELS } from '../../config/customerStatuses';
import { PATHS } from '../../config/paths';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import SecureFileActions from '../../components/files/SecureFileActions';
import { getDocument, requestDocumentDownload } from '../../services/carrierService';
import { ApiRequestError } from '../../utils/apiRequestError';
import { formatDateTime, formatFileSize } from '../../utils/format';

const C = PATHS.carrier;

export default function DocumentDetailPage() {
  const { id } = useParams();
  const state = useAsyncData(useCallback(() => getDocument(id), [id]));
  const notFound = state.error instanceof ApiRequestError && [400, 404].includes(state.error.status);
  useDocumentTitle(state.data ? state.data.name : 'Document details');

  return (
    <div className="space-y-8">
      <BackLink to={`${C}/documents`}>Back to Documents</BackLink>
      <PageHeader title={state.data ? state.data.name : 'Document details'} />
      {notFound ? (
        <EmptyState title="Document not found" description="We could not find that document in your account." action={<Button to={`${C}/documents`}>View my documents</Button>} />
      ) : (
        <AsyncView state={state} label="Loading document" errorTitle="We could not load this document">
          {(document) => (
            <Panel title="Document details">
              <DetailList items={[
                { label: 'Name', value: document.name },
                { label: 'Type', value: DOCUMENT_TYPE_LABELS[document.type] ?? document.type },
                { label: 'Related to', value: document.relatedLabel },
                { label: 'File type', value: document.mimeType },
                { label: 'Size', value: formatFileSize(document.fileSize) },
                { label: 'Added', value: formatDateTime(document.createdAt) },
              ]} />
              <div className="mt-6 space-y-3">
                <SecureFileActions name={document.name} available={document.capabilities.download} previewable={document.previewable} size="md" fetchAccess={(disposition) => requestDocumentDownload(document.id, disposition)} />
              </div>
            </Panel>
          )}
        </AsyncView>
      )}
    </div>
  );
}
