import { Files, Info } from 'lucide-react';
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import Pagination from '../../components/customer/Pagination';
import ResponsiveTable from '../../components/customer/ResponsiveTable';
import { DOCUMENT_TYPE_LABELS } from '../../config/customerStatuses';
import { PATHS } from '../../config/paths';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import SecureFileActions from '../../components/files/SecureFileActions';
import { listDocuments, requestDocumentDownload } from '../../services/carrierService';
import { formatDate, formatFileSize, orDash } from '../../utils/format';

const C = PATHS.carrier;

const columns = (canDownload) => [
  { key: 'name', header: 'Document', primary: true, render: (d) => <Link className="inline-flex min-h-11 items-center underline underline-offset-4" to={`${C}/documents/${d.id}`}>{d.name}</Link> },
  { key: 'type', header: 'Type', render: (d) => DOCUMENT_TYPE_LABELS[d.type] ?? d.type },
  { key: 'related', header: 'Related to', render: (d) => orDash(d.relatedLabel) },
  { key: 'size', header: 'Size', render: (d) => formatFileSize(d.fileSize) },
  { key: 'added', header: 'Added', render: (d) => formatDate(d.createdAt) },
  { key: 'action', header: 'Open', render: (d) => (canDownload ? <SecureFileActions name={d.name} previewable={d.previewable} fetchAccess={(disposition) => requestDocumentDownload(d.id, disposition)} /> : <Link className="font-semibold underline underline-offset-4" to={`${C}/documents/${d.id}`}>View<span className="sr-only"> {d.name}</span></Link>) },
];

export default function DocumentsPage() {
  useDocumentTitle('Documents');
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const state = useAsyncData(useCallback(() => listDocuments({ page }), [page]));

  return (
    <div className="space-y-8">
      <PageHeader title="Documents" description="Documents shared with you, such as rate confirmations and bills of lading." />
      <AsyncView
        state={state}
        label="Loading your documents"
        errorTitle="We could not load your documents"
        isEmpty={(data) => data.items.length === 0}
        empty={
          <div className="space-y-6">
            <EmptyState icon={Files} title="No documents yet" description="Documents shared with you will appear here once they are available." />
            <UploadNotice canUpload={false} />
          </div>
        }
      >
        {(data) => (
          <div className="space-y-6">
            {!data.capabilities.download && (
              <div role="note" className="flex items-start gap-3 rounded-md border-l-4 border-ink-900 bg-steel-100 p-4 text-base">
                <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <p>Secure document download is not available yet. Your documents are listed here for reference; contact our team if you need a copy.</p>
              </div>
            )}
            <UploadNotice canUpload={data.capabilities.upload} />
            <div className="rounded-lg border border-steel-200 bg-white p-4 shadow-sm sm:p-6">
              <ResponsiveTable tableFrom="lg" caption="Your documents" columns={columns(data.capabilities.download)} rows={data.items} getKey={(d) => d.id} />
              <Pagination pagination={data.pagination} onPage={(next) => setParams(next === 1 ? {} : { page: String(next) })} />
            </div>
          </div>
        )}
      </AsyncView>
    </div>
  );
}

// Uploads happen from the shipment page, so the proof of delivery always belongs to a real shipment the carrier owns.
function UploadNotice({ canUpload }) {
  return (
    <div role="note" className="flex items-start gap-3 rounded-md border-l-4 border-ink-900 bg-steel-100 p-4 text-base">
      <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      {canUpload ? (
        <p><strong>Need to upload proof of delivery?</strong> Open the shipment from <Link className="underline underline-offset-4" to={`${C}/shipments`}>My shipments</Link> and use the proof of delivery section.</p>
      ) : (
        <p><strong>File storage is not configured yet.</strong> Proof of delivery upload is not available until it is. Until then, send your signed proof of delivery to our team directly.</p>
      )}
    </div>
  );
}
