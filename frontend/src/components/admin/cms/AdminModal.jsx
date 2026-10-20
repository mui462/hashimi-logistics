import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from '../../../utils/cx';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A content modal (media picker, schedule): focus moves in, is trapped, Escape closes, and focus returns to the opener. */
export default function AdminModal({ open, title, onClose, children, wide = false }) {
  const titleId = useId();
  const ref = useRef(null);
  const opener = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    opener.current = document.activeElement;
    const frame = requestAnimationFrame(() => ref.current?.querySelector('input, select, textarea, button:not([data-close])')?.focus() ?? ref.current?.querySelector('[data-close]')?.focus());
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      if (opener.current && document.contains(opener.current)) opener.current.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !ref.current) return;
      const nodes = [...ref.current.querySelectorAll(FOCUSABLE)];
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
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
  }, [open, onClose]);

  if (!open) return null;
  // Portaled to <body>: the picker contains its own <form>, and the modal is opened from inside the editor's <form>.
  return createPortal(
    <div onSubmit={(event) => event.stopPropagation()} className="fixed inset-0 z-[55] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink-950/60" aria-hidden="true" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={cx('relative max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white p-6 shadow-xl sm:rounded-xl', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-2xl font-bold">{title}</h2>
          <button type="button" data-close onClick={onClose} aria-label="Close" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md hover:bg-steel-100">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
