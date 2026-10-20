import { useCallback, useState } from 'react';
import { Bell } from 'lucide-react';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminPage from '../../components/admin/AdminPage';
import { EntityLink } from '../../components/admin/adminLinks';
import { useAdminToast } from '../../components/admin/AdminToast';
import AdminPagination from '../../components/admin/AdminPagination';
import Badge from '../../components/common/Badge';
import NotificationPreferencesPanel from '../../components/common/NotificationPreferencesPanel';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import FilterChips from '../../components/customer/FilterChips';
import { humanize } from '../../config/adminStatuses';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useListParams } from '../../hooks/useListParams';
import * as admin from '../../services/adminService';
import { formatDateTime } from '../../utils/format';

const KEYS = ['unread'];
const ENTITY_PATHS = { quote: 'quotes', load: 'loads', shipment: 'shipments', customer: 'customers', carrier: 'carriers', payment: 'payments', document: 'documents', invoice: 'finance/invoices', carrier_payable: 'finance/payables' };

export default function NotificationsPage() {
  const { params, update } = useListParams(KEYS);
  const toast = useAdminToast();
  const [pending, setPending] = useState(null);
  const state = useAsyncData(useCallback(() => admin.listNotifications(params), [params]));

  const markRead = async (notification) => {
    if (pending) return;
    setPending(notification.id);
    try {
      await admin.markNotificationRead(notification.id);
      state.reload();
    } catch (error) {
      toast.error(error?.message || 'Could not mark the notification as read.');
    } finally {
      setPending(null);
    }
  };

  return (
    <AdminPage title="Notifications" description="In-app messages for the Super Admin. Email and text copies follow the settings at the bottom of this page.">
      <FilterChips label="Show" options={[{ value: 'true', label: 'Unread only' }]} value={params.unread ?? ''} onChange={(value) => update({ unread: value })} />
      <AdminAsyncView state={state} label="Loading notifications" errorTitle="We could not load notifications" isEmpty={(data) => data.items.length === 0} empty={<EmptyState icon={Bell} title={params.unread ? 'No unread notifications' : 'No notifications yet'} description="Activity that needs your attention appears here." />}>
        {(data) => (
          <>
            <p className="text-base text-steel-600" aria-live="polite">{data.unreadCount} unread</p>
            <ul aria-label="Notifications" className="space-y-3">
              {data.items.map((n) => {
                const path = n.relatedEntity ? ENTITY_PATHS[n.relatedEntity.entityType] : null;
                return (
                  <li key={n.id} className="rounded-lg border border-steel-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-3 text-lg font-bold">{n.title}{!n.isRead && <Badge tone="info">Unread</Badge>}</p>
                        <p className="mt-1 break-words text-base">{n.message}</p>
                        <p className="mt-1 text-base text-steel-600">{humanize(n.type)} · {formatDateTime(n.createdAt)}</p>
                        {path && <p className="mt-1"><EntityLink to={`/admin/${path}/${encodeURIComponent(n.relatedEntity.entityId)}`}>Open {humanize(n.relatedEntity.entityType).toLowerCase()}</EntityLink></p>}
                      </div>
                      {!n.isRead && <Button variant="secondary" size="sm" loading={pending === n.id} onClick={() => markRead(n)} aria-label={`Mark as read: ${n.title}`}>Mark as read</Button>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <AdminPagination pagination={data.pagination} limit={params.limit} onPage={(page) => update({ page }, { resetPage: false })} onLimit={(limit) => update({ limit })} />
          </>
        )}
      </AdminAsyncView>
      <NotificationPreferencesPanel scope="admin" />
    </AdminPage>
  );
}
