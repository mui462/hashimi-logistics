import { useCallback, useState } from 'react';
import { Plus, Upload } from 'lucide-react';
import AdminAsyncView from '../../../components/admin/AdminAsyncView';
import AdminConfirmDialog from '../../../components/admin/AdminConfirmDialog';
import AdminListView from '../../../components/admin/AdminListView';
import AdminPage from '../../../components/admin/AdminPage';
import { useAdminToast } from '../../../components/admin/AdminToast';
import AdminModal from '../../../components/admin/cms/AdminModal';
import Alert from '../../../components/common/Alert';
import Button from '../../../components/common/Button';
import SelectInput from '../../../components/forms/SelectInput';
import TextInput from '../../../components/forms/TextInput';
import { humanize } from '../../../config/adminStatuses';
import { useAdminAction } from '../../../hooks/useAdminAction';
import { useAsyncData } from '../../../hooks/useAsyncData';
import FileUploadForm from '../../../components/files/FileUploadForm';
import { addCmsMediaLink, deleteCmsMedia, getCmsStorage, listCmsMedia, replaceCmsMedia, saveCmsMedia, uploadCmsMedia } from '../../../services/adminService';
import { toFieldErrors } from '../../../utils/apiRequestError';
import { focusFirstInvalid } from '../../../utils/focus';
import { formatDate, formatFileSize } from '../../../utils/format';

const TYPES = ['image', 'video', 'document', 'other'];
const MEDIA_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm';
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'];
const acceptLabel = (limits) => `JPEG, PNG, WebP or GIF pictures (up to ${limits?.imageMB ?? 10} MB) and MP4 or WebM video (up to ${limits?.videoMB ?? 200} MB).`;
const maxFor = (file, limits) => (file?.type?.startsWith('video/') ? limits?.videoMB : limits?.imageMB);
const typeOptions = TYPES.map((value) => ({ value, label: humanize(value) }));
const FIELDS = [
  { name: 'q', label: 'Search media', type: 'search' },
  { name: 'type', label: 'Type', type: 'select', options: typeOptions },
];

function MediaDialog({ item, open, onClose, onSaved }) {
  const toast = useAdminToast();
  const isNew = !item;
  const blank = { url: '', fileName: '', type: 'image', altText: '', caption: '', folder: '' };
  const [v, setV] = useState(item ? { ...blank, fileName: item.fileName, type: item.type, altText: item.altText ?? '', caption: item.caption ?? '', folder: item.folder ?? '' } : blank);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (name) => (event) => setV((current) => ({ ...current, [name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const found = {};
    if (isNew && !v.url.trim()) found.url = 'Enter the full web address of the file.';
    if (!v.fileName.trim()) found.fileName = 'Enter a file name.';
    setErrors(found);
    if (Object.keys(found).length > 0) { setError('Fix the highlighted fields and try again.'); focusFirstInvalid(); return; }
    setBusy(true);
    setError('');
    try {
      const common = { fileName: v.fileName.trim(), altText: v.altText.trim(), caption: v.caption.trim(), ...(v.folder.trim() ? { folder: v.folder.trim() } : {}) };
      if (isNew) await addCmsMediaLink({ ...common, url: v.url.trim(), type: v.type });
      else await saveCmsMedia(item.id, common);
      toast.success(isNew ? 'Media added.' : 'Media saved.');
      onSaved();
    } catch (caught) {
      setError(caught?.message || 'That did not work. Please try again.');
      setErrors(toFieldErrors(caught?.errors));
      focusFirstInvalid();
    } finally {
      setBusy(false);
    }
  };
  return (
    <AdminModal open={open} title={isNew ? 'Add media by link' : 'Edit media details'} onClose={() => !busy && onClose()}>
      <form onSubmit={submit} noValidate className="space-y-4" aria-busy={busy || undefined}>
        {isNew && <p className="text-base text-steel-600">Use this for a file that is already hosted online. Nothing is downloaded or copied; the website links to the address you enter.</p>}
        {isNew && <TextInput label="File address" type="url" inputMode="url" value={v.url} onChange={set('url')} error={errors.url} placeholder="https://" maxLength={2048} />}
        <TextInput label="File name" value={v.fileName} onChange={set('fileName')} error={errors.fileName} maxLength={255} />
        {isNew && <SelectInput label="Type" value={v.type} onChange={set('type')} options={typeOptions} error={errors.type} />}
        <TextInput label="Alt text" hint="Describes the picture for people who cannot see it." value={v.altText} onChange={set('altText')} error={errors.altText} maxLength={200} />
        <TextInput label="Caption (optional)" value={v.caption} onChange={set('caption')} error={errors.caption} maxLength={500} />
        <TextInput label="Folder (optional)" value={v.folder} onChange={set('folder')} error={errors.folder} maxLength={120} />
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" loading={busy}>{isNew ? 'Add media' : 'Save'}</Button>
        </div>
      </form>
    </AdminModal>
  );
}

function UploadDialog({ item, limits, onClose, onDone }) {
  const replacing = Boolean(item);
  const [v, setV] = useState({ altText: '', caption: '', folder: '' });
  const set = (name) => (event) => setV((current) => ({ ...current, [name]: event.target.value }));
  const toast = useAdminToast();
  const upload = (file, onProgress) => (replacing
    ? replaceCmsMedia(item.id, file, {}, { onProgress })
    : uploadCmsMedia(file, { altText: v.altText.trim(), caption: v.caption.trim(), folder: v.folder.trim() }, { onProgress }));
  return (
    <AdminModal open title={replacing ? `Replace ${item.fileName}` : 'Upload a file'} onClose={onClose}>
      <FileUploadForm
        label={replacing ? 'New file' : 'File'}
        accept={MEDIA_ACCEPT}
        acceptedTypes={MEDIA_TYPES}
        acceptLabel={acceptLabel(limits)}
        maxMB={Math.max(limits?.imageMB ?? 10, limits?.videoMB ?? 200)}
        submitLabel={replacing ? 'Replace file' : 'Upload file'}
        onUpload={async (file, onProgress) => {
          const cap = maxFor(file, limits);
          if (cap && file.size > cap * 1024 * 1024) throw new Error(`That file is ${formatFileSize(file.size)}. The limit for this kind of file is ${cap} MB.`);
          await upload(file, onProgress);
          toast.success(replacing ? 'File replaced.' : 'File uploaded.');
          onDone();
        }}
      >
        {replacing ? (
          <p className="text-base text-steel-600">The current file is kept in storage until you decide otherwise. Pages that already link to the old address keep showing the old file; the library and any picker use the new one.</p>
        ) : (
          <>
            <TextInput label="Alt text" hint="Describes the picture for people who cannot see it." value={v.altText} onChange={set('altText')} maxLength={200} />
            <TextInput label="Caption (optional)" value={v.caption} onChange={set('caption')} maxLength={500} />
            <TextInput label="Folder (optional)" value={v.folder} onChange={set('folder')} maxLength={120} />
          </>
        )}
      </FileUploadForm>
    </AdminModal>
  );
}

export default function CmsMediaPage() {
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [target, setTarget] = useState(null);
  const storage = useAsyncData(useCallback(() => getCmsStorage(), []));
  const { run } = useAdminAction(() => setVersion((current) => current + 1));
  const uploads = Boolean(storage.data?.uploadsAvailable);
  const columns = [
    { key: 'preview', header: 'Preview', render: (m) => (m.type === 'image' ? <img src={m.url} alt={m.altText ?? ''} loading="lazy" className="h-16 w-24 rounded object-cover" /> : <span className="text-steel-600">{humanize(m.type)}{m.duration ? ` · ${Math.round(m.duration)} s` : ''}</span>) },
    { key: 'name', header: 'File', primary: true, render: (m) => <span className="break-words">{m.fileName}</span> },
    { key: 'kind', header: 'Type', render: (m) => m.mimeType ?? humanize(m.type) },
    { key: 'size', header: 'Size', render: (m) => (m.size ? formatFileSize(m.size) : '—') },
    { key: 'dims', header: 'Dimensions', render: (m) => (m.width && m.height ? `${m.width} × ${m.height}` : '—') },
    { key: 'alt', header: 'Alt text', render: (m) => m.altText || (m.type === 'image' ? 'Missing' : '—') },
    { key: 'folder', header: 'Folder', render: (m) => m.folder },
    { key: 'source', header: 'Source', render: (m) => (m.provider === 'external' ? 'Linked' : humanize(m.provider)) },
    { key: 'uploader', header: 'Uploaded by', render: (m) => m.uploaderName ?? '—' },
    { key: 'added', header: 'Added', render: (m) => formatDate(m.createdAt) },
    {
      key: 'actions', header: 'Actions',
      render: (m) => (
        <span className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" aria-label={`Edit ${m.fileName}`} onClick={() => setDialog(m)}>Edit</Button>
          {m.isStored && <Button variant="secondary" size="sm" aria-label={`Replace file ${m.fileName}`} disabled={!uploads} onClick={() => setDialog({ replace: m })}>Replace</Button>}
          <Button variant="danger" size="sm" aria-label={`Delete ${m.fileName}`} onClick={() => setTarget(m)}>Delete</Button>
        </span>
      ),
    },
  ];
  const confirm = async () => {
    const done = await run(() => deleteCmsMedia(target.id), 'Media deleted.');
    if (done) setTarget(null);
    else throw new Error('That did not work. Please try again.');
  };
  return (
    <AdminPage
      title="Media library"
      description="Pictures and videos used across the website. Files you upload are public once they are used on a page."
      actions={
        <>
          <Button variant="secondary" disabled={!uploads} aria-describedby="upload-status" onClick={() => setDialog({ upload: true })}><Upload aria-hidden="true" className="h-4 w-4" />Upload file</Button>
          <Button onClick={() => setDialog('new')}><Plus aria-hidden="true" className="h-4 w-4" />Add by link</Button>
        </>
      }
    >
      <AdminAsyncView state={storage} label="Checking media storage" errorTitle="We could not check media storage">
        {(data) => (
          <p id="upload-status" role="note" className="rounded-md border border-steel-300 bg-steel-50 p-4 text-base">
            {data.uploadsAvailable ? `File uploads are available (${humanize(data.provider)}). ${acceptLabel(data.limits)}` : `File uploads are not available. ${data.message} Until then you can add files that are already hosted online by link.`}
          </p>
        )}
      </AdminAsyncView>
      <AdminListView key={version} fetcher={listCmsMedia} fields={FIELDS} columns={columns} getKey={(m) => m.id} caption="Media" emptyTitle="No media yet" emptyDescription="Add a picture or video by link to use it on the website." />
      {dialog && typeof dialog === 'object' && (dialog.upload || dialog.replace) && <UploadDialog key={dialog.replace?.id ?? 'upload'} item={dialog.replace ?? null} limits={storage.data?.limits} onClose={() => setDialog(null)} onDone={() => { setDialog(null); setVersion((current) => current + 1); }} />}
      {dialog && !(typeof dialog === 'object' && (dialog.upload || dialog.replace)) && <MediaDialog key={dialog === 'new' ? 'new' : dialog.id} open item={dialog === 'new' ? null : dialog} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setVersion((current) => current + 1); }} />}
      <AdminConfirmDialog
        open={Boolean(target)}
        title="Do you want to delete this?"
        description={<p>{target?.fileName ? `"${target.fileName}" will be permanently deleted from the media library, the database and storage. ` : ''}This cannot be undone, and any page that still uses this picture will stop showing it.</p>}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirm}
        onCancel={() => setTarget(null)}
      />
    </AdminPage>
  );
}
