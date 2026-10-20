import { ArrowLeftRight } from 'lucide-react';
import IconByName from '../common/IconByName';
import Reveal from '../common/Reveal';
import SectionHeading from '../common/SectionHeading';
import MediaImage from '../media/MediaImage';
import SectionShell from './SectionShell';

export default function CrossBorderSection({ data, id = 'cross-border', headingAs }) {
  if (!data) return null;
  const headingId = `${id}-heading`;
  return (
    <SectionShell id={id} tone="dark" labelledBy={headingId}>
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <SectionHeading id={headingId} eyebrow="Cross-Border" title={data.title} description={data.intro} dark as={headingAs} className="mb-8 sm:mb-8" />
          <ul className="mb-8 grid gap-3 sm:grid-cols-2">
            {data.lanes.map((lane) => (
              <li key={lane.title} className="glass-panel flex items-center gap-3 p-4">
                <ArrowLeftRight className="size-6 shrink-0 text-signal-400" aria-hidden="true" />
                <div>
                  <p className="text-lg font-bold">{lane.title}</p>
                  <p className="text-base text-steel-200">{lane.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <ul className="grid gap-6 sm:grid-cols-2">
            {data.items.map((item) => (
              <li key={item.title} className="flex gap-3">
                <IconByName name={item.icon} className="mt-1 size-6 shrink-0 text-signal-400" />
                <div>
                  <h3 className="text-lg font-bold">{item.title}</h3>
                  {item.text && <p className="text-base text-steel-200">{item.text}</p>}
                </div>
              </li>
            ))}
          </ul>
          {data.disclaimer && <p className="mt-8 border-l-4 border-signal-500 pl-4 text-base text-steel-200">{data.disclaimer}</p>}
        </div>
        <Reveal variant="zoom" className="group/img relative isolate aspect-[4/3] overflow-hidden rounded-[2.25rem] border border-signal-400/40 border-t-[3px] border-t-signal-400 shadow-[0_20px_50px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
          <MediaImage src={data.image?.url} slot="cross-border" scene="border" alt={data.image?.altText ?? ''} className="transition-transform duration-700 ease-out group-hover/img:scale-105 motion-reduce:transition-none" />
          {/* Soft neutral vignette (no blue tint) gives the picture depth without hiding it. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" aria-hidden="true" />
        </Reveal>
      </div>
    </SectionShell>
  );
}
