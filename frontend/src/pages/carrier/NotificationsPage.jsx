import { Bell } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Alert from '../../components/common/Alert';
import NotificationPreferencesPanel from '../../components/common/NotificationPreferencesPanel';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import FilterChips from '../../components/customer/FilterChips';
import Pagination from '../../components/customer/Pagination';
import PanelLink from '../../components/customer/PanelLink';
import { NOTIFICATION_TYPE_LABELS } from '../../config/customerStatuses';
import { PATHS } from '../../config/paths';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { listNotifications, markNotificationRead } from '../../services/carrierService';
import { formatDateTime } from '../../utils/format';

const C = PATHS.carrier;
// Where a related record lives in the portal. Unknown types simply have no link.
function relatedLink(entity) {
  if (!entity) return null;
  const routes = { load: ['my-loads', 'View load'], shipment: ['shipments', 'View shipment'] };
  if (routes[entity.entityType]) return { to: `${C}/${routes[entity.entityType][0]}/${entity.entityId}`, label: routes[entity.entityType][1] };
  if (entity.entityType === 'document') return { to: `${C}/documents/${entity.entityId}`, label: 'View document' };
  if (entity.entityType === 'carrier_payable') return { to: `${C}/payables/${entity.entityId}`, label: 'View payable' };
  if (entity.entityType === 'payment') return { to: `${C}/payments`, label: 'View payments' };
  return null;
}

export default function NotificationsPage() {
  useDocumentTitle('Notifications');
  const [params, setParams] = useSearchParams();
  const unread = params.get('unread') === 'true' ? 'true' : '';
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const state = useAsyncData(useCallback(() => listNotifications({ page, ...(unread ? { unread } : {}) }), [page, unread]));
  const [pendingId, setPendingId] = useState(null);
  const [error, setError] = useState('');

  const markRead = async (id) => {
    setPendingId(id);
    setError('');
    try {
      await markNotificationRead(id);
      state.reload();
    } catch {
      setError('We could not mark that notification as read. Please try again.');
    } finally {
      setPendingId(null);
    }
  };

  const update = (next) => setParams((previous) => {
    const merged = new URLSearchParams(previous);
    Object.entries(next).forEach(([key, value]) => (value ? merged.set(key, value) : merged.delete(key)));
    return merged;
  });

  return (
    <div className="space-y-8">
      <PageHeader title="Notifications" description="Updates about your loads, shipments and payments." />
      <FilterChips label="Show" value={unread} onChange={(value) => update({ unread: value, page: '' })} options={[{ value: 'true', label: 'Unread only' }]} />
      {error && <Alert tone="error">{error}</Alert>}
      <AsyncView
        state={state}
        label="Loading your notifications"
        errorTitle="We could not load your notifications"
        isEmpty={(data) => data.items.length === 0}
        empty={<EmptyState icon={Bell} title={unread ? 'No unread notifications' : 'No notifications yet'} description={unread ? 'You’re all caught up.' : 'Updates about your loads will appear here.'} />}
      >
        {(data) => (
          <div className="rounded-lg border border-steel-200 bg-white shadow-sm">
            <p className="border-b border-steel-200 px-5 py-4 text-base font-semibold sm:px-6" role="status">
              {data.unreadCount === 0 ? 'You’re all caught up.' : `${data.unreadCount} unread`}
            </p>
            <ul className="divide-y divide-steel-200">
              {data.items.map((note) => {
                const link = relatedLink(note.relatedEntity);
                return (
                  <li key={note.id} className={note.isRead ? 'px-5 py-5 sm:px-6' : 'border-l-4 border-ink-900 bg-steel-50 px-5 py-5 sm:px-6'}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-bold">
                          {!note.isRead && <span className="mr-2 rounded bg-ink-900 px-2 py-0.5 text-base font-semibold text-white">Unread</span>}
                          {note.title}
                        </p>
                        <p className="mt-1 break-words text-base">{note.message}</p>
                        <p className="mt-1 text-base text-steel-600">{NOTIFICATION_TYPE_LABELS[note.type] ?? 'Update'} · {formatDateTime(note.createdAt)}</p>
                        {link && <p className="mt-2"><PanelLink to={link.to}>{link.label}</PanelLink></p>}
                      </div>
                      {!note.isRead && (
                        <Button variant="secondary" size="sm" loading={pendingId === note.id} onClick={() => markRead(note.id)}>
                          Mark as read<span className="sr-only">: {note.title}</span>
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="px-5 pb-5 sm:px-6"><Pagination pagination={data.pagination} onPage={(next) => update({ page: next === 1 ? '' : String(next) })} /></div>
          </div>
        )}
      </AsyncView>
      <NotificationPreferencesPanel scope="carrier" />
    </div>
  );
}
