import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cx } from '../../utils/cx';

/**
 * Breadcrumb trail for nested pages: [{ label, to? }]. The last item is the current page (no link, aria-current).
 * `dark` is for use on a dark hero.
 */
export default function Breadcrumbs({ items, dark = false, className }) {
  if (!items?.length) return null;
  return (
    <nav aria-label="Breadcrumb" className={cx('mb-5', className)}>
      <ol className={cx('flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold', dark ? 'text-steel-300' : 'text-steel-600')}>
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {last || !item.to ? (
                <span aria-current={last ? 'page' : undefined} className={last ? (dark ? 'text-white' : 'text-ink-900') : undefined}>{item.label}</span>
              ) : (
                <Link to={item.to} className={cx('inline-flex min-h-8 items-center underline-offset-4 hover:underline', dark ? 'hover:text-white' : 'hover:text-ink-900')}>{item.label}</Link>
              )}
              {!last && <ChevronRight className="size-4 shrink-0 opacity-60" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
