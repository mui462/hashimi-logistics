import { AlertTriangle } from 'lucide-react';
import Button from './Button';

export default function ErrorState({
  title = 'Something went wrong',
  titleAs: Heading = 'h2',
  message = 'Please try again. If the problem continues, contact support.',
  onRetry,
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 p-8 text-center">
      <AlertTriangle className="size-10 text-danger-700" aria-hidden="true" />
      <div>
        <Heading className="text-xl font-semibold">{title}</Heading>
        <p className="mt-2 max-w-md text-base text-steel-600">{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
