import AdminListView from '../../components/admin/AdminListView';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import { MODULES, humanize, options } from '../../config/adminStatuses';
import { listActivity } from '../../services/adminService';
import { formatDateTime } from '../../utils/format';

const FIELDS = [
  { name: 'action', label: 'Action contains', type: 'search' },
  { name: 'module', label: 'Entity', type: 'select', options: options(MODULES) },
  { name: 'actorType', label: 'Actor', type: 'select', options: [{ value: 'super_admin', label: 'Super Admin' }, { value: 'customer', label: 'Customers' }, { value: 'carrier', label: 'Carriers' }, { value: 'system', label: 'System or signed-out' }] },
  { name: 'result', label: 'Result', type: 'select', options: [{ value: 'success', label: 'Success' }, { value: 'failure', label: 'Failure' }] },
  { name: 'from', label: 'From', type: 'date' },
  { name: 'to', label: 'To', type: 'date' },
];

// The server already strips secret-looking keys; the page never shows one even if a response carried it.
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|credential|hash|private[-_]?key/i;
const safeEntries = (metadata) => Object.entries(metadata ?? {}).filter(([key]) => !SENSITIVE_KEY.test(key));

const COLUMNS = [
  { key: 'time', header: 'Time', primary: true, render: (e) => <time dateTime={e.createdAt}>{formatDateTime(e.createdAt)}</time> },
  { key: 'actor', header: 'Actor', render: (e) => (e.actor ? <span className="block"><span className="block">{e.actor.name}</span><span className="block text-steel-600">{humanize(e.actor.role)}</span></span> : 'System or signed-out') },
  {
    key: 'action',
    header: 'Action',
    render: (e) => (
      <span className="block">
        <span className="block break-words font-semibold">{e.action}</span>
        {e.description && <span className="block break-words text-steel-600">{e.description}</span>}
        {safeEntries(e.metadata).length > 0 && (
          <details className="mt-1">
            <summary className="min-h-10 cursor-pointer py-2 text-base font-semibold underline underline-offset-4">Details</summary>
            <dl className="mt-1 space-y-1 text-base">
              {safeEntries(e.metadata).map(([key, value]) => (
                <div key={key}><dt className="inline font-semibold">{humanize(key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())}: </dt><dd className="inline break-words">{typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}</dd></div>
              ))}
            </dl>
          </details>
        )}
      </span>
    ),
  },
  { key: 'entity', header: 'Entity', render: (e) => humanize(e.module) },
  { key: 'entityId', header: 'Entity ID', render: (e) => <span className="break-all">{e.entityId ?? '—'}</span> },
  { key: 'result', header: 'Result', render: (e) => <AdminStatusBadge status={e.result} /> },
];

export default function ActivityLogsPage() {
  return (
    <AdminPage title="Activity logs" description="An append-only record of important actions. Passwords, tokens and other secrets are never recorded.">
      <AdminListView fetcher={listActivity} fields={FIELDS} columns={COLUMNS} getKey={(e) => e.id} caption="Activity logs" emptyTitle="No activity recorded yet" emptyDescription="Sign-ins and business actions are recorded here." />
    </AdminPage>
  );
}
