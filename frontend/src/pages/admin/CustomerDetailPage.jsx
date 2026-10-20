import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import { EntityLink } from '../../components/admin/adminLinks';
import Button from '../../components/common/Button';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getCustomer } from '../../services/adminService';
import { formatDate, formatDateTime, formatStop } from '../../utils/format';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const state = useAsyncData(useCallback(() => getCustomer(id), [id]));
  const customer = state.data;
  return (
    <AdminPage
      title={customer ? customer.companyName : 'Customer details'}
      trail={[{ label: 'Customers', to: '/admin/customers' }, { label: customer ? customer.companyName : 'Details' }]}
      actions={customer && (<><Button to={`/admin/quotes?customerId=${encodeURIComponent(customer.id)}`} variant="secondary">Their quotes</Button><Button to={`/admin/loads?customerId=${encodeURIComponent(customer.id)}`} variant="secondary">Their loads</Button></>)}
    >
      <AdminAsyncView state={state} label="Loading customer" errorTitle="We could not load this customer" notFound="customer">
        {(c) => (
          <div className="space-y-6">
            <Panel title="Profile" action={<AdminStatusBadge status={c.status} />}>
              <DetailList items={[
                { label: 'Company', value: c.companyName },
                { label: 'Contact', value: c.contactPerson },
                { label: 'Business email', value: c.email },
                { label: 'Phone', value: c.phone },
                { label: 'Address', value: c.address ? [c.address.street, formatStop(c.address), c.address.zipCode].filter(Boolean).join(', ') : null, wide: true },
                { label: 'Joined', value: formatDate(c.createdAt) },
              ]} />
            </Panel>
            <div className="grid gap-6 xl:grid-cols-2">
              <Panel title="Sign-in account">
                {c.account ? (
                  <DetailList items={[
                    { label: 'Login email', value: c.account.email },
                    { label: 'Account active', value: c.account.isActive ? 'Yes' : 'No' },
                    { label: 'Email confirmed', value: c.account.isEmailVerified ? 'Yes' : 'No' },
                    { label: 'Last sign-in', value: formatDateTime(c.account.lastLogin) },
                  ]} />
                ) : <p className="text-base text-steel-600">No sign-in account is linked.</p>}
              </Panel>
              <Panel title="Billing">
                {c.billing ? (
                  <DetailList items={[
                    { label: 'Billing contact', value: c.billing.contactName },
                    { label: 'Billing email', value: c.billing.email },
                    { label: 'Billing phone', value: c.billing.phone },
                    { label: 'Payment terms', value: c.billing.paymentTermsDays == null ? null : `${c.billing.paymentTermsDays} days` },
                  ]} />
                ) : <p className="text-base text-steel-600">No billing details on file.</p>}
              </Panel>
            </div>
            <Panel title="Activity">
              <DetailList items={[{ label: 'Quote requests', value: c.counts.quotes }, { label: 'Loads', value: c.counts.loads }, { label: 'Shipments', value: c.counts.shipments }]} />
              {c.recentQuotes.length > 0 && (
                <ul aria-label="Recent quotes" className="mt-4 divide-y divide-steel-200">
                  {c.recentQuotes.map((q) => (
                    <li key={q.id} className="flex flex-wrap justify-between gap-2 py-2"><EntityLink to={`/admin/quotes/${encodeURIComponent(q.id)}`}>{q.quoteNumber}</EntityLink><span className="text-base text-steel-600">{formatDate(q.createdAt)}</span></li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Internal notes"><p className="whitespace-pre-wrap break-words text-base">{c.internalNotes || 'No internal notes.'}</p></Panel>
          </div>
        )}
      </AdminAsyncView>
    </AdminPage>
  );
}
