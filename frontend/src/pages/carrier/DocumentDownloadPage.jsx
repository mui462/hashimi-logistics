import { Info } from 'lucide-react';
import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import LoadingState from '../../components/common/LoadingState';
import PageHeader from '../../components/common/PageHeader';
import { safeMessage } from '../../components/customer/AsyncView';
import BackLink from '../../components/customer/BackLink';
import { PATHS } from '../../config/paths';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { DownloadUnavailableError, requestDocumentDownload } from '../../services/carrierService';
import { ApiRequestError } from '../../utils/apiRequestError';

const C = PATHS.carrier;

// The server verifies ownership on every request. Until secure storage exists it answers "download unavailable",
// and this page says exactly that: it never shows a download link it does not have.
async function checkDownload(id) {
  try {
    return { status: 'ready', result: await requestDocumentDownload(id) };
  } catch (error) {
    if (error instanceof DownloadUnavailableError) return { status: 'unavailable' };
    if (error instanceof ApiRequestError && [400, 404].includes(error.status)) return { status: 'notfound' };
    throw error;
  }
}

export default function DocumentDownloadPage() {
  const { id } = useParams();
  useDocumentTitle('Download document');
  const state = useAsyncData(useCallback(() => checkDownload(id), [id]));
  const outcome = state.data?.status;

  return (
    <div className="space-y-8">
      <BackLink to={`${C}/documents/${id}`}>Back to document</BackLink>
      <PageHeader title="Download document" />
      {state.error && <ErrorState title="We could not prepare this download" titleAs="h2" message={safeMessage(state.error)} onRetry={state.reload} />}
      {!state.error && !state.data && <LoadingState label="Checking your download" />}
      {outcome === 'unavailable' && (
        <EmptyState icon={Info} title="Download is not available yet" titleAs="h2" description="Secure document download is not available yet. Contact our team if you need a copy of this document." action={<Button to={PATHS.contact} variant="secondary">Contact our team</Button>} />
      )}
      {outcome === 'notfound' && (
        <EmptyState title="Document not found" titleAs="h2" description="We could not find that document in your account." action={<Button to={`${C}/documents`}>View my documents</Button>} />
      )}
      {outcome === 'ready' && (
        <EmptyState title="Your download is ready" titleAs="h2" description="Your secure download request was approved. The link works for a few minutes." action={<Button href={state.data.result.url} variant="primary" rel="noopener noreferrer">Download file</Button>} />
      )}
    </div>
  );
}
