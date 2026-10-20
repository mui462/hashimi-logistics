import { useCallback, useState } from 'react';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminPage from '../../components/admin/AdminPage';
import { useAdminToast } from '../../components/admin/AdminToast';
import { EntityLink } from '../../components/admin/adminLinks';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import Panel from '../../components/customer/Panel';
import StatCard from '../../components/customer/StatCard';
import { FinanceBadge, RecordedNotice } from '../../components/finance/FinanceBits';
import { methodLabel, NO_ONLINE_PAYMENT } from '../../config/finance';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getFinanceSummary, getPaymentGateway, getReconciliation } from '../../services/financeService';
import { formatAmount, formatDate, formatDateTime } from '../../utils/format';

function CurrencySection({ currency, data }) {
  const inv = data.customerInvoices;
  const rec = data.customerReceiptsRecorded;
  const pay = data.carrierPayables;
  const out = data.carrierPayoutsRecorded;
  return (
    <section aria-label={`${currency} totals`} className="space-y-6">
      <h2 className="text-2xl font-bold">{currency}</h2>
      <Panel title="Customer invoices (billed)" description="Money billed to customers. An invoice is a request for payment, not proof of payment.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Issued invoices" value={inv.issuedCount} detail={`${inv.draftCount} draft · ${inv.voidCount} void`} to="/admin/finance/invoices" />
          <StatCard label="Outstanding balance" value={formatAmount(inv.outstandingBalance, currency)} detail="Issued and partially paid invoices" />
          <StatCard label="Overdue" value={inv.overdueCount} detail={`${formatAmount(inv.overdueOutstanding, currency)} outstanding`} to="/admin/finance/invoices?status=overdue" />
          <StatCard label="Fully paid invoices" value={formatAmount(inv.paidInvoiceTotal, currency)} detail={`${inv.paidCount} invoices`} />
        </div>
      </Panel>
      <Panel title="Customer payments recorded" description="Administrative records entered by the Super Admin. Not bank-verified.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Recorded receipts" value={formatAmount(rec.recordedAmount, currency)} detail={`${rec.recordedCount} entries`} />
          <StatCard label="Reversed entries" value={rec.reversedCount} />
          <StatCard label="Failed attempts" value={rec.failedAttempts} detail="Do not change any balance" />
        </div>
      </Panel>
      <Panel title="Carrier payables (owed)" description="Amounts owed to carriers. Approval is not a payment.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Approved, still owed" value={formatAmount(pay.approvedOwedOutstanding, currency)} detail="Approved, on hold and partially paid" to="/admin/finance/payables" />
          <StatCard label="Awaiting approval" value={pay.draftCount} detail="Draft payables" />
          <StatCard label="On hold" value={pay.onHoldCount} />
          <StatCard label="Fully paid payables" value={pay.paidCount} detail={formatAmount(pay.paidPayableTotal, currency)} />
        </div>
      </Panel>
      <Panel title="Carrier payouts recorded" description="Administrative records. This system does not transfer funds.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Recorded payouts" value={formatAmount(out.recordedAmount, currency)} detail={`${out.recordedCount} entries`} />
          <StatCard label="Reversed entries" value={out.reversedCount} />
        </div>
      </Panel>
    </section>
  );
}

function ReconciliationPanel() {
  const toast = useAdminToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const run = async () => {
    setBusy(true);
    try {
      setResult(await getReconciliation());
    } catch (error) {
      toast.error(error?.message || 'Could not run the check.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Reconciliation check" description="Compares every stored invoice and payable balance with the sum of its recorded payment entries. It only reports; it never changes data." action={<Button variant="secondary" loading={busy} onClick={run}>Run check</Button>}>
      {!result && <p className="text-base text-steel-600">Not run yet.</p>}
      {result && result.consistent && <p role="status" className="text-base font-semibold text-success-700">Consistent: {result.invoices.checked} invoices and {result.payables.checked} payables checked, no differences.</p>}
      {result && !result.consistent && (
        <div role="alert" className="space-y-2">
          <p className="text-base font-semibold text-danger-700">Differences found. Investigate before recording more payments.</p>
          <ul className="list-disc pl-6 text-base">
            {[...result.invoices.mismatches, ...result.payables.mismatches].map((m) => (
              <li key={m.id}>{m.number}: stored {formatAmount(m.storedPaid, m.currency)} but entries add up to {formatAmount(m.ledgerPaid, m.currency)}</li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

export default function FinanceOverviewPage() {
  const state = useAsyncData(useCallback(() => Promise.all([getFinanceSummary(), getPaymentGateway()]).then(([summary, gateway]) => ({ summary, gateway })), []));
  return (
    <AdminPage title="Finance overview" description="Invoices, recorded payments and carrier payables, calculated from stored records. Billed amounts, recorded receipts and carrier costs are shown separately.">
      <AdminAsyncView state={state} label="Loading finance summary" errorTitle="We could not load the finance summary" isEmpty={() => false}>
        {({ summary, gateway }) => {
          const currencies = Object.keys(summary.perCurrency);
          return (
            <div className="space-y-8">
              <div className="space-y-3">
                <RecordedNotice><strong>Payment gateway: not configured.</strong> {gateway.message}</RecordedNotice>
                <RecordedNotice>{summary.basis}</RecordedNotice>
              </div>
              {currencies.length === 0 ? (
                <EmptyState title="No financial records yet" description="Create an invoice from a load or a carrier payable to see totals here." action={<Button to="/admin/finance/invoices/new">New invoice</Button>} />
              ) : (
                currencies.map((currency) => <CurrencySection key={currency} currency={currency} data={summary.perCurrency[currency]} />)
              )}
              <Panel title="Recent activity" description="The latest recorded payment entries.">
                {summary.recentActivity.length === 0 ? (
                  <p className="text-base text-steel-600">No payment entries yet.</p>
                ) : (
                  <ul className="divide-y divide-steel-200">
                    {summary.recentActivity.map((tx) => (
                      <li key={tx.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-base">
                        <span>
                          <strong>{tx.kind === 'customer_receipt' ? 'Customer receipt' : 'Carrier payout'}</strong>
                          {tx.entryType === 'reversal' ? ' (reversal)' : ''} · {formatAmount(tx.amount, tx.currency)} · {methodLabel(tx.method)}
                          <span className="block text-steel-600">{formatDate(tx.paymentDate, { utc: true })} · recorded {formatDateTime(tx.recordedAt)}</span>
                        </span>
                        <span className="inline-flex items-center gap-3">
                          <FinanceBadge status={tx.status} />
                          <EntityLink to={tx.invoiceId ? `/admin/finance/invoices/${tx.invoiceId}` : `/admin/finance/payables/${tx.payableId}`} touch>Open record</EntityLink>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <ReconciliationPanel />
              <p className="text-base text-steel-600">{NO_ONLINE_PAYMENT} No taxes, late fees or interest are calculated.</p>
            </div>
          );
        }}
      </AdminAsyncView>
    </AdminPage>
  );
}
