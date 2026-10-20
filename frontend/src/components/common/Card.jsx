import { cx } from '../../utils/cx';

export default function Card({ as: Component = 'div', className, children, ...rest }) {
  return (
    <Component
      className={cx('rounded-lg border border-steel-200 bg-white p-6 shadow-sm sm:p-8', className)}
      {...rest}
    >
      {children}
    </Component>
  );
}
