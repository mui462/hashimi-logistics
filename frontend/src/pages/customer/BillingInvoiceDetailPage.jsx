import { Download } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import BackLink from '../../components/customer/BackLink';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import ResponsiveTable from '../../components/customer/ResponsiveTable';
import { InvoiceStatus, Money } from '../../components/finance/FinanceBits';
import { methodLabel, NO_ONLINE_PAYMENT } from '../../config/finance';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { customerInvoicePdfPath, downloadInvoicePdf, getBillingInvoice } from '../../services/financeService';
import { ApiRequestError } from '../../utils/apiRequestError';
import { formatDate } from '../../utils/format';

export default function BillingInvoiceDetailPage() {
  const { id } = useParams();
  useDocumentTitle('Invoice');
  const state = useAsyncData(useCallback(() => getBillingInvoice(id), [id]));
  const [pdfError, setPdfError] = useState('');
  const [busy, setBusy] = useState(false);

  if (state.error instanceof ApiRequestError && [400, 404].includes(state.error.status)) {
    return (
      <div className="space-y-6">
        <BackLink to="/customer/billing">Back to billing</BackLink>
        <EmptyState title="That invoice was not found" description="It may not be available to your account, or the link may be wrong." />
      </div>
    );
  }

  const download = async (invoice) => {
    if (busy) return;
    setBusy(true);
    setPdfError('');
    try {
      await downloadInvoicePdf(customerInvoicePdfPath(invoice.id), `${invoice.invoiceNumber}.pdf`);
    } catch (error) {
      setPdfError(error?.message || 'We could not download the PDF. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <BackLink to="/customer/billing">Back to billing</BackLink>
      <AsyncView state={state} label="Loading invoice" errorTitle="We could not load this invoice" isEmpty={() => false}>
        {(inv) => (
          <div className="space-y-8">
            <PageHeader title={`Invoice ${inv.invoiceNumber}`} description={inv.loadNumber ? `For load ${inv.loadNumber}` : undefined} />
            <Panel title="Summary" action={<InvoiceStatus invoice={inv} />}>
              <DetailList items={[
                { label: 'Issue date', value: formatDate(inv.issueDate, { utc: true }) },
                { label: 'Due date', value: formatDate(inv.dueDate, { utc: true }) },
                { label: 'Total', value: <Money amount={inv.total} currency={inv.currency} /> },
                { label: 'Paid', value: <Money amount={inv.amountPaid} currency={inv.currency} /> },
                { label: 'Outstanding', value: <Money amount={inv.outstanding} currency={inv.currency} /> },
                { label: 'Currency', value: inv.currency },
                { label: 'Note', value: inv.customerNote, wide: true },
              ]} />
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button variant="secondary" loading={busy} onClick={() => download(inv)}><Download className="size-4" aria-hidden="true" /> Download PDF</Button>
              </div>
              {pdfError && <div className="mt-4"><Alert>{pdfError}</Alert></div>}
            </Panel>
            <Panel title="Line items">
              <ResponsiveTable tableFrom="lg" caption="Invoice line items" getKey={(l) => l.description + l.amount} rows={inv.lineItems} columns={[
                { key: 'd', header: 'Description', primary: true, render: (l) => l.description },
                { key: 'q', header: 'Quantity', render: (l) => l.quantity },
                { key: 'u', header: 'Unit amount', render: (l) => <Money amount={l.unitAmount} currency={inv.currency} /> },
                { key: 'a', header: 'Amount', render: (l) => <Money amount={l.amount} currency={inv.currency} /> },
              ]} />
            </Panel>
            <Panel title="Payment history" description="Payments recorded against this invoice by our team.">
              {inv.payments.length === 0 ? (
                <p className="text-base text-steel-600">No payments have been recorded yet.</p>
              ) : (
                <ResponsiveTable tableFrom="lg" caption="Payments recorded on this invoice" getKey={(p) => p.id} rows={inv.payments} columns={[
                  { key: 'date', header: 'Date', primary: true, render: (p) => formatDate(p.paymentDate, { utc: true }) },
                  { key: 'entry', header: 'Entry', render: (p) => (p.entryType === 'reversal' ? 'Payment reversal' : 'Payment') },
                  { key: 'amount', header: 'Amount', render: (p) => <Money amount={p.amount} currency={p.currency} /> },
                  { key: 'method', header: 'Method', render: (p) => methodLabel(p.method) },
                  { key: 'status', header: 'Status', render: (p) => (p.status === 'reversed' ? 'Reversed' : 'Recorded') },
                ]} />
              )}
            </Panel>
            <p className="text-base text-steel-600">{inv.onlinePaymentAvailable ? '' : `${NO_ONLINE_PAYMENT} `}{inv.paymentInstructions ?? 'For payment arrangements, please contact our team.'}</p>
          </div>
        )}
      </AsyncView>
    </div>
  );
}
