import { cx } from '../../utils/cx';

// The frame for a page's main form (quote, application, contact, tracking): rounded card, soft shadow, gold top edge.
export default function FormCard({ children, className }) {
  return (
    <div className={cx('rounded-3xl border border-t-4 border-steel-200 border-t-signal-400 bg-white p-5 shadow-[0_24px_50px_-30px_rgb(0_0_0/0.45)] sm:p-8', className)}>
      {children}
    </div>
  );
}
