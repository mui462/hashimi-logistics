import { SearchX } from 'lucide-react';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import { PATHS } from '../../config/paths';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export default function CustomerNotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="space-y-8">
      <PageHeader title="Page not found" />
      <EmptyState icon={SearchX} title="That page doesn’t exist in your portal" description="Check the address, or go back to your dashboard." action={<Button to={PATHS.customer}>Go to dashboard</Button>} />
    </div>
  );
}
