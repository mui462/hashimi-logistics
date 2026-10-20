import { useEffect, useId, useRef, useState } from 'react';
import { ApiRequestError } from '../../utils/apiRequestError';
import Alert from '../common/Alert';
import Button from '../common/Button';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * An accessible modal confirmation (never a browser-native dialog).
 *  - `onConfirm(values)` may throw: the message (for example a 409 business conflict) is shown inside the dialog, the
 *    dialog stays open and nothing the admin typed is lost.
 *  - A second click while the request is in flight is ignored. Escape and Cancel are ignored while it runs.
 *  - Focus moves in on open, is trapped, and returns to the element that opened the dialog.
 *  - `fields`: [{ name, label, type: 'text'|'textarea'|'select', required?, options?, defaultValue?, maxLength?, help?, inputMode? }]
 */
export default function AdminConfirmDialog({ open, title, description, confirmLabel = 'Confirm', tone = 'primary', fields = [], onConfirm, onCancel, children }) {
  const titleId = useId();
  const descriptionId = useId();
  const ref = useRef(null);
  const opener = useRef(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [values, setValues] = useState({});

  useEffect(() => {
    if (!open) return undefined;
    opener.current = document.activeElement;
    setValues(Object.fromEntries(fields.map((field) => [field.name, field.defaultValue ?? ''])));
    setError('');
    setFieldErrors({});
    const frame = requestAnimationFrame(() => {
      const target = ref.current?.querySelector('input, textarea, select') ?? ref.current?.querySelector('[data-cancel]');
      target?.focus();
    });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      const element = opener.current;
      if (element && document.contains(element)) element.focus();
    };
    // Reset only when the dialog opens: re-running on every render would erase what the admin typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (!busyRef.current) onCancel();
        return;
      }
      if (event.key !== 'Tab' || !ref.current) return;
      const focusable = [...ref.current.querySelectorAll(FOCUSABLE)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onCancel]);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (busyRef.current) return;
    const missing = {};
    for (const field of fields) {
      if (field.required && !String(values[field.name] ?? '').trim()) missing[field.name] = `${field.label} is required.`;
    }
    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing);
      setTimeout(() => ref.current?.querySelector('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      await onConfirm(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])));
    } catch (caught) {
      setError(caught instanceof ApiRequestError && caught.message ? caught.message : 'That did not work. Please try again.');
      if (caught instanceof ApiRequestError && caught.errors?.length) {
        setFieldErrors(Object.fromEntries(caught.errors.filter((item) => item.field).map((item) => [item.field, item.message])));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink-950/60" aria-hidden="true" onClick={() => !busyRef.current && onCancel()} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-6 shadow-xl sm:rounded-xl"
      >
        <form onSubmit={submit} noValidate className="space-y-5" aria-busy={busy || undefined}>
          <div>
            <h2 id={titleId} className="text-2xl font-bold">{title}</h2>
            {description && <div id={descriptionId} className="mt-2 space-y-2 text-base text-steel-600">{description}</div>}
          </div>
          {children}
          {fields.map((field) => {
            const id = `${titleId}-${field.name}`;
            const errorId = `${id}-error`;
            const common = {
              id,
              name: field.name,
              value: values[field.name] ?? '',
              onChange: (event) => setValues((current) => ({ ...current, [field.name]: event.target.value })),
              'aria-invalid': fieldErrors[field.name] ? 'true' : undefined,
              'aria-describedby': [fieldErrors[field.name] ? errorId : null, field.help ? `${id}-help` : null].filter(Boolean).join(' ') || undefined,
              className: 'mt-1 block min-h-11 w-full rounded-md border-2 border-steel-300 bg-white px-3 py-2 text-base text-ink-900',
              disabled: busy,
              maxLength: field.maxLength,
            };
            return (
              <div key={field.name}>
                <label htmlFor={id} className="text-base font-semibold">{field.label}{field.required ? '' : ' (optional)'}</label>
                {field.help && <p id={`${id}-help`} className="text-base text-steel-600">{field.help}</p>}
                {field.type === 'textarea' ? (
                  <textarea rows={3} {...common} />
                ) : field.type === 'select' ? (
                  <select {...common}>
                    {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : (
                  <input type="text" inputMode={field.inputMode} autoComplete="off" {...common} />
                )}
                {fieldErrors[field.name] && <p id={errorId} className="mt-1 text-base font-medium text-danger-700">{fieldErrors[field.name]}</p>}
              </div>
            );
          })}
          {error && <Alert>{error}</Alert>}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" data-cancel onClick={onCancel} disabled={busy}>Cancel</Button>
            <Button type="submit" variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy}>{confirmLabel}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
