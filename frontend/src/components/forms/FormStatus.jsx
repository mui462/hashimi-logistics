import { CheckCircle2 } from 'lucide-react';
import Alert from '../common/Alert';

export function FormErrorSummary({ error }) {
  return error ? <Alert tone="error">{error}</Alert> : null;
}

export function SuccessPanel({ title, children, action }) {
  return (
    <div role="status" className="border border-success-700 border-l-8 bg-success-50 p-6 sm:p-8">
      <CheckCircle2 className="size-8 text-success-700" aria-hidden="true" />
      <h2 className="mt-3 text-2xl font-extrabold text-ink-900">{title}</h2>
      <div className="mt-2 text-base text-ink-900">{children}</div>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
