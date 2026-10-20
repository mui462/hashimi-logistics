import { Loader2 } from 'lucide-react';
import { cx } from '../../utils/cx';

export default function LoadingState({ label = 'Loading', fullPage = false }) {
  return (
    <div
      role="status"
      className={cx(
        'flex flex-col items-center justify-center gap-3 p-8 text-steel-600',
        fullPage && 'min-h-screen'
      )}
    >
      <Loader2 className="size-8 animate-spin" aria-hidden="true" />
      <p className="text-base font-medium">{label}…</p>
    </div>
  );
}
