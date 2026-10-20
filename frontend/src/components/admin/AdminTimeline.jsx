import { formatDateTime } from '../../utils/format';

// items: [{ id, at, title, detail? }] in the order they should be read.
export default function AdminTimeline({ items, label }) {
  return (
    <ol aria-label={label} className="space-y-4 border-l-2 border-steel-300 pl-5">
      {items.map((item, index) => (
        <li key={item.id ?? index} className="relative">
          <span aria-hidden="true" className="absolute -left-[1.6rem] top-2 size-3 rounded-full bg-ink-900" />
          <p className="text-base font-semibold">{item.title}</p>
          <p className="text-base text-steel-600"><time dateTime={item.at ?? undefined}>{formatDateTime(item.at)}</time></p>
          {item.detail && <p className="mt-1 break-words text-base">{item.detail}</p>}
        </li>
      ))}
    </ol>
  );
}
