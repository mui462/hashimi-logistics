import { Bell, CheckCircle2, Clock, FilePlus2, FileText, PackageSearch, Receipt, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import Button from '../../components/common/Button';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import { useCustomerProfile } from '../../components/customer/CustomerProfileContext';
import Panel from '../../components/customer/Panel';
import PanelLink from '../../components/customer/PanelLink';
import StatCard from '../../components/customer/StatCard';
import StatusBadge from '../../components/customer/StatusBadge';
import { NOTIFICATION_TYPE_LABELS } from '../../config/customerStatuses';
import { PATHS } from '../../config/paths';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getDashboard } from '../../services/customerService';
import { formatAmount, formatDateTime, formatRoute } from '../../utils/format';

const C = PATHS.customer;

function Outstanding({ invoices }) {
  if (invoices.count === 0) return 'None';
  return invoices.count;
}

function outstandingDetail(invoices) {
  if (invoices.count === 0) return 'No invoices available.';
  return invoices.totals.map((total) => formatAmount(total.amount, total.currency)).join(' · ');
}

function Empty({ children }) {
  return <p className="text-base text-steel-600">{children}</p>;
}

function Dashboard({ data }) {
  const { stats } = data;
  return (
    <div className="space-y-8">
      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Active shipments" value={stats.activeShipments} to={`${C}/shipments`} icon={Truck} detail={stats.activeShipments === 0 ? 'No active shipments yet.' : undefined} />
        <StatCard label="Pending quotes" value={stats.pendingQuotes} to={`${C}/quotes`} icon={Clock} detail={stats.pendingQuotes === 0 ? 'No quote requests waiting.' : undefined} />
        <StatCard label="In transit" value={stats.inTransit} to={`${C}/shipments?status=in_transit`} icon={PackageSearch} />
        <StatCard label="Delivered" value={stats.delivered} to={`${C}/shipments?status=delivered`} icon={CheckCircle2} />
        <StatCard label="Outstanding invoices" value={<Outstanding invoices={stats.outstandingInvoices} />} to={`${C}/invoices`} icon={Receipt} detail={outstandingDetail(stats.outstandingInvoices)} />
        <StatCard label="Unread notifications" value={stats.unreadNotifications} to={`${C}/notifications`} icon={Bell} detail={stats.unreadNotifications === 0 ? 'You’re all caught up.' : undefined} />
      </section>

      <div className="grid gap-8 xl:grid-cols-2">
        <Panel title="Recent quotes" action={<PanelLink to={`${C}/quotes`}>View all quotes</PanelLink>}>
          {data.recentQuotes.length === 0 ? (
            <div className="space-y-4">
              <Empty>No quote requests yet.</Empty>
              <Button to={`${C}/quotes/new`} variant="secondary"><FilePlus2 className="size-5" aria-hidden="true" />Request a quote</Button>
            </div>
          ) : (
            <ul className="divide-y divide-steel-200">
              {data.recentQuotes.map((quote) => (
                <li key={quote.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link className="text-lg font-bold underline underline-offset-4" to={`${C}/quotes/${quote.id}`}>{quote.quoteNumber}</Link>
                    <p className="break-words text-base text-steel-600">{formatRoute(quote.origin, quote.destination)}</p>
                  </div>
                  <StatusBadge kind="quote" status={quote.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent shipments" action={<PanelLink to={`${C}/shipments`}>View all shipments</PanelLink>}>
          {data.recentShipments.length === 0 ? (
            <Empty>No active shipments yet.</Empty>
          ) : (
            <ul className="divide-y divide-steel-200">
              {data.recentShipments.map((shipment) => (
                <li key={shipment.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link className="text-lg font-bold underline underline-offset-4" to={`${C}/shipments/${shipment.id}`}>{shipment.trackingNumber}</Link>
                    <p className="break-words text-base text-steel-600">{formatRoute(shipment.origin, shipment.destination)}</p>
                  </div>
                  <StatusBadge kind="shipment" status={shipment.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Notifications" action={<PanelLink to={`${C}/notifications`}>View all notifications</PanelLink>}>
          {data.recentNotifications.length === 0 ? (
            <Empty>You’re all caught up.</Empty>
          ) : (
            <ul className="divide-y divide-steel-200">
              {data.recentNotifications.map((note) => (
                <li key={note.id} className="py-3">
                  <p className="text-lg font-bold">
                    {!note.isRead && <span className="mr-2 inline-block rounded bg-ink-900 px-2 text-base font-semibold text-white">New</span>}
                    {note.title}
                  </p>
                  <p className="break-words text-base text-steel-600">{note.message}</p>
                  <p className="text-base text-steel-600">{NOTIFICATION_TYPE_LABELS[note.type] ?? 'Update'} · {formatDateTime(note.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent activity">
          {data.recentActivity.length === 0 ? (
            <Empty>No activity yet. Quote requests and shipment updates will appear here.</Empty>
          ) : (
            <ul className="divide-y divide-steel-200">
              {data.recentActivity.map((entry, index) => (
                <li key={`${entry.entityId}-${entry.at}-${index}`} className="flex items-start gap-3 py-3">
                  {entry.kind === 'quote' ? <FileText className="mt-1 size-5 shrink-0 text-steel-500" aria-hidden="true" /> : <Truck className="mt-1 size-5 shrink-0 text-steel-500" aria-hidden="true" />}
                  <div>
                    <p className="break-words text-base font-semibold">{entry.title}</p>
                    <p className="text-base text-steel-600">{formatDateTime(entry.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const state = useAsyncData(getDashboard);
  const { profile } = useCustomerProfile();
  const firstName = profile?.account.firstName;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description={firstName ? `Welcome back, ${firstName}. Here’s where your freight stands.` : 'Here’s where your freight stands.'}
        actions={<Button to={`${C}/quotes/new`}><FilePlus2 className="size-5" aria-hidden="true" />Request a quote</Button>}
      />
      <AsyncView state={state} label="Loading your dashboard" errorTitle="We could not load your dashboard">
        {(data) => <Dashboard data={data} />}
      </AsyncView>
    </div>
  );
}
