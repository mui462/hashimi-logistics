import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import Card from '../common/Card';

export default function AuthPageShell({ title, description, footer, children }) {
  useDocumentTitle(title);

  return (
    <Card className="w-full max-w-xl">
      <h1 className="text-3xl font-bold">{title}</h1>
      {description && <p className="mt-3 text-lg text-steel-600">{description}</p>}
      <div className="mt-8">{children}</div>
      {footer && <div className="mt-8 border-t border-steel-200 pt-6 text-base">{footer}</div>}
    </Card>
  );
}
