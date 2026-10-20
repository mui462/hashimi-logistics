import { useState } from 'react';
import { isDarkTone, useSectionAppearance } from '../../config/sectionAppearance';
import { Globe, MapPin } from 'lucide-react';
import Reveal, { staggerDelay } from '../common/Reveal';
import SectionHeading from '../common/SectionHeading';
import SectionShell from './SectionShell';

// Beacon rings and a soft light sweep on the showcase cards. Everything moves only for visitors who have not asked for reduced motion.
const SHOWCASE_CSS = `
@media (prefers-reduced-motion: no-preference){
  .sa-ring{animation:sa-ping 3.6s ease-out infinite}
  .sa-glow{animation:sa-breathe 7s ease-in-out infinite alternate}
  .sa-card::after{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.14) 50%,transparent 65%);transform:translateX(-130%);transition:transform .9s ease}
  .sa-card:hover::after{transform:translateX(130%)}
}
@keyframes sa-ping{0%{transform:scale(.3);opacity:.85}100%{transform:scale(1);opacity:0}}
@keyframes sa-breathe{from{transform:scale(1);opacity:.6}to{transform:scale(1.25);opacity:1}}
`;

/** One showcase card. The Super Admin's picture (or the CMS area's own) fills the card; without one, a graphite panel with a globe stands in. */
function ShowcaseCard({ area, index, imageUrl }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const pictured = Boolean(imageUrl) && failedUrl !== imageUrl;
  return (
    <li className="sa-card group/card relative isolate flex min-h-[24rem] overflow-hidden rounded-[2rem] border border-white/15 bg-ink-950 text-white shadow-lg transition-[transform,box-shadow] duration-500 ease-out hover:-translate-y-2 hover:shadow-[0_26px_50px_rgba(0,0,0,0.5)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      {pictured ? (
        <img src={imageUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(imageUrl)} className="absolute inset-0 -z-20 size-full object-cover object-center transition-transform duration-700 ease-out group-hover/card:scale-110 motion-reduce:transition-none" />
      ) : (
        <>
          <div className="absolute inset-0 -z-20 bg-gradient-to-br from-[#2D3138] via-[#1C1E23] to-[#111214]" aria-hidden="true" />
          <Globe className="absolute -bottom-10 -right-10 -z-10 size-72 text-signal-400/[0.08] transition-transform duration-700 group-hover/card:rotate-12 group-hover/card:scale-110 motion-reduce:transition-none" aria-hidden="true" />
        </>
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/35 to-black/10" aria-hidden="true" />
      <span className="sa-glow pointer-events-none absolute -left-16 -top-16 -z-10 size-52 rounded-full bg-signal-400/25 blur-3xl" aria-hidden="true" />

      <Reveal className="flex w-full flex-col justify-between p-7 sm:p-8" delay={staggerDelay(index, 3)}>
        <div className="flex items-start justify-between gap-4">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/40 px-4 py-2 text-sm font-bold uppercase tracking-widest backdrop-blur-md">
            <MapPin className="size-4 text-signal-400" aria-hidden="true" />
            {area.country}
          </p>
          {/* Coverage beacon: gold rings that keep pinging outwards from a steady centre. */}
          <span className="relative mr-2 mt-2 flex size-10 items-center justify-center" aria-hidden="true">
            {[0, 1.2, 2.4].map((delay) => (
              <span key={delay} className="sa-ring absolute inset-0 rounded-full border-2 border-signal-400" style={{ animationDelay: `${delay}s` }} />
            ))}
            <span className="size-3 rounded-full bg-signal-400 shadow-[0_0_14px_rgba(216,173,84,0.9)]" />
          </span>
        </div>

        <div className="mt-10">
          <h3 className="text-3xl font-extrabold leading-tight">{area.title}</h3>
          <p className="mt-3 text-base text-white/90">{area.text}</p>
          {area.regions?.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {area.regions.map((region) => (
                <li key={region} className="rounded-full border border-signal-400/50 bg-black/40 px-3 py-1 text-sm font-semibold text-signal-400 backdrop-blur-md transition-colors duration-300 group-hover/card:bg-signal-400 group-hover/card:text-ink-950">
                  {region}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Reveal>
    </li>
  );
}

// Card grid (deliberately no map). `areas[].regions` is a configurable list of regional
// notes; it is empty until the client supplies confirmed regions. `showcase` turns on the picture-card look (homepage and
// Service Areas page); other pages keep the plain cards.
export default function ServiceAreaCards({
  areas,
  id = 'service-areas',
  eyebrow = 'Service Areas',
  title = 'Coverage Across North America',
  description,
  tone = 'default',
  headingAs,
  showcase = false,
  cardImages,
}) {
  const { cardStyle } = useSectionAppearance();
  if (!areas?.length) return null;
  const headingId = `${id}-heading`;
  return (
    <SectionShell id={id} tone={tone} labelledBy={headingId}>
      {showcase && <style>{SHOWCASE_CSS}</style>}
      <SectionHeading id={headingId} eyebrow={eyebrow} title={title} description={description} dark={isDarkTone(tone)} as={headingAs} />
      <ul className={showcase ? 'grid gap-4 sm:gap-5 md:grid-cols-3' : 'grid gap-6 md:grid-cols-3'}>
        {areas.map((area, index) =>
          showcase ? (
            <ShowcaseCard key={area.slug} area={area} index={index} imageUrl={cardImages?.[area.slug]?.url ?? area.image?.url} />
          ) : (
            <li key={area.slug}>
              <Reveal className="h-full" delay={staggerDelay(index, 3)}>
                <article className={`h-full border-t-4 border-t-ink-900 p-6 ${cardStyle === 'glass' ? 'glass-card' : 'rounded-[var(--site-card-radius,0px)] border border-steel-200 bg-white'} transition-[background-color,border-color,box-shadow,transform] duration-300 ease-out motion-reduce:transition-none hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.10)] hover:border-t-signal-500`}>
                  <p className="flex items-center gap-2 text-base font-bold uppercase tracking-widest text-steel-600">
                    <MapPin className="size-5" aria-hidden="true" />
                    {area.country}
                  </p>
                  <h3 className="mt-3 text-2xl font-extrabold">{area.title}</h3>
                  <p className="mt-2 text-base text-steel-600">{area.text}</p>
                  {area.regions?.length > 0 && (
                    <ul className="mt-4 space-y-1 border-t border-steel-200 pt-4 text-base">
                      {area.regions.map((region) => (
                        <li key={region}>{region}</li>
                      ))}
                    </ul>
                  )}
                </article>
              </Reveal>
            </li>
          )
        )}
      </ul>
    </SectionShell>
  );
}
