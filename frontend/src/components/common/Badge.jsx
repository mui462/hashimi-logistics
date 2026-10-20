import { cx } from '../../utils/cx';

const TONES = {
  neutral: 'bg-steel-100 text-ink-900',
  success: 'bg-success-50 text-success-700',
  danger: 'bg-danger-50 text-danger-700',
  info: 'bg-ink-900 text-white',
  warning: 'bg-signal-400 text-ink-950',
};

export default function Badge({ tone = 'neutral', children }) {
  return (
    <span
      className={cx(
        'inline-flex items-center whitespace-nowrap rounded-full px-3 py-0.5 text-base font-semibold',
        TONES[tone]
      )}
    >
      {children}
    </span>
  );
}
