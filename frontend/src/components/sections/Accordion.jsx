import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { cx } from '../../utils/cx';

// Accessible accordion: real buttons with aria-expanded/aria-controls, panels as labelled regions.
// Hidden panels use the `hidden` attribute so their content is not focusable or announced.
export default function Accordion({ items, headingLevel: Heading = 'h3' }) {
  const baseId = useId();
  const [openIds, setOpenIds] = useState(() => new Set());

  const toggle = (id) =>
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const open = openIds.has(item.id);
        const buttonId = `${baseId}-${item.id}-button`;
        const panelId = `${baseId}-${item.id}-panel`;
        return (
          <div key={item.id} className={cx('rounded-2xl border bg-white px-5 text-ink-900 transition-colors duration-300', open ? 'border-signal-400 shadow-[0_16px_32px_-24px_rgb(0_0_0/0.4)]' : 'border-steel-200 hover:border-steel-300')}>
            <Heading>
              <button
                type="button"
                id={buttonId}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className="flex min-h-14 w-full items-center justify-between gap-4 py-4 text-left text-lg font-bold transition-colors duration-200 hover:text-steel-600 motion-reduce:transition-none"
              >
                <span>{item.q}</span>
                <ChevronDown className={cx('size-6 shrink-0 text-signal-500 transition-transform duration-300 motion-reduce:transition-none', open && 'rotate-180')} aria-hidden="true" />
              </button>
            </Heading>
            <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!open} className="accordion-panel pb-5 pr-10 text-base text-steel-600">
              <p>{item.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
