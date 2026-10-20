import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { listCmsMedia } from '../../../services/adminService';
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

/** Pick one item from the media library. Nothing is uploaded here. */
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
      <Results type={type} q={q} page={page} onSelect={onSelect} onPage={setPage} />
    </AdminModal>
  );
}
