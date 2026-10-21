import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { addCmsMediaLink, getCmsStorage, listCmsMedia, uploadCmsMedia } from '../../../services/adminService';
import FileUploadForm from '../../files/FileUploadForm';
import Alert from '../../common/Alert';
import Button from '../../common/Button';
import TextInput from '../../forms/TextInput';
import AdminModal from './AdminModal';

function Results({ type, q, page, onSelect, onPage }) {
  const state = useAsyncData(useCallback(() => listCmsMedia({ type, q: q || undefined, page, limit: 12, archived: 'false' }), [type, q, page]));
  if (state.isLoading) return <p role="status" className="py-6 text-base text-steel-600">Loading media…</p>;
  if (state.error) return <Alert>{state.error.message || 'We could not load the media library.'}</Alert>;
  const { items, pagination } = state.data;
  if (items.length === 0) {
    return (
      <div className="space-y-2 py-4">
        <p className="text-base font-semibold">{q ? 'No media matches that search.' : `No ${type === 'video' ? 'videos' : 'images'} in the library yet.`}</p>
        <p className="text-base text-steel-600">Add a file by its link in the <Link to="/admin/cms/media" className="font-semibold underline">Media Library</Link>, then come back to choose it.</p>
      </div>
    );
  }
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((media) => (
          <li key={media.id}>
            <button type="button" onClick={() => onSelect(media)} className="flex h-full w-full flex-col overflow-hidden rounded-lg border-2 border-steel-200 bg-white text-left hover:border-ink-900">
              <span className="flex h-24 items-center justify-center bg-steel-100">
                {media.type === 'image' ? <img src={media.url} alt="" className="h-full w-full object-cover" /> : <span className="text-base text-steel-600">{media.type}</span>}
              </span>
              <span className="break-words p-2 text-base font-semibold">{media.fileName}</span>
            </button>
          </li>
        ))}
      </ul>
      {pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <Button variant="secondary" size="sm" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>Previous</Button>
          <span className="text-base">Page {pagination.page} of {pagination.totalPages}</span>
          <Button variant="secondary" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => onPage(pagination.page + 1)}>Next</Button>
        </div>
      )}
    </>
  );
}

const IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const fileNameFrom = (url) => decodeURIComponent(url.split('?')[0].split('/').filter(Boolean).pop() || '').slice(0, 120) || 'Picture';

/** Add a picture without leaving the picker: upload a file (when storage is set up) or register a picture hosted elsewhere by its link. The new item is chosen straight away. */
function AddNew({ type, onSelect }) {
  const storage = useAsyncData(useCallback(() => getCmsStorage(), []));
  const uploads = Boolean(storage.data?.uploadsAvailable) && type !== 'video';
  const [url, setUrl] = useState('');
  const [alt, setAlt] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const addLink = async (event) => {
    event.preventDefault();
    if (busy) return;
    const address = url.trim();
    if (!address.toLowerCase().startsWith('https://')) { setError('Enter the full web address of the picture, starting with https://'); return; }
    setBusy(true);
    setError('');
    try {
      const media = await addCmsMediaLink({ url: address, fileName: fileNameFrom(address), type, ...(alt.trim() ? { altText: alt.trim() } : {}) });
      onSelect(media);
    } catch (caught) {
      setError(caught?.message || 'That did not work. Please check the address and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="mb-4 rounded-lg border border-steel-200 p-4">
      <summary className="cursor-pointer text-base font-semibold">Add a new {type === 'video' ? 'video' : 'picture'}</summary>
      <div className="mt-4 space-y-5">
        {uploads && (
          <FileUploadForm
            label="Upload from your computer"
            accept={IMAGE_ACCEPT}
            acceptedTypes={IMAGE_TYPES}
            acceptLabel="JPEG, PNG, WebP or GIF pictures."
            maxMB={storage.data?.limits?.imageMB ?? 10}
            submitLabel="Upload and use this picture"
            onUpload={async (file, onProgress) => { onSelect(await uploadCmsMedia(file, {}, { onProgress })); }}
          />
        )}
        {!uploads && storage.data && <p className="text-base text-steel-600">File uploads are not set up on this website yet, so add the picture by its link below.</p>}
        <form onSubmit={addLink} className="space-y-3" aria-label="Add a picture by link">
          <TextInput label="Picture web address" hint="A full https:// link to a picture that is already online." value={url} onChange={(event) => setUrl(event.target.value)} maxLength={2048} />
          <TextInput label="Alt text" hint="Describes the picture for people who cannot see it." value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={200} />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" variant="secondary" disabled={busy}>{busy ? 'Adding…' : 'Add and use this picture'}</Button>
        </form>
      </div>
    </details>
  );
}

/** Pick one item from the media library, or add a new one on the spot (upload or link). */
export default function MediaPickerDialog({ open, type = 'image', onSelect, onClose }) {
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  return (
    <AdminModal open={open} title={type === 'video' ? 'Choose a video' : 'Choose an image'} onClose={onClose} wide>
      <form onSubmit={(event) => { event.preventDefault(); setQ(draft.trim().length >= 2 ? draft.trim() : ''); setPage(1); }} role="search" className="mb-4 flex items-end gap-3">
        <div className="min-w-0 flex-1"><TextInput label="Search the library" type="search" value={draft} onChange={(event) => setDraft(event.target.value)} /></div>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      {type !== 'video' && <AddNew type={type} onSelect={onSelect} />}
      <Results type={type} q={q} page={page} onSelect={onSelect} onPage={setPage} />
    </AdminModal>
  );
}
