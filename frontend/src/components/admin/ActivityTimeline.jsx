import { useCallback } from 'react';
import { humanize } from '../../config/adminStatuses';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listActivity } from '../../services/adminService';
import EmptyState from '../common/EmptyState';
import AdminAsyncView from './AdminAsyncView';
import AdminTimeline from './AdminTimeline';

/** The audit trail for one record (quote, load or shipment), straight from the activity log. */
export default function ActivityTimeline({ entityId, label = 'Activity timeline', refreshKey }) {
  // refreshKey changes when the parent record reloads, so a just-completed action shows up here too.
  const load = useCallback(() => listActivity({ entityId, limit: 25, order: 'desc' }).then((data) => ({ ...data, key: refreshKey })), [entityId, refreshKey]);
  const state = useAsyncData(load);
  return (
    <AdminAsyncView state={state} label="Loading activity" errorTitle="We could not load the activity" isEmpty={(data) => data.items.length === 0} empty={<EmptyState title="No activity recorded yet" description="Actions taken on this record are listed here." />}>
      {(data) => (
        <AdminTimeline
          label={label}
          items={data.items.map((entry) => ({
            id: entry.id,
            at: entry.createdAt,
            title: entry.description ?? humanize(entry.action),
            detail: `${entry.actor ? `${entry.actor.name}` : 'System'} · ${humanize(entry.action)}`,
          }))}
        />
      )}
    </AdminAsyncView>
  );
}
