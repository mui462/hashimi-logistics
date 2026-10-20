import { useRef, useState } from 'react';
import Alert from '../common/Alert';
import Button from '../common/Button';
import FileInput from '../forms/FileInput';
import { formatFileSize } from '../../utils/format';

/**
 * One-file upload with honest feedback: what is accepted, the size limit, a progress bar while sending, and a clear
 * success or failure. A second submit while one is running is ignored. The server validates the real file content;
 * the checks here only save a round trip.
 *
 * `onUpload(file, onProgress)` must resolve when the server accepted the file and throw (an ApiRequestError message is
 * shown as is) when it did not. `children` are extra fields rendered above the button.
 */
export default function FileUploadForm({ label = 'File', accept, acceptedTypes, acceptLabel, maxMB, submitLabel = 'Upload', onUpload, onDone, disabledReason, children, validateExtra }) {
  const busyRef = useRef(false);
  const [file, setFile] = useState(null);
  const [inputKey, setInputKey] = useState(0);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const pick = (files) => {
    setDone('');
    setError('');
    const next = files[0] ?? null;
    setFile(next);
    if (!next) { setFileError(''); return; }
    if (acceptedTypes && !acceptedTypes.includes(next.type)) setFileError(`That file type is not accepted. ${acceptLabel ?? ''}`.trim());
    else if (maxMB && next.size > maxMB * 1024 * 1024) setFileError(`That file is ${formatFileSize(next.size)}. The limit is ${maxMB} MB.`);
    else if (next.size === 0) setFileError('That file is empty.');
    else setFileError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (busyRef.current) return;
    setDone('');
    setError('');
    if (!file) { setFileError('Choose a file to upload.'); document.querySelector('input[type="file"][aria-invalid="true"]')?.focus(); return; }
    if (fileError) return;
    const extra = validateExtra?.();
    if (extra) { setError(extra); return; }
    busyRef.current = true;
    setBusy(true);
    setProgress(0);
    try {
      await onUpload(file, setProgress);
      setDone(`${file.name} was uploaded.`);
      setFile(null);
      setInputKey((key) => key + 1);
      onDone?.();
    } catch (caught) {
      setError(caught?.message || 'The upload did not work. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProgress(null);
    }
  };

  const hint = [acceptLabel, maxMB ? `Up to ${maxMB} MB.` : null].filter(Boolean).join(' ');
  return (
    <form onSubmit={submit} noValidate aria-busy={busy || undefined} className="space-y-4">
      {disabledReason ? <p role="note" className="rounded-md border border-steel-300 bg-steel-50 p-4 text-base">{disabledReason}</p> : (
        <>
          <FileInput key={inputKey} label={label} hint={hint} accept={accept} files={file ? [file] : []} onFilesChange={pick} error={fileError} />
          {children}
          {busy && (
            <div>
              <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? undefined} className="h-3 w-full overflow-hidden rounded-full bg-steel-200">
                <div className="h-full bg-ink-900 transition-[width]" style={{ width: `${progress ?? 5}%` }} />
              </div>
              <p className="mt-2 text-base" role="status">{progress === null ? 'Uploading…' : `Uploading… ${progress}%`}</p>
            </div>
          )}
          {error && <Alert>{error}</Alert>}
          {done && <Alert tone="success">{done}</Alert>}
          <Button type="submit" loading={busy}>{submitLabel}</Button>
        </>
      )}
    </form>
  );
}
