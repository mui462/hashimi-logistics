import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cx } from '../../utils/cx';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-[var(--site-button-radius,0.375rem)] text-base font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out active:translate-y-px motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0';

const SIZES = {
  sm: 'min-h-10 px-4',
  md: 'min-h-11 px-5',
  lg: 'min-h-12 px-6 text-lg',
};

const VARIANTS = {
  light: {
    primary: 'bg-ink-900 text-white hover:bg-ink-800',
    secondary: 'border-2 border-ink-900 bg-white text-ink-900 hover:bg-steel-50',
    ghost: 'text-ink-900 hover:bg-steel-100',
    danger: 'bg-danger-700 text-white hover:bg-danger-800',
  },
  dark: {
    primary: 'bg-signal-400 text-ink-950 hover:bg-signal-500',
    secondary: 'border-2 border-white text-white hover:bg-white/10',
    ghost: 'text-white hover:bg-white/10',
    danger: 'bg-danger-700 text-white hover:bg-danger-800',
  },
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  tone = 'light',
  to,
  href,
  loading = false,
  disabled = false,
  type = 'button',
  className,
  ...rest
}) {
  const classes = cx(BASE, SIZES[size], VARIANTS[tone][variant], className);

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
