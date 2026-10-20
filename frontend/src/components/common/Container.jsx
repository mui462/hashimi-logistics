import { cx } from '../../utils/cx';

export default function Container({ className, children }) {
  return <div className={cx('mx-auto w-full max-w-[calc(var(--site-content-width,80rem)*var(--ui-scale,1))] px-4 sm:px-6 lg:px-8', className)}>{children}</div>;
}
