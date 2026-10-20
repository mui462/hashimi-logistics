import { Bell, CheckCircle2, Clock, PackageSearch, Search, Truck, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCarrierProfile } from '../../components/carrier/CarrierProfileContext';
import Button from '../../components/common/Button';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import Panel from '../../components/customer/Panel';
import PanelLink from '../../components/customer/PanelLink';
import StatCard from '../../components/customer/StatCard';
import StatusBadge from '../../components/customer/StatusBadge';
import { NOTIFICATION_TYPE_LABELS } from '../../config/customerStatuses';
import { PATHS } from '../../config/paths';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getDashboard } from '../../services/carrierService';
import { formatAmount, formatDateTime, formatRoute } from '../../utils/format';

const C = PATHS.carrier;

function Empty({ children }) {
  return <p className="text-base text-steel-600">{children}</p>;
}

function pendingDetail(payments) {
  if (payments.count === 0) return 'No payments waiting.';
  return payments.totals.map((total) => formatAmount(total.amount, total.currency)).join(' · ');
}

function Dashboard({ data }) {
  const { stats, loadBoard } = data;
  return (
    <div className="space-y-8">
      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Available loads" value={stats.availableLoads} to={`${C}/loads`} icon={Search} detail={loadBoard.eligible ? (stats.availableLoads === 0 ? 'No open loads right now.' : undefined) : 'Shown after your account is approved.'} />
        <StatCard label="My active loads" value={stats.myActiveLoads} to={`${C}/my-loads`} icon={Truck} detail={stats.myActiveLoads === 0 ? 'No active loads yet.' : undefined} />
        <StatCard label="Active shipments" value={stats.activeShipments} to={`${C}/shipments`} icon={Clock} detail={stats.activeShipments === 0 ? 'No active shipments yet.' : undefined} />
        <StatCard label="In transit" value={stats.inTransit} to={`${C}/shipments?status=in_transit`} icon={PackageSearch} />
        <StatCard label="Delivered" value={stats.delivered} to={`${C}/shipments?status=delivered`} icon={CheckCircle2} />
        <StatCard label="Pending payments" value={stats.pendingPayments.count === 0 ? 'None' : stats.pendingPayments.count} to={`${C}/payments`} icon={Wallet} detail={pendingDetail(stats.pendingPayments)} />
        <StatCard label="Unread notifications" value={stats.unreadNotifications} to={`${C}/notifications`} icon={Bell} detail={stats.unreadNotifications === 0 ? 'You’re all caught up.' : undefined} />
      </section>

      {!loadBoard.eligible && (
        <p role="note" className="border-l-4 border-ink-900 bg-steel-100 p-4 text-base">{loadBoard.reason}</p>
      )}

      <div className="grid gap-8 xl:grid-cols-2">
        <Panel title="My recent loads" action={<PanelLink to={`${C}/my-loads`}>View all loads</PanelLink>}>
          {data.recentLoads.length === 0 ? (
            <Empty>No loads assigned to you yet.</Empty>
          ) : (
            <ul className="divide-y divide-steel-200">
              {data.recentLoads.map((load) => (
                <li key={load.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link className="text-lg font-bold underline underline-offset-4" to={`${C}/my-loads/${load.id}`}>{load.loadNumber}</Link>
                    <p className="break-words text-base text-steel-600">{formatRoute(load.origin, load.destination)}</p>
                  </div>
                  <StatusBadge kind="load" status={load.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent shipments" action={<PanelLink to={`${C}/shipments`}>View all shipments</PanelLink>}>
          {data.recentShipments.length === 0 ? (
            <Empty>No shipments yet.</Empty>
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
            <Empty>No activity yet. Shipment updates will appear here.</Empty>
          ) : (
            <ul className="divide-y divide-steel-200">
              {data.recentActivity.map((entry, index) => (
                <li key={`${entry.entityId}-${entry.at}-${index}`} className="flex items-start gap-3 py-3">
                  <Truck className="mt-1 size-5 shrink-0 text-steel-500" aria-hidden="true" />
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
  const { profile } = useCarrierProfile();
  const firstName = profile?.account.firstName;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description={firstName ? `Welcome back, ${firstName}. Here’s where your loads stand.` : 'Here’s where your loads stand.'}
        actions={<Button to={`${C}/loads`}><Search className="size-5" aria-hidden="true" />Find loads</Button>}
      />
      <AsyncView state={state} label="Loading your dashboard" errorTitle="We could not load your dashboard">
        {(data) => <Dashboard data={data} />}
      </AsyncView>
    </div>
  );
}
