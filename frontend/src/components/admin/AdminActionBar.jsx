import { useState } from 'react';
import Button from '../common/Button';
import AdminConfirmDialog from './AdminConfirmDialog';

/**
 * The buttons for what the server says can happen next. `actions` is the list the page built from `nextStatuses`
 * (one entry per allowed target the admin can trigger): { key, label, variant?, tone?, disabled?, hint?, dialog? , onRun }.
 * With a `dialog`, the button opens an accessible confirmation first and `onRun(values)` runs on confirm.
 * Without one, `onRun()` runs straight away.
 */
export default function AdminActionBar({ actions, busy, label = 'Available actions' }) {
  const [active, setActive] = useState(null);
  if (actions.length === 0) return null;
  const current = actions.find((action) => action.key === active);

  return (
    <>
      <div role="group" aria-label={label} className="flex flex-wrap gap-3">
        {actions.map((action) => (
          <Button
            key={action.key}
            variant={action.variant ?? 'secondary'}
            disabled={busy || action.disabled}
            aria-describedby={action.hint ? `hint-${action.key}` : undefined}
            onClick={() => (action.dialog ? setActive(action.key) : action.onRun())}
          >
            {action.label}
          </Button>
        ))}
      </div>
      {actions.filter((action) => action.hint).map((action) => (
        <p key={action.key} id={`hint-${action.key}`} className="mt-2 text-base text-steel-600">{action.hint}</p>
      ))}
      {current?.dialog && (
        <AdminConfirmDialog
          open
          title={current.dialog.title}
          description={current.dialog.description}
          confirmLabel={current.dialog.confirmLabel ?? current.label}
          tone={current.tone}
          fields={current.dialog.fields}
          onCancel={() => setActive(null)}
          onConfirm={async (values) => {
            await current.onRun(values);
            setActive(null);
          }}
        >
          {current.dialog.body}
        </AdminConfirmDialog>
      )}
    </>
  );
}
