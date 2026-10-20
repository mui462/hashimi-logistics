import { useCallback } from 'react';
import { AlertTriangle, Briefcase, FileText, PackageSearch, Truck, UserCheck, Users } from 'lucide-react';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminPage from '../../components/admin/AdminPage';
import AdminSearch from '../../components/admin/AdminSearch';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import { EntityLink, adminPath } from '../../components/admin/adminLinks';
import QueuePanel from '../../components/admin/QueuePanel';
import EmptyState from '../../components/common/EmptyState';
import Panel from '../../components/customer/Panel';
import StatCard from '../../components/customer/StatCard';
import { useAsyncData } from '../../hooks/useAsyncData';
import * as admin from '../../services/adminService';
import { formatAmount, formatDateTime, formatRoute } from '../../utils/format';
import { humanize } from '../../config/adminStatuses';

const grid = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4';

function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

const loadQueue = async () => {
  const [open, searching] = await Promise.all([
    admin.listLoads({ status: 'open', limit: 5, sort: 'createdAt', order: 'asc' }),
    admin.listLoads({ status: 'carrier_search', limit: 5, sort: 'createdAt', order: 'asc' }),
  ]);
  const unique = new Map([...open.items, ...searching.items].map((load) => [load.id, load]));
  return [...unique.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, 5);
};
const quoteQueue = () => admin.listQuotes({ limit: 5, sort: 'createdAt', order: 'desc' }).then((data) => data.items);
const shipmentQueue = () => admin.listShipments({ live: 'true', limit: 5, sort: 'updatedAt', order: 'desc' }).then((data) => data.items);
const exceptionQueue = () => admin.listShipments({ exception: 'true', limit: 5, sort: 'updatedAt', order: 'desc' }).then((data) => data.items);

export default function DashboardPage() {
  const dashboard = useAsyncData(useCallback(() => admin.getDashboard(), []));
  const partners = useAsyncData(useCallback(() => admin.getOverview(), []));

  return (
    <AdminPage title="Dashboard" trail={[{ label: 'Dashboard' }]} description="Live figures from the operations database. Nothing here is estimated.">
      <AdminSearch />

      <AdminAsyncView state={dashboard} label="Loading dashboard" errorTitle="We could not load the dashboard">
        {(data) => (
          <div className="space-y-8">
            <p className="text-base text-steel-600">Figures as of {formatDateTime(data.generatedAt)}.</p>

            <Section title="Quotes">
              <div className={grid}>
                <StatCard label="New requests" value={data.quotes.submitted} icon={FileText} to="/admin/quotes?status=new" />
                <StatCard label="Under review" value={data.quotes.underReview} icon={FileText} to="/admin/quotes?status=reviewing" />
                <StatCard label="Being priced" value={data.quotes.pricing} icon={FileText} to="/admin/quotes?status=pricing" />
                <StatCard label="Quoted" value={data.quotes.quoted} detail={data.quotes.quotedButPastExpiry ? `${data.quotes.quotedButPastExpiry} past their expiry date` : undefined} icon={FileText} to="/admin/quotes?status=quoted" />
                <StatCard label="Accepted, awaiting conversion" value={data.quotes.awaitingConversion} icon={FileText} to="/admin/quotes?status=customer_accepted" />
                <StatCard label="Converted to loads" value={data.quotes.converted_to_load} icon={FileText} to="/admin/quotes?status=converted_to_load" />
                <StatCard label="Declined by customer" value={data.quotes.declined} icon={FileText} to="/admin/quotes?status=declined" />
                <StatCard label="Expired" value={data.quotes.expired} icon={FileText} to="/admin/quotes?status=expired" />
                <StatCard label="All quotes" value={data.quotes.total} icon={FileText} to="/admin/quotes" />
              </div>
            </Section>

            <Section title="Loads">
              <div className={grid}>
                <StatCard label="Needing a carrier" value={data.loads.needingCarrier} icon={Truck} to="/admin/loads?unassigned=true" />
                <StatCard label="Overdue pickups" value={data.loads.overduePickups} icon={AlertTriangle} />
                <StatCard label="Overdue deliveries" value={data.loads.overdueDeliveries} icon={AlertTriangle} />
                <StatCard label="All loads" value={data.loads.total} icon={Truck} to="/admin/loads" />
              </div>
            </Section>

            <Section title="Shipments">
              <div className={grid}>
                <StatCard label="Live shipments" value={data.shipments.live} icon={PackageSearch} to="/admin/shipments" />
                <StatCard label="Live cross-border" value={data.shipments.crossBorderLive} icon={PackageSearch} />
                <StatCard label="Open exceptions" value={data.shipments.openExceptions} icon={AlertTriangle} to="/admin/shipments?exception=true" />
                <StatCard label="Delivered" value={data.shipments.delivered} icon={PackageSearch} to="/admin/shipments?status=delivered" />
                <StatCard label="Completed" value={data.shipments.completed} icon={PackageSearch} to="/admin/shipments?status=completed" />
              </div>
            </Section>

            <Section title="Financial snapshot">
              <Panel title="Revenue, carrier cost and margin" description="Summed from loads that have a carrier assigned, per currency, as calculated by the server.">
                {data.financials.byCurrency.length === 0 ? (
                  <EmptyState title="No financial data yet" description="Figures appear once loads have a customer rate and an assigned carrier." />
                ) : (
                  <div className="space-y-3">
                    <ul className="grid gap-4 md:grid-cols-2">
                      {data.financials.byCurrency.map((row) => (
                        <li key={row.currency} className="rounded-lg border border-steel-200 p-4">
                          <h3 className="text-lg font-bold">{row.currency} · {row.loads} {row.loads === 1 ? 'load' : 'loads'}</h3>
                          <dl className="mt-2 space-y-1 text-base">
                            <div className="flex justify-between gap-4"><dt>Customer revenue</dt><dd className="font-semibold">{formatAmount(row.customerRevenue, row.currency)}</dd></div>
                            <div className="flex justify-between gap-4"><dt>Carrier cost</dt><dd className="font-semibold">{formatAmount(row.carrierCost, row.currency)}</dd></div>
                            <div className="flex justify-between gap-4"><dt>Broker margin</dt><dd className="font-semibold">{formatAmount(row.brokerMargin, row.currency)}</dd></div>
                          </dl>
                        </li>
                      ))}
                    </ul>
                    {data.financials.truncated && <p className="text-base text-steel-600">Only the most recent loads are included in these totals.</p>}
                  </div>
                )}
              </Panel>
            </Section>

            <Section title="Recent activity">
              <Panel title="Latest operations activity">
                {data.recentActivity.length === 0 ? (
                  <EmptyState title="No activity yet" description="Actions taken on quotes, loads and shipments will be listed here." />
                ) : (
                  <ul className="divide-y divide-steel-200">
                    {data.recentActivity.map((entry, index) => (
                      <li key={`${entry.at}-${index}`} className="py-3 first:pt-0 last:pb-0">
                        <p className="break-words text-base font-semibold">{entry.description ?? humanize(entry.action)}</p>
                        <p className="text-base text-steel-600">{humanize(entry.module)} · {formatDateTime(entry.at)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </Section>
          </div>
        )}
      </AdminAsyncView>

      <Section title="Partners">
        <AdminAsyncView state={partners} label="Loading partner figures" errorTitle="We could not load partner figures">
          {(data) => (
            <div className={grid}>
              <StatCard label="Customers" value={data.customers.total} icon={Users} to="/admin/customers" />
              <StatCard label="Carriers" value={data.carriers.total} detail={`${data.carriers.pending ?? 0} pending approval`} icon={Briefcase} to="/admin/carriers" />
              <StatCard label="Carrier applications" value={data.applications.total} detail={`${data.applications.pending ?? 0} pending`} icon={UserCheck} to="/admin/carrier-applications" />
              <StatCard label="Unread notifications" value={data.unreadNotifications} to="/admin/notifications" />
            </div>
          )}
        </AdminAsyncView>
      </Section>

      <Section title="Work queues">
        <div className="grid gap-6 xl:grid-cols-2">
          <QueuePanel
            title="Recent quote requests"
            loader={quoteQueue}
            viewAllTo="/admin/quotes"
            emptyTitle="No quote requests yet"
            emptyDescription="New requests from customers appear here."
            renderItem={(quote) => (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <EntityLink to={adminPath('quotes', quote.id)}>{quote.quoteNumber}</EntityLink>
                  <p className="break-words text-base text-steel-600">{quote.customer?.companyName ?? 'Customer'} · {formatRoute(quote.origin, quote.destination)}</p>
                </div>
                <AdminStatusBadge status={quote.status} operationsStatus={quote.operationsStatus} />
              </div>
            )}
          />
          <QueuePanel
            title="Loads awaiting a carrier"
            loader={loadQueue}
            viewAllTo="/admin/loads?unassigned=true"
            emptyTitle="No loads are waiting for a carrier"
            emptyDescription="Open loads that need a carrier appear here."
            renderItem={(load) => (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <EntityLink to={`/admin/loads/${encodeURIComponent(load.id)}/matching`}>{load.loadNumber}</EntityLink>
                  <p className="break-words text-base text-steel-600">{load.customer?.companyName ?? 'Customer'} · {formatRoute(load.origin, load.destination)}</p>
                </div>
                <AdminStatusBadge status={load.status} operationsStatus={load.operationsStatus} />
              </div>
            )}
          />
          <QueuePanel
            title="Active shipments"
            loader={shipmentQueue}
            viewAllTo="/admin/shipments"
            emptyTitle="No active shipments"
            emptyDescription="Shipments that are in progress appear here."
            renderItem={(shipment) => (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <EntityLink to={adminPath('shipments', shipment.id)}>{shipment.shipmentNumber ?? shipment.trackingNumber}</EntityLink>
                  <p className="break-words text-base text-steel-600">{shipment.carrier?.companyName ?? 'Carrier'} · {formatRoute(shipment.origin, shipment.destination)}</p>
                </div>
                <AdminStatusBadge status={shipment.status} operationsStatus={shipment.operationsStatus} />
              </div>
            )}
          />
          <QueuePanel
            title="Exceptions"
            loader={exceptionQueue}
            viewAllTo="/admin/shipments?exception=true"
            emptyTitle="No open exceptions"
            emptyDescription="Shipments with an open problem appear here."
            renderItem={(shipment) => (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <EntityLink to={adminPath('shipments', shipment.id)}>{shipment.shipmentNumber ?? shipment.trackingNumber}</EntityLink>
                  <p className="break-words text-base text-steel-600">{shipment.carrier?.companyName ?? 'Carrier'} · {formatRoute(shipment.origin, shipment.destination)}</p>
                </div>
                <AdminStatusBadge status={shipment.status} operationsStatus={shipment.operationsStatus} />
              </div>
            )}
          />
        </div>
      </Section>
    </AdminPage>
  );
}
