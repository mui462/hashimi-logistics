import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { cx } from '../../utils/cx';

const ToastContext = createContext(null);
const LIFETIME_MS = 7000;

// Feedback for completed actions. Messages come from the API or are written here, never from raw errors.
export function AdminToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const push = useCallback(
    (tone, message) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, tone, message }]);
      setTimeout(() => dismiss(id), LIFETIME_MS);
    },
    [dismiss]
  );

  const api = useMemo(() => ({ success: (message) => push('success', message), error: (message) => push('error', message) }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-3 sm:inset-x-auto sm:right-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-md border-l-4 bg-white p-4 text-base font-medium shadow-lg ring-1 ring-steel-200',
              toast.tone === 'error' ? 'border-danger-700 text-danger-700' : 'border-success-700 text-success-700'
            )}
          >
            {toast.tone === 'error' ? <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />}
            <p className="min-w-0 flex-1 break-words">{toast.message}</p>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss message" className="-m-2 inline-flex size-10 items-center justify-center rounded-md text-ink-900 hover:bg-steel-100">
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useAdminToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useAdminToast must be used inside AdminToastProvider.');
  return context;
}
