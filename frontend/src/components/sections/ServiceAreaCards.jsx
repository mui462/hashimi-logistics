import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isDarkTone, useSectionAppearance } from '../../config/sectionAppearance';
import { PATHS } from '../../config/paths';
import { ArrowRight, MapPin, Truck } from 'lucide-react';
import Reveal, { staggerDelay } from '../common/Reveal';
import SectionHeading from '../common/SectionHeading';
import SectionShell from './SectionShell';

// Moving lane line, a slow glow and a light sweep on the showcase cards. Everything moves only for visitors who have not asked for reduced motion.
const SHOWCASE_CSS = `
.sa-grid{background-image:radial-gradient(rgba(255,255,255,.07) 1px,transparent 1px);background-size:22px 22px;-webkit-mask-image:linear-gradient(to bottom,#000,transparent 75%);mask-image:linear-gradient(to bottom,#000,transparent 75%)}
.sa-lane{background-image:repeating-linear-gradient(90deg,rgba(216,173,84,.9) 0 8px,transparent 8px 16px)}
@media (prefers-reduced-motion: no-preference){
  .sa-lane{animation:sa-flow 1.4s linear infinite}
  .sa-glow{animation:sa-breathe 7s ease-in-out infinite alternate}
  .sa-card::after{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.12) 50%,transparent 65%);transform:translateX(-130%);transition:transform .9s ease}
  .sa-card:hover::after{transform:translateX(130%)}
}
@keyframes sa-flow{from{background-position:0 0}to{background-position:16px 0}}
@keyframes sa-breathe{from{transform:scale(1);opacity:.6}to{transform:scale(1.25);opacity:1}}
`;

// Lane shown on each card, picked from the built-in area slug. Areas without a known slug simply show no lane.
const LANES = {
  'united-states': { from: 'US', to: 'US', label: 'Domestic' },
  canada: { from: 'US', to: 'CA', label: 'Cross-border' },
  mexico: { from: 'US', to: 'MX', label: 'Cross-border' },
};

function Lane({ lane }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 backdrop-blur-md" aria-hidden="true">
      <span className="text-lg font-black tracking-widest">{lane.from}</span>
      <span className="relative flex h-6 flex-1 items-center">
        <span className="sa-lane h-0.5 w-full rounded-full" />
        <Truck className="absolute left-1/2 size-6 -translate-x-1/2 rounded-full bg-ink-950 p-1 text-signal-400 ring-1 ring-signal-400/60" />
      </span>
      <span className="text-lg font-black tracking-widest text-signal-400">{lane.to}</span>
    </div>
  );
}

/** One showcase card. The Super Admin's picture (or the CMS area's own) fills the card; without one, a graphite panel with a dotted grid stands in. */
function ShowcaseCard({ area, index, imageUrl }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const pictured = Boolean(imageUrl) && failedUrl !== imageUrl;
  const lane = LANES[area.slug];
  return (
    <li className="sa-card group/card relative isolate flex min-h-[28rem] overflow-hidden rounded-[2rem] border border-white/10 bg-ink-950 text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)] transition-[transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-2 hover:border-signal-400/60 hover:shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      {pictured ? (
        <img src={imageUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(imageUrl)} className="absolute inset-0 -z-20 size-full object-cover object-center transition-transform duration-700 ease-out group-hover/card:scale-110 motion-reduce:transition-none" />
      ) : (
        <>
          <div className="absolute inset-0 -z-20 bg-gradient-to-br from-[#2D3138] via-[#1C1E23] to-[#0E0F11]" aria-hidden="true" />
          <div className="sa-grid absolute inset-0 -z-10" aria-hidden="true" />
        </>
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/45 to-black/15" aria-hidden="true" />
      <span className="sa-glow pointer-events-none absolute -left-16 -top-16 -z-10 size-56 rounded-full bg-signal-400/25 blur-3xl" aria-hidden="true" />
      <span className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-signal-400 to-transparent" aria-hidden="true" />
      <span className="pointer-events-none absolute -right-2 -top-6 -z-10 select-none text-[9rem] font-black leading-none text-white/[0.06]" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>

      <Reveal className="flex w-full flex-col justify-between p-7 sm:p-8" delay={staggerDelay(index, 3)}>
        <div className="space-y-5">
          <p className="inline-flex items-center gap-2 rounded-full border border-signal-400/50 bg-black/40 px-4 py-2 text-sm font-bold uppercase tracking-widest backdrop-blur-md">
            <MapPin className="size-4 text-signal-400" aria-hidden="true" />
            {area.country}
          </p>
          {lane && <Lane lane={lane} />}
        </div>

        <div className="mt-10">
          <h3 className="text-3xl font-extrabold leading-tight">{area.title}</h3>
          <span className="mt-3 block h-1 w-12 rounded-full bg-signal-400 transition-all duration-500 group-hover/card:w-24 motion-reduce:transition-none" aria-hidden="true" />
          <p className="mt-4 text-base leading-relaxed text-white/85">{area.text}</p>
          {area.regions?.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {area.regions.map((region) => (
                <li key={region} className="rounded-full border border-signal-400/50 bg-black/40 px-3 py-1 text-sm font-semibold text-signal-400 backdrop-blur-md transition-colors duration-300 group-hover/card:bg-signal-400 group-hover/card:text-ink-950">
                  {region}
                </li>
              ))}
            </ul>
          )}
          <Link to={PATHS.requestQuote} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-signal-400 px-5 text-base font-bold text-ink-950 transition-colors hover:bg-signal-500">
            Request a quote
            <ArrowRight className="size-4 transition-transform duration-300 group-hover/card:translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
          </Link>
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
      <ul className={showcase ? 'grid gap-5 sm:gap-6 md:grid-cols-3' : 'grid gap-6 md:grid-cols-3'}>
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
