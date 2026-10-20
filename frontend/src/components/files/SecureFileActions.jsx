import { Download, Eye } from 'lucide-react';
import { useRef, useState } from 'react';
import AdminModal from '../admin/cms/AdminModal';
import Alert from '../common/Alert';
import Button from '../common/Button';

const PREVIEWABLE = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/**
 * Preview and Download for one private document. The browser never holds a permanent address: each click asks the server
 * (which checks ownership) for a link that expires in a few minutes, then uses it straight away.
 * `fetchAccess(disposition)` resolves `{ url, mimeType, fileName }`.
 */
export default function SecureFileActions({ name, available = true, previewable = true, unavailableText = 'Secure document download is not available yet.', fetchAccess, size = 'sm' }) {
  const busyRef = useRef(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  if (!available) return <span className="text-base text-steel-600">{unavailableText}</span>;

  const run = async (disposition) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(disposition);
    setError('');
    try {
      const access = await fetchAccess(disposition);
      if (disposition === 'inline') {
        setPreview(access);
      } else {
        const link = document.createElement('a');
        link.href = access.url;
        link.rel = 'noopener noreferrer';
        link.download = access.fileName ?? name;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (caught) {
      setError(caught?.message || 'We could not prepare that file. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  };

  return (
    <div className="space-y-2">
      <span className="flex flex-wrap gap-2">
        {previewable && (
          <Button variant="secondary" size={size} loading={busy === 'inline'} onClick={() => run('inline')}><Eye className="size-5" aria-hidden="true" />Preview<span className="sr-only"> {name}</span></Button>
        )}
        <Button variant="secondary" size={size} loading={busy === 'attachment'} onClick={() => run('attachment')}><Download className="size-5" aria-hidden="true" />Download<span className="sr-only"> {name}</span></Button>
      </span>
      {error && <Alert>{error}</Alert>}
      {preview && (
        <AdminModal open title={name} wide onClose={() => setPreview(null)}>
          {PREVIEWABLE.includes(preview.mimeType) && preview.mimeType !== 'application/pdf' ? (
            <img src={preview.url} alt={`Preview of ${name}`} className="mx-auto max-h-[70vh] max-w-full object-contain" />
          ) : (
            <iframe src={preview.url} title={`Preview of ${name}`} className="h-[70vh] w-full rounded border border-steel-300" />
          )}
          <p className="mt-3 text-base text-steel-600">This preview link expires in a few minutes. Close this window and open it again for a new one.</p>
        </AdminModal>
      )}
    </div>
  );
}
