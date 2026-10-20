import { useCallback, useState } from 'react';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminFilters from '../../components/admin/AdminFilters';
import AdminPage from '../../components/admin/AdminPage';
import AdminPagination from '../../components/admin/AdminPagination';
import AdminTable from '../../components/admin/AdminTable';
import { useAdminToast } from '../../components/admin/AdminToast';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import { humanize, options } from '../../config/adminStatuses';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useListParams } from '../../hooks/useListParams';
import { listDeliveries, retryDelivery } from '../../services/adminService';
import { formatDateTime } from '../../utils/format';

const KEYS = ['channel', 'status', 'type', 'category'];
const CHANNELS = ['EMAIL', 'SMS', 'IN_APP'];
const STATUSES = ['QUEUED', 'PROCESSING', 'RETRYING', 'SENT', 'FAILED', 'CANCELLED'];
const TYPES = ['quote', 'load', 'shipment', 'document', 'payment', 'carrier_application', 'system', 'auth'];
const CHANNEL_LABELS = { EMAIL: 'Email', SMS: 'Text message', IN_APP: 'In-app' };
const STATUS_TONES = { SENT: 'success', FAILED: 'danger', RETRYING: 'warning', QUEUED: 'warning', PROCESSING: 'warning', CANCELLED: 'neutral' };
// "Sent" only means the provider accepted the message. It is never presented as inbox or handset delivery.
const STATUS_LABELS = { SENT: 'Sent to provider', IN_APP: 'In-app' };

const FIELDS = [
  { name: 'channel', label: 'Channel', type: 'select', options: CHANNELS.map((value) => ({ value, label: CHANNEL_LABELS[value] })) },
  { name: 'status', label: 'Status', type: 'select', options: STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] ?? humanize(value.toLowerCase()) })) },
  { name: 'type', label: 'Type', type: 'select', options: options(TYPES) },
  { name: 'category', label: 'Kind', type: 'select', options: [{ value: 'notification', label: 'Notification' }, { value: 'security', label: 'Account security' }] },
];

function providerLine(label, channel) {
  return channel.configured ? `${label}: ${channel.provider}` : `${label}: not configured (nothing is sent)`;
}

export default function NotificationDeliveriesPage() {
  const { params, update, reset } = useListParams(KEYS);
  const toast = useAdminToast();
  const [pending, setPending] = useState(null);
  const state = useAsyncData(useCallback(() => listDeliveries(params), [params]));

  const retry = async (row) => {
    if (pending) return;
    setPending(row.id);
    try {
      await retryDelivery(row.id);
      toast.success('The message was queued again. The delivery worker will send it shortly.');
      state.reload();
    } catch (error) {
      toast.error(error?.message || 'Could not queue this message again.');
    } finally {
      setPending(null);
    }
  };

  const columns = [
    { key: 'time', header: 'Created', primary: true, render: (r) => <time dateTime={r.createdAt}>{formatDateTime(r.createdAt)}</time> },
    { key: 'message', header: 'Message', render: (r) => <span className="block">{CHANNEL_LABELS[r.channel] ?? r.channel}<span className="block text-steel-600">{r.category === 'security' ? 'Account security' : humanize(r.type)}</span></span> },
    { key: 'recipient', header: 'Recipient', render: (r) => <span className="block break-words"><span className="block">{r.recipient.name || 'Unknown user'}</span><span className="block text-steel-600">{humanize(r.recipient.role)}{r.recipient.email ? ` · ${r.recipient.email}` : ''}</span></span> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONES[r.status] ?? 'neutral'}>{r.channel === 'IN_APP' ? 'In-app' : (STATUS_LABELS[r.status] ?? humanize(r.status.toLowerCase()))}</Badge> },
    { key: 'provider', header: 'Provider', render: (r) => <span className="block">{r.provider ?? '—'}<span className="block text-steel-600">{r.channel === 'IN_APP' ? '' : `Attempts: ${r.attemptCount} of ${r.maxAttempts}`}</span></span> },
    { key: 'sent', header: 'Provider accepted', render: (r) => (r.sentAt ? <time dateTime={r.sentAt}>{formatDateTime(r.sentAt)}</time> : '—') },
    {
      key: 'failure',
      header: 'Failure',
      render: (r) => (
        <span className="block break-words">
          {r.lastError ?? (r.status === 'RETRYING' && r.nextAttemptAt ? `Next try ${formatDateTime(r.nextAttemptAt)}` : '—')}
          {r.failed && r.category !== 'security' && (
            <span className="mt-2 block"><Button variant="secondary" size="sm" loading={pending === r.id} onClick={() => retry(r)} aria-label={`Queue again: message created ${formatDateTime(r.createdAt)}`}>Queue again</Button></span>
          )}
        </span>
      ),
    },
  ];

  return (
    <AdminPage title="Delivery log" description="Every email and text message the system queued, with its status. “Sent to provider” means the provider accepted the message; it does not prove the recipient received it. Message text, addresses and secrets are never shown here.">
      <AdminAsyncView state={state} label="Loading deliveries" errorTitle="We could not load the delivery log" isEmpty={() => false}>
        {(data) => (
          <div className="space-y-5">
            <div className="rounded-lg border border-steel-200 bg-white p-4">
              <p className="text-base font-semibold">Providers</p>
              <p className="text-base text-steel-600">{providerLine('Email', data.providers.email)} · {providerLine('Text messages', data.providers.sms)}</p>
              <p className="mt-2 text-base text-steel-600" aria-label="Counts by status">
                {STATUSES.map((status) => `${STATUS_LABELS[status] ?? humanize(status.toLowerCase())}: ${data.counts[status] ?? 0}`).join(' · ')}
              </p>
            </div>
            <AdminFilters fields={FIELDS} values={params} onApply={(values) => update(values)} onReset={reset} />
            {data.items.length === 0 ? (
              <EmptyState title={KEYS.some((key) => params[key]) ? 'No deliveries match these filters' : 'No deliveries yet'} description="Messages appear here once a notification is queued for email or text." />
            ) : (
              <>
                <AdminTable caption="Notification deliveries" columns={columns} rows={data.items} getKey={(r) => r.id} />
                <AdminPagination pagination={data.pagination} limit={params.limit} onPage={(page) => update({ page }, { resetPage: false })} onLimit={(limit) => update({ limit })} />
              </>
            )}
          </div>
        )}
      </AdminAsyncView>
    </AdminPage>
  );
}
