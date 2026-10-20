import { Download } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import AdminActionBar from '../../components/admin/AdminActionBar';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminConfirmDialog from '../../components/admin/AdminConfirmDialog';
import AdminPage from '../../components/admin/AdminPage';
import { useAdminToast } from '../../components/admin/AdminToast';
import { EntityLink, PartnerLink } from '../../components/admin/adminLinks';
import Button from '../../components/common/Button';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import ResponsiveTable from '../../components/customer/ResponsiveTable';
import { buildPaymentBody, FinanceBadge, InvoiceStatus, Money, newIdempotencyKey, paymentFields, RecordedNotice } from '../../components/finance/FinanceBits';
import { methodLabel } from '../../config/finance';
import { useAsyncData } from '../../hooks/useAsyncData';
import { adminInvoicePdfPath, downloadInvoicePdf, getInvoice, issueInvoice, recordInvoicePayment, reverseTransaction, voidInvoice } from '../../services/financeService';
import { formatDate, formatDateTime } from '../../utils/format';

export default function FinanceInvoiceDetailPage() {
  const { id } = useParams();
  const toast = useAdminToast();
  const state = useAsyncData(useCallback(() => getInvoice(id), [id]));
  const [busy, setBusy] = useState(false);
  const [reversing, setReversing] = useState(null);
  // One key per opened payment form: submitting twice (double click, retry after a timeout) can never record two payments.
  const keyRef = useMemo(() => ({ key: newIdempotencyKey() }), [state.data?.amountPaid, state.data?.transactions?.length]);

  const run = async (work, success) => {
    setBusy(true);
    try {
      await work();
      toast.success(success);
      state.reload();
    } catch (error) {
      toast.error(error?.message || 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const invoice = state.data;
  const actions = [];
  if (invoice?.status === 'draft') {
    actions.push({
      key: 'issue', label: 'Issue invoice', variant: 'primary',
      dialog: { title: 'Issue this invoice?', description: <p>Once issued the invoice becomes visible to the customer and can no longer be edited. To correct it later you must void it and reissue.</p>, confirmLabel: 'Issue invoice', fields: [{ name: 'dueDate', label: 'Due date (YYYY-MM-DD)', maxLength: 10, help: "Leave empty to use the customer's payment terms. If the customer has none on file you must enter a date." }] },
      onRun: async (values) => { await issueInvoice(invoice.id, values.dueDate ? { dueDate: values.dueDate } : {}); toast.success('Invoice issued.'); state.reload(); },
    });
  }
  if (['issued', 'partially_paid'].includes(invoice?.status)) {
    actions.push({
      key: 'pay', label: 'Record payment', variant: 'primary',
      dialog: { title: 'Record a payment', description: <p>This records that a payment was received. It does not collect money and is not bank-verified.</p>, confirmLabel: 'Record payment', fields: paymentFields(invoice.outstanding, invoice.currency) },
      onRun: async (values) => { const result = await recordInvoicePayment(invoice.id, buildPaymentBody(values, invoice.currency, keyRef.key)); toast.success(result.replayed ? 'That payment was already recorded.' : 'Payment recorded.'); state.reload(); },
    });
  }
  if (['draft', 'issued', 'partially_paid'].includes(invoice?.status)) {
    const hasPayments = invoice.amountPaid > 0;
    actions.push({
      key: 'void', label: 'Void invoice', variant: 'secondary', tone: 'danger', disabled: hasPayments,
      hint: hasPayments ? 'This invoice has recorded payments. Reverse them first, then void and reissue.' : undefined,
      dialog: { title: 'Void this invoice?', description: <p>A void invoice is final. It stays on record but can no longer be issued or paid.</p>, confirmLabel: 'Void invoice', fields: [{ name: 'reason', label: 'Reason', required: true, type: 'textarea', maxLength: 500 }] },
      onRun: async (values) => { await voidInvoice(invoice.id, values.reason); toast.success('Invoice voided.'); state.reload(); },
    });
  }

  const txColumns = [
    { key: 'date', header: 'Payment date', primary: true, render: (t) => formatDate(t.paymentDate, { utc: true }) },
    { key: 'entry', header: 'Entry', render: (t) => (t.entryType === 'reversal' ? 'Reversal' : 'Payment') },
    { key: 'amount', header: 'Amount', render: (t) => <Money amount={t.amount} currency={t.currency} /> },
    { key: 'method', header: 'Method / reference', render: (t) => <span className="block">{methodLabel(t.method)}<span className="block text-steel-600">{t.reference ?? 'No reference'}</span></span> },
    { key: 'status', header: 'Status', render: (t) => <span className="block"><FinanceBadge status={t.status} /><span className="mt-1 block text-steel-600">Recorded by Super Admin (manual entry, not bank-verified)</span>{t.failureNote && <span className="block text-steel-600">{t.failureNote}</span>}{t.reversalReason && <span className="block text-steel-600">Reason: {t.reversalReason}</span>}</span> },
    { key: 'recorded', header: 'Recorded', render: (t) => formatDateTime(t.recordedAt) },
    {
      key: 'actions', header: 'Actions',
      render: (t) => (t.entryType === 'payment' && t.status === 'succeeded'
        ? <Button variant="secondary" size="sm" disabled={busy} onClick={() => setReversing(t)} aria-label={`Reverse payment of ${t.amount / 100} recorded ${formatDate(t.paymentDate, { utc: true })}`}>Reverse</Button>
        : '—'),
    },
  ];

  return (
    <AdminPage title={invoice ? `Invoice ${invoice.invoiceNumber}` : 'Invoice'} trail={[{ label: 'Finance', to: '/admin/finance' }, { label: 'Customer invoices', to: '/admin/finance/invoices' }, { label: invoice?.invoiceNumber ?? 'Invoice' }]}
      actions={invoice && <Button variant="secondary" disabled={busy} onClick={() => run(() => downloadInvoicePdf(adminInvoicePdfPath(invoice.id), `${invoice.invoiceNumber}.pdf`), 'PDF downloaded.')}><Download className="size-4" aria-hidden="true" /> Download PDF</Button>}>
      <AdminAsyncView state={state} notFound="invoice" label="Loading invoice" errorTitle="We could not load this invoice" isEmpty={() => false}>
        {(inv) => (
          <div className="space-y-6">
            <Panel title="Summary" action={<InvoiceStatus invoice={inv} />}>
              <DetailList items={[
                { label: 'Customer', value: <PartnerLink kind="customers" partner={{ id: inv.customerId, companyName: inv.customerName }} /> },
                { label: 'Load', value: inv.loadId ? <EntityLink to={`/admin/loads/${inv.loadId}`}>{inv.loadNumber ?? 'Open load'}</EntityLink> : '—' },
                { label: 'Currency', value: inv.currency },
                { label: 'Issue date', value: formatDate(inv.issueDate, { utc: true }) },
                { label: 'Due date', value: formatDate(inv.dueDate, { utc: true }) },
                { label: 'Total', value: <Money amount={inv.total} currency={inv.currency} /> },
                { label: 'Paid (recorded)', value: <Money amount={inv.amountPaid} currency={inv.currency} /> },
                { label: 'Outstanding', value: <Money amount={inv.outstanding} currency={inv.currency} /> },
                ...(inv.status === 'void' ? [{ label: 'Void reason', value: inv.voidReason, wide: true }] : []),
                { label: 'Customer note', value: inv.customerNote, wide: true },
                { label: 'Internal note', value: inv.internalNotes, wide: true },
              ]} />
              <div className="mt-6"><AdminActionBar actions={actions} busy={busy} /></div>
            </Panel>
            <Panel title="Line items">
              <ResponsiveTable caption="Invoice line items" getKey={(l) => l.description + l.amount} rows={inv.lineItems} columns={[
                { key: 'd', header: 'Description', primary: true, render: (l) => l.description },
                { key: 'q', header: 'Quantity', render: (l) => l.quantity },
                { key: 'u', header: 'Unit amount', render: (l) => <Money amount={l.unitAmount} currency={inv.currency} /> },
                { key: 'a', header: 'Amount', render: (l) => <Money amount={l.amount} currency={inv.currency} /> },
              ]} />
            </Panel>
            <Panel title="Payment records" description="Entries are never edited or deleted. A mistake is corrected with a linked reversal.">
              <div className="space-y-4">
                <RecordedNotice />
                {inv.transactions.length === 0 ? <p className="text-base text-steel-600">No payments recorded.</p> : <ResponsiveTable caption="Payment records for this invoice" columns={txColumns} rows={inv.transactions} getKey={(t) => t.id} />}
              </div>
            </Panel>
            <AdminConfirmDialog
              open={Boolean(reversing)}
              title="Reverse this payment record?"
              description={<p>This adds a linked reversal entry and restores the invoice balance. The original entry is kept. This can only be done once.</p>}
              confirmLabel="Reverse payment"
              tone="danger"
              fields={[{ name: 'reason', label: 'Reason', required: true, type: 'textarea', maxLength: 500 }]}
              onCancel={() => setReversing(null)}
              onConfirm={async (values) => { await reverseTransaction(reversing.id, values.reason); toast.success('Payment record reversed.'); setReversing(null); state.reload(); }}
            />
          </div>
        )}
      </AdminAsyncView>
    </AdminPage>
  );
}
