import { MessageSquare } from 'lucide-react';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import { PATHS } from '../../config/paths';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

// There is no messaging system yet, so nothing is listed and nothing can be "sent".
export default function MessagesPage() {
  useDocumentTitle('Messages');
  return (
    <div className="space-y-8">
      <PageHeader title="Messages" description="Conversations with our team about your shipments." />
      <EmptyState
        icon={MessageSquare}
        title="No messages yet"
        description="Messaging will be available when your shipment is being coordinated. Until then, contact our team directly."
        action={<Button to={PATHS.contact} variant="secondary">Contact our team</Button>}
      />
    </div>
  );
}
