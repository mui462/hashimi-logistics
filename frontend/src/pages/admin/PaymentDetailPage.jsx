import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import { EntityLink, PartnerLink } from '../../components/admin/adminLinks';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import { humanize } from '../../config/adminStatuses';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getPayment } from '../../services/adminService';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format';

export default function PaymentDetailPage() {
  const { id } = useParams();
  const state = useAsyncData(useCallback(() => getPayment(id), [id]));
  const payment = state.data;
  return (
    <AdminPage title={payment ? `Payment ${payment.referenceNumber ?? ''}`.trim() : 'Payment details'} trail={[{ label: 'Payments', to: '/admin/payments' }, { label: payment?.referenceNumber ?? 'Details' }]}>
      <AdminAsyncView state={state} label="Loading payment" errorTitle="We could not load this payment" notFound="payment">
        {(p) => (
          <div className="space-y-6">
            <Panel title="Payment record" action={<AdminStatusBadge status={p.status} />}>
              <DetailList items={[
                { label: 'Type', value: humanize(p.paymentType) },
                { label: 'Amount', value: formatMoney(p.amount) },
                { label: 'Reference', value: p.referenceNumber },
                { label: 'Payment date', value: formatDate(p.paymentDate) },
                { label: 'Created', value: formatDateTime(p.createdAt) },
                { label: 'Updated', value: formatDateTime(p.updatedAt) },
                { label: 'Load', value: p.load?.loadNumber ? <EntityLink to={`/admin/loads/${encodeURIComponent(p.load.id)}`}>{p.load.loadNumber}</EntityLink> : null },
                { label: 'Customer', value: <PartnerLink kind="customers" partner={p.customer} /> },
                { label: 'Carrier', value: <PartnerLink kind="carriers" partner={p.carrier} /> },
              ]} />
            </Panel>
            <Panel title="Internal notes"><p className="whitespace-pre-wrap break-words text-base">{p.internalNotes || 'No internal notes.'}</p></Panel>
            <p className="text-base text-steel-600">This is a ledger record. No payment processor is connected.</p>
          </div>
        )}
      </AdminAsyncView>
    </AdminPage>
  );
}
