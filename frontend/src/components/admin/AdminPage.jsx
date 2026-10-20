import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import AdminBreadcrumbs from './AdminBreadcrumbs';

// Breadcrumbs, the one h1, a description and page actions. Every admin page renders this outside any data state, so the
// heading and navigation are always present, even while loading or after an error.
export default function AdminPage({ title, trail, description, actions, children }) {
  useDocumentTitle(title);
  return (
    <div className="mx-auto max-w-[96rem] space-y-6">
      <div className="space-y-3">
        {trail !== null && <AdminBreadcrumbs trail={trail ?? [{ label: title }]} />}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 max-w-3xl">
            <h1 className="break-words text-3xl font-bold sm:text-4xl">{title}</h1>
            {description && <p className="mt-2 text-lg text-steel-600">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
        </header>
      </div>
      {children}
    </div>
  );
}
