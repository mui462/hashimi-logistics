import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import AdminConfirmDialog from '../AdminConfirmDialog';

/** Warns before leaving a form with unsaved edits: in-app navigation shows a dialog, closing the tab shows the browser prompt. */
export default function UnsavedGuard({ dirty, dirtyRef }) {
  const blocker = useBlocker(() => dirtyRef.current);
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
  return (
    <AdminConfirmDialog
      open={blocker.state === 'blocked'}
      title="Leave without saving?"
      description={<p>You have changes that have not been saved. If you leave now they will be lost.</p>}
      confirmLabel="Leave without saving"
      tone="danger"
      onConfirm={async () => blocker.proceed()}
      onCancel={() => blocker.reset?.()}
    />
  );
}
