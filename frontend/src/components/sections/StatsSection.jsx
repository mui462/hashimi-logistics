import Reveal, { staggerDelay } from '../common/Reveal';
import IconByName from '../common/IconByName';
import SectionHeading from '../common/SectionHeading';
import SectionShell from './SectionShell';

// CMS-ready statistics. Pass `enabled={false}` (or an empty list) to hide it. Items with a `value`
// show a figure; items without one show a neutral label. Nothing here asserts unverified numbers.
export default function StatsSection({ stats, id = 'statistics', headingAs }) {
  if (!stats || stats.enabled === false || !stats.items?.length) return null;
  const headingId = `${id}-heading`;
  return (
    <SectionShell id={id} tone="darker" labelledBy={headingId}>
      <SectionHeading id={headingId} title={stats.title} dark as={headingAs} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.items.map((item, index) => (
          <li key={item.label}>
            <Reveal className="glass-panel h-full p-6" delay={staggerDelay(index)}>
            <IconByName name={item.icon} className="size-7 text-signal-400" />
            {item.value ? (
              <p className="mt-4 text-5xl font-extrabold">{item.value}</p>
            ) : null}
            <p className={item.value ? 'mt-1 text-lg font-bold' : 'mt-4 text-xl font-bold'}>{item.label}</p>
            {item.text && <p className="mt-1 text-base text-steel-200">{item.text}</p>}
            </Reveal>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
