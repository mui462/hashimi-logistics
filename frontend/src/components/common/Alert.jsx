import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cx } from '../../utils/cx';

const TONES = {
  error: { classes: 'border-danger-700 bg-danger-50 text-danger-700', Icon: AlertCircle },
  success: { classes: 'border-success-700 bg-success-50 text-success-700', Icon: CheckCircle2 },
};

export default function Alert({ tone = 'error', children }) {
  const { classes, Icon } = TONES[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('flex items-start gap-3 rounded-md border-l-4 p-4 text-base font-medium', classes)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
