import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import AsyncView from '../../components/customer/AsyncView';
import BackLink from '../../components/customer/BackLink';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import ResponsiveTable from '../../components/customer/ResponsiveTable';
import { FinanceBadge, Money } from '../../components/finance/FinanceBits';
import { methodLabel } from '../../config/finance';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getCarrierPayable } from '../../services/financeService';
import { ApiRequestError } from '../../utils/apiRequestError';
import { formatDate, formatDateTime } from '../../utils/format';

export default function PayableDetailPage() {
  const { id } = useParams();
  useDocumentTitle('Payable');
  const state = useAsyncData(useCallback(() => getCarrierPayable(id), [id]));

  if (state.error instanceof ApiRequestError && [400, 404].includes(state.error.status)) {
    return (
      <div className="space-y-6">
        <BackLink to="/carrier/payables">Back to payables</BackLink>
        <EmptyState title="That payable was not found" description="It may not be available to your account, or the link may be wrong." />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <BackLink to="/carrier/payables">Back to payables</BackLink>
      <AsyncView state={state} label="Loading payable" errorTitle="We could not load this payable" isEmpty={() => false}>
        {(p) => (
          <div className="space-y-8">
            <PageHeader title={`Payable ${p.payableNumber}`} description={p.loadNumber ? `For load ${p.loadNumber}` : undefined} />
            <Panel title="Summary" action={<FinanceBadge status={p.status} />}>
              <DetailList items={[
                { label: 'Approved amount', value: <Money amount={p.amount} currency={p.currency} /> },
                { label: 'Paid (recorded)', value: <Money amount={p.amountPaid} currency={p.currency} /> },
                { label: 'Outstanding', value: <Money amount={p.outstanding} currency={p.currency} /> },
                { label: 'Due date', value: formatDate(p.dueDate, { utc: true }) },
                { label: 'Approved on', value: formatDateTime(p.approvedAt) },
              ]} />
              {p.status === 'on_hold' && <p className="mt-4 text-base text-steel-600">This payable is on hold. Please contact our team for details.</p>}
            </Panel>
            <Panel title="Payment history" description="Payments recorded by our team. A recorded payment is not a bank statement.">
              {p.payments.length === 0 ? (
                <p className="text-base text-steel-600">No payments have been recorded yet.</p>
              ) : (
                <ResponsiveTable tableFrom="lg" caption="Payments recorded on this payable" getKey={(x) => x.id} rows={p.payments} columns={[
                  { key: 'date', header: 'Date', primary: true, render: (x) => formatDate(x.paymentDate, { utc: true }) },
                  { key: 'entry', header: 'Entry', render: (x) => (x.entryType === 'reversal' ? 'Payment reversal' : 'Payment') },
                  { key: 'amount', header: 'Amount', render: (x) => <Money amount={x.amount} currency={x.currency} /> },
                  { key: 'method', header: 'Method / reference', render: (x) => <span className="block">{methodLabel(x.method)}<span className="block text-steel-600">{x.reference ?? 'No reference'}</span></span> },
                  { key: 'status', header: 'Status', render: (x) => (x.status === 'reversed' ? 'Reversed' : 'Recorded') },
                ]} />
              )}
            </Panel>
          </div>
        )}
      </AsyncView>
    </div>
  );
}
