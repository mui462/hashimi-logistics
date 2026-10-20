import ErrorState from '../../components/common/ErrorState';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

export default function RouteErrorPage() {
  useDocumentTitle('Something went wrong');

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center">
      <ErrorState
        title="This page could not be displayed"
        titleAs="h1"
        message="Reload the page to try again. If the problem continues, contact support."
        onRetry={() => window.location.reload()}
      />
    </main>
  );
}
