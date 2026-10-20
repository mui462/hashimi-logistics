import { Construction } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import Container from './Container';
import EmptyState from './EmptyState';
import PageHeader from './PageHeader';

const DEFAULT_DESCRIPTION = 'This area is part of the planned platform and will be built in a later phase.';

export default function PlaceholderPage({ title, description = DEFAULT_DESCRIPTION, variant = 'portal' }) {
  useDocumentTitle(title);

  const content = (
    <div className="space-y-8">
      <PageHeader title={title} />
      <EmptyState icon={Construction} title="Not built yet" description={description} />
    </div>
  );

  return variant === 'public' ? <Container className="py-12 sm:py-16">{content}</Container> : content;
}
