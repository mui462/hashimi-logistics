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
import { buildPaymentBody, FinanceBadge, Money, newIdempotencyKey, paymentFields, RecordedNotice } from '../../components/finance/FinanceBits';
import { methodLabel } from '../../config/finance';
import { useAsyncData } from '../../hooks/useAsyncData';
import { adjustPayable, approvePayable, getPayable, holdPayable, recordPayableOutflow, releasePayable, reverseTransaction, voidPayable } from '../../services/financeService';
import { formatDate, formatDateTime } from '../../utils/format';
import { dollarsToCents } from '../../utils/money';
import { ApiRequestError } from '../../utils/apiRequestError';

export default function FinancePayableDetailPage() {
  const { id } = useParams();
  const toast = useAdminToast();
  const state = useAsyncData(useCallback(() => getPayable(id), [id]));
  const [reversing, setReversing] = useState(null);
  const keyRef = useMemo(() => ({ key: newIdempotencyKey() }), [state.data?.amountPaid, state.data?.transactions?.length]);

  const p = state.data;
  const done = async (message) => { toast.success(message); state.reload(); };
  const actions = [];
  if (p?.status === 'draft') {
    actions.push({
      key: 'approve', label: 'Approve payable', variant: 'primary',
      dialog: { title: 'Approve this payable?', description: <p>Approval confirms the carrier is owed this amount and makes it visible to the carrier. Approval is not a payment.</p>, confirmLabel: 'Approve payable', fields: [] },
      onRun: async () => { await approvePayable(p.id); await done('Payable approved.'); },
    });
  }
  if (['approved', 'partially_paid'].includes(p?.status)) {
    actions.push({
      key: 'pay', label: 'Record payout', variant: 'primary',
      dialog: { title: 'Record a carrier payout', description: <p>This records that a payment was made to the carrier outside this system. It does not transfer funds and is not bank-verified.</p>, confirmLabel: 'Record payout', fields: paymentFields(p.outstanding, p.currency) },
      onRun: async (values) => { const result = await recordPayableOutflow(p.id, buildPaymentBody(values, p.currency, keyRef.key)); await done(result.replayed ? 'That payout was already recorded.' : 'Payout recorded.'); },
    });
    actions.push({
      key: 'hold', label: 'Put on hold',
      dialog: { title: 'Put this payable on hold?', description: <p>No payout can be recorded while it is on hold. The carrier sees only that it is on hold, not your reason.</p>, confirmLabel: 'Put on hold', fields: [{ name: 'reason', label: 'Reason', required: true, type: 'textarea', maxLength: 500 }] },
      onRun: async (values) => { await holdPayable(p.id, values.reason); await done('Payable put on hold.'); },
    });
  }
  if (p?.status === 'on_hold') {
    actions.push({ key: 'release', label: 'Release hold', variant: 'primary', onRun: async () => { try { await releasePayable(p.id); await done('Hold released.'); } catch (error) { toast.error(error?.message || 'Could not release.'); } } });
  }
  if (p && !['paid', 'void'].includes(p.status)) {
    actions.push({
      key: 'adjust', label: 'Adjust amount',
      dialog: { title: 'Adjust the payable amount', description: <p>The new amount cannot be lower than what has already been recorded as paid ({p.amountPaid / 100}). A reason is kept in the history.</p>, confirmLabel: 'Save adjustment', fields: [{ name: 'amount', label: `New amount (${p.currency})`, required: true, inputMode: 'decimal' }, { name: 'reason', label: 'Reason', required: true, type: 'textarea', maxLength: 500 }] },
      onRun: async (values) => {
        const cents = dollarsToCents(values.amount);
        if (cents == null) throw new ApiRequestError('Enter the amount as a number such as 1250.00.', { status: 422 });
        await adjustPayable(p.id, { amount: cents, reason: values.reason });
        await done('Amount adjusted.');
      },
    });
  }
  if (p && ['draft', 'approved', 'on_hold', 'partially_paid'].includes(p.status)) {
    actions.push({
      key: 'void', label: 'Void payable', tone: 'danger', disabled: p.amountPaid > 0,
      hint: p.amountPaid > 0 ? 'This payable has recorded payouts. Reverse them first.' : undefined,
      dialog: { title: 'Void this payable?', description: <p>A void payable is final. A new payable can then be created for the load.</p>, confirmLabel: 'Void payable', fields: [{ name: 'reason', label: 'Reason', required: true, type: 'textarea', maxLength: 500 }] },
      onRun: async (values) => { await voidPayable(p.id, values.reason); await done('Payable voided.'); },
    });
  }

  const txColumns = [
    { key: 'date', header: 'Payment date', primary: true, render: (t) => formatDate(t.paymentDate, { utc: true }) },
    { key: 'entry', header: 'Entry', render: (t) => (t.entryType === 'reversal' ? 'Reversal' : 'Payout') },
    { key: 'amount', header: 'Amount', render: (t) => <Money amount={t.amount} currency={t.currency} /> },
    { key: 'method', header: 'Method / reference', render: (t) => <span className="block">{methodLabel(t.method)}<span className="block text-steel-600">{t.reference ?? 'No reference'}</span></span> },
    { key: 'status', header: 'Status', render: (t) => <span className="block"><FinanceBadge status={t.status} /><span className="mt-1 block text-steel-600">Recorded by Super Admin (manual entry, not bank-verified)</span>{t.failureNote && <span className="block text-steel-600">{t.failureNote}</span>}</span> },
    { key: 'recorded', header: 'Recorded', render: (t) => formatDateTime(t.recordedAt) },
    { key: 'actions', header: 'Actions', render: (t) => (t.entryType === 'payment' && t.status === 'succeeded' ? <Button variant="secondary" size="sm" onClick={() => setReversing(t)} aria-label={`Reverse payout of ${t.amount / 100} recorded ${formatDate(t.paymentDate, { utc: true })}`}>Reverse</Button> : '—') },
  ];

  return (
    <AdminPage title={p ? `Payable ${p.payableNumber}` : 'Carrier payable'} trail={[{ label: 'Finance', to: '/admin/finance' }, { label: 'Carrier payables', to: '/admin/finance/payables' }, { label: p?.payableNumber ?? 'Payable' }]}>
      <AdminAsyncView state={state} notFound="payable" label="Loading payable" errorTitle="We could not load this payable" isEmpty={() => false}>
        {(pay) => (
          <div className="space-y-6">
            <Panel title="Summary" action={<FinanceBadge status={pay.status} />}>
              <DetailList items={[
                { label: 'Carrier', value: <PartnerLink kind="carriers" partner={{ id: pay.carrierId, companyName: pay.carrierName }} /> },
                { label: 'Load', value: pay.loadId ? <EntityLink to={`/admin/loads/${pay.loadId}`}>{pay.loadNumber ?? 'Open load'}</EntityLink> : '—' },
                { label: 'Amount owed', value: <Money amount={pay.amount} currency={pay.currency} /> },
                { label: 'Amount source', value: pay.amountSource === 'load_carrier_rate' ? 'Carrier rate saved on the load' : 'Entered by the Super Admin' },
                { label: 'Paid (recorded)', value: <Money amount={pay.amountPaid} currency={pay.currency} /> },
                { label: 'Outstanding', value: <Money amount={pay.outstanding} currency={pay.currency} /> },
                { label: 'Due date', value: formatDate(pay.dueDate, { utc: true }) },
                { label: 'Approved', value: pay.approvedAt ? formatDateTime(pay.approvedAt) : 'Not approved' },
                ...(pay.status === 'on_hold' ? [{ label: 'Hold reason (hidden from the carrier)', value: pay.holdReason, wide: true }] : []),
                ...(pay.status === 'void' ? [{ label: 'Void reason', value: pay.voidReason, wide: true }] : []),
                { label: 'Internal note', value: pay.internalNotes, wide: true },
              ]} />
              <div className="mt-6"><AdminActionBar actions={actions} /></div>
            </Panel>
            {pay.adjustments.length > 0 && (
              <Panel title="Amount adjustments">
                <ul className="divide-y divide-steel-200 text-base">
                  {pay.adjustments.map((a, i) => <li key={i} className="py-2"><Money amount={a.from} currency={pay.currency} /> to <Money amount={a.to} currency={pay.currency} /> · {a.reason} · {formatDateTime(a.at)}</li>)}
                </ul>
              </Panel>
            )}
            <Panel title="Payout records" description="Entries are never edited or deleted. A mistake is corrected with a linked reversal.">
              <div className="space-y-4">
                <RecordedNotice>Payouts are recorded manually. This system does not transfer funds, and a recorded payout is not bank-verified.</RecordedNotice>
                {pay.transactions.length === 0 ? <p className="text-base text-steel-600">No payouts recorded.</p> : <ResponsiveTable caption="Payout records for this payable" columns={txColumns} rows={pay.transactions} getKey={(t) => t.id} />}
              </div>
            </Panel>
            <AdminConfirmDialog
              open={Boolean(reversing)}
              title="Reverse this payout record?"
              description={<p>This adds a linked reversal entry and restores the payable balance. The original entry is kept. This can only be done once.</p>}
              confirmLabel="Reverse payout"
              tone="danger"
              fields={[{ name: 'reason', label: 'Reason', required: true, type: 'textarea', maxLength: 500 }]}
              onCancel={() => setReversing(null)}
              onConfirm={async (values) => { await reverseTransaction(reversing.id, values.reason); setReversing(null); await done('Payout record reversed.'); }}
            />
          </div>
        )}
      </AdminAsyncView>
    </AdminPage>
  );
}
