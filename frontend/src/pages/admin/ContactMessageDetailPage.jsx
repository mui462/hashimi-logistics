import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import Button from '../../components/common/Button';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import { humanize } from '../../config/adminStatuses';
import { useAdminAction } from '../../hooks/useAdminAction';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getContactMessage, markContactMessage } from '../../services/adminService';
import { formatDateTime } from '../../utils/format';

// One website contact message. The visitor's words are shown as plain text (never as HTML) and are never edited here.
export default function ContactMessageDetailPage() {
  const { id } = useParams();
  const state = useAsyncData(useCallback(() => getContactMessage(id), [id]));
  const { run, busy } = useAdminAction(state.reload);
  const message = state.data;
  const handled = message?.status === 'handled';
  return (
    <AdminPage
      title={message ? message.subject : 'Contact message'}
      trail={[{ label: 'Contact messages', to: '/admin/contact-messages' }, { label: message ? message.subject : 'Details' }]}
      actions={message && (
        <Button variant={handled ? 'secondary' : 'primary'} loading={busy} onClick={() => run(() => markContactMessage(id, !handled), handled ? 'Message moved back to new.' : 'Message marked handled.')}>
          {handled ? 'Mark as new' : 'Mark handled'}
        </Button>
      )}
    >
      <AdminAsyncView state={state} label="Loading message" errorTitle="We could not load this message" notFound="message">
        {(m) => (
          <div className="space-y-6">
            <Panel title="From" action={<AdminStatusBadge status={m.status} />}>
              <DetailList items={[
                { label: 'Name', value: m.name },
                { label: 'Company', value: m.company },
                { label: 'Email', value: m.email },
                { label: 'Phone', value: m.phone },
                { label: 'About', value: humanize(m.interest) },
                { label: 'Received', value: formatDateTime(m.createdAt) },
                { label: 'Handled', value: m.handledAt ? `${formatDateTime(m.handledAt)}${m.handledBy ? ` by ${m.handledBy.name}` : ''}` : 'Not yet' },
              ]} />
            </Panel>
            <Panel title="Message">
              <p className="whitespace-pre-wrap break-words text-base">{m.message}</p>
              <p className="mt-4 text-base text-steel-600">No reply is sent from here. Contact the sender by e-mail or phone, then mark the message handled.</p>
            </Panel>
          </div>
        )}
      </AdminAsyncView>
    </AdminPage>
  );
}
