import { useAsyncData } from '../../hooks/useAsyncData';
import EmptyState from '../common/EmptyState';
import Panel from '../customer/Panel';
import AdminAsyncView from './AdminAsyncView';
import { Link } from 'react-router-dom';

/** A small "latest N" list on the dashboard. Each queue loads on its own, so one failing never blanks the page. */
export default function QueuePanel({ title, loader, renderItem, emptyTitle, emptyDescription, viewAllTo, viewAllLabel }) {
  // `loader` must be a stable function (declared at module level), otherwise it would reload on every render.
  const state = useAsyncData(loader);
  return (
    <Panel
      title={title}
      action={viewAllTo && <Link to={viewAllTo} className="inline-flex min-h-10 items-center text-base font-semibold underline underline-offset-4">{viewAllLabel ?? 'View all'}</Link>}
    >
      <AdminAsyncView state={state} label={`Loading ${title.toLowerCase()}`} errorTitle={`We could not load ${title.toLowerCase()}`} isEmpty={(items) => items.length === 0} empty={<EmptyState title={emptyTitle} description={emptyDescription} />}>
        {(items) => <ul className="divide-y divide-steel-200">{items.map((item) => <li key={item.id} className="py-3 first:pt-0 last:pb-0">{renderItem(item)}</li>)}</ul>}
      </AdminAsyncView>
    </Panel>
  );
}
