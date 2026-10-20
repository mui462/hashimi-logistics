import { orDash } from '../../utils/format';

// Label/value pairs as a real description list. Missing values render as an em dash, never as invented text.
export default function DetailList({ items, columns = 2 }) {
  return (
    <dl className={columns === 2 ? 'grid gap-x-8 gap-y-5 sm:grid-cols-2' : 'grid gap-y-5'}>
      {items.map(({ label, value, wide }) => (
        <div key={label} className={wide ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>
          <dt className="text-base font-semibold text-steel-600">{label}</dt>
          <dd className="mt-1 text-lg [overflow-wrap:anywhere]">{typeof value === 'string' || typeof value === 'number' || value == null ? orDash(value) : value}</dd>
        </div>
      ))}
    </dl>
  );
}
