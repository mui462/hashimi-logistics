import { useId } from 'react';
import { cx } from '../../utils/cx';

// A titled section of a page. The heading is an h2 and labels the region for assistive technology.
export default function Panel({ title, action, description, children, className }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cx('rounded-lg border border-steel-200 bg-white shadow-sm', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-steel-200 px-5 py-4 sm:px-6">
        <div>
          <h2 id={id} className="text-xl font-bold">{title}</h2>
          {description && <p className="mt-1 text-base text-steel-600">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}
