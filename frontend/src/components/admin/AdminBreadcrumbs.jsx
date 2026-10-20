import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PATHS } from '../../config/paths';

// `trail`: [{ label, to? }]. The last item is the current page. "Admin" is always the first crumb.
export default function AdminBreadcrumbs({ trail = [] }) {
  const items = [{ label: 'Admin', to: PATHS.admin }, ...trail];
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-base text-steel-600">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {last || !item.to ? (
                <span aria-current={last ? 'page' : undefined} className="break-words font-semibold text-ink-900">{item.label}</span>
              ) : (
                <Link to={item.to} className="inline-flex min-h-10 items-center break-words underline underline-offset-4 hover:text-ink-900">{item.label}</Link>
              )}
              {!last && <ChevronRight className="size-4 shrink-0" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
