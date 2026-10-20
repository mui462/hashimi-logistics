import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function BackLink({ to, children }) {
  return (
    <Link to={to} className="inline-flex min-h-11 items-center gap-2 text-base font-semibold text-ink-900 underline underline-offset-4 hover:text-ink-700">
      <ArrowLeft className="size-5" aria-hidden="true" />
      {children}
    </Link>
  );
}
