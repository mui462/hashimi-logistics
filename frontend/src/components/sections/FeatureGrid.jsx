import { isDarkTone, useSectionAppearance } from '../../config/sectionAppearance';
import { cx } from '../../utils/cx';
import IconByName from '../common/IconByName';
import Reveal, { staggerDelay } from '../common/Reveal';
import SectionHeading from '../common/SectionHeading';
import SectionShell from './SectionShell';

// Slow-drifting gold glows behind the Why Hashimi cards; they stand still when the visitor prefers reduced motion.
const SHOWCASE_CSS = `
.fg-card{--mx:50%;--my:0%}
.fg-card::before{content:'';position:absolute;inset:0;z-index:-1;border-radius:inherit;background:radial-gradient(420px circle at var(--mx) var(--my),rgba(216,173,84,.22),transparent 60%);opacity:0;transition:opacity .35s ease}
.fg-card:hover::before{opacity:1}
@media (prefers-reduced-motion: no-preference){
  .fg-blob{animation:fg-drift 16s ease-in-out infinite alternate}
  .fg-blob-b{animation-duration:22s;animation-direction:alternate-reverse}
}
@keyframes fg-drift{from{transform:translate3d(-4%,-3%,0) scale(1)}to{transform:translate3d(5%,4%,0) scale(1.12)}}
`;

// The glow inside a card follows the pointer (set straight on the element, so nothing re-renders while moving).
const followPointer = (event) => {
  const box = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--mx', `${event.clientX - box.left}px`);
  event.currentTarget.style.setProperty('--my', `${event.clientY - box.top}px`);
};


function FeatureBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
      <div className="fg-blob absolute -left-24 top-10 size-96 rounded-full bg-signal-400/10 blur-3xl" />
      <div className="fg-blob fg-blob-b absolute -right-24 bottom-0 size-[28rem] rounded-full bg-signal-500/10 blur-3xl" />
      <div className="absolute inset-0 opacity-[0.04] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:48px_48px]" />
    </div>
  );
}

// Generic icon + title + text grid, used for Why Hashimi, benefits, values and audience sections.
export default function FeatureGrid({ items, id, eyebrow, title, description, tone = 'dark', columns = 3, headingAs, showcase = false, hideHeading = false }) {
  if (!items?.length) return null;
  const dark = isDarkTone(tone);
  const { cardStyle } = useSectionAppearance();
  // Dark sections already use glass cards; on light sections the Glass card style gives a light glass card.
  const lightGlass = !dark && cardStyle === 'glass';
  const headingId = `${id}-heading`;
  const cols = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' }[columns];

  if (showcase) {
    return (
      <SectionShell id={id} tone={tone} labelledBy={headingId} className="relative isolate overflow-hidden" background={<FeatureBackdrop />}>
        <style>{SHOWCASE_CSS}</style>
        {hideHeading ? <h2 id={headingId} className="sr-only">{title}</h2> : <SectionHeading id={headingId} eyebrow={eyebrow} title={title} description={description} dark={dark} as={headingAs} />}
        <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-flow-dense lg:grid-cols-3">
          {items.map((item, index) => {
            // Bento rhythm: the first card is wide; if the last row would be left short, the last card stretches to close it.
            const filled = (items.length + 1) % 3;
            const span = index === 0 ? 'lg:col-span-2' : index === items.length - 1 && filled !== 0 ? (filled === 1 ? 'lg:col-span-3' : 'lg:col-span-2') : '';
            const featured = index === 0;
            return (
              <li key={item.title} className={cx('h-full', span)}>
                <Reveal className="h-full" delay={staggerDelay(index, 3)}>
                  <article onPointerMove={followPointer} className="fg-card group relative isolate flex h-full min-h-[14rem] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.09] via-white/[0.03] to-transparent p-7 shadow-lg backdrop-blur-sm transition-[transform,box-shadow,border-color] duration-500 ease-out hover:-translate-y-1.5 hover:border-signal-400/50 hover:shadow-[0_22px_45px_rgba(0,0,0,0.5)] focus-within:border-signal-400/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-8">
                    {item.image?.url && (
                      <>
                        <img src={item.image.url} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = 'none'; }} className="absolute inset-0 -z-20 size-full object-cover object-center transition-transform duration-700 group-hover:scale-105" />
                        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/55 to-black/35" aria-hidden="true" />
                      </>
                    )}
                    <IconByName name={item.icon} className="pointer-events-none absolute -bottom-8 -right-6 -z-10 size-44 -rotate-12 text-signal-400/[0.07] transition-[transform,color] duration-700 group-hover:-rotate-6 group-hover:scale-110 group-hover:text-signal-400/[0.14] motion-reduce:transition-none" />
                    <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-signal-400 to-signal-500 text-ink-950 shadow-[0_8px_24px_rgba(216,173,84,0.35)] transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:rotate-0 motion-reduce:group-hover:scale-100">
                      <IconByName name={item.icon} className="size-7" />
                    </span>
                    <h3 className={cx('mt-6 font-extrabold leading-tight', featured ? 'text-2xl sm:text-3xl' : 'text-xl')}>{item.title}</h3>
                    <p className={cx('mt-3 text-steel-200', featured ? 'max-w-xl text-lg' : 'text-base')}>{item.text}</p>
                  </article>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </SectionShell>
    );
  }

  return (
    <SectionShell id={id} tone={tone} labelledBy={headingId}>
      <SectionHeading id={headingId} eyebrow={eyebrow} title={title} description={description} dark={dark} as={headingAs} />
      <ul className={cx('grid gap-4 sm:grid-cols-2 sm:gap-5', cols)}>
        {items.map((item, index) => (
          <li key={item.title}>
            <Reveal className="h-full" delay={staggerDelay(index, columns)}>
              <div className={cx('group relative h-full overflow-hidden rounded-2xl border p-6 transition duration-300 hover:-translate-y-1 sm:p-7', dark ? 'glass-panel border-white/15 hover:border-signal-400/60' : lightGlass ? 'glass-card hover:border-signal-400' : 'border-signal-400/40 bg-gradient-to-br from-signal-400/15 via-signal-400/5 to-transparent hover:border-signal-500')}>
                <span className="flex size-14 items-center justify-center rounded-xl bg-gradient-to-br from-signal-400 to-signal-500 text-ink-950 shadow-[0_8px_16px_-6px_rgb(196_154_63/0.8)] transition-transform duration-300 group-hover:scale-105">
                  <IconByName name={item.icon} className="size-7" />
                </span>
                <h3 className="mt-5 text-xl font-bold">{item.title}</h3>
                <p className={cx('mt-2 text-base leading-relaxed', dark ? 'text-steel-200' : 'text-steel-600')}>{item.text}</p>
                <span className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-signal-400 to-signal-500 transition-transform duration-500 group-hover:scale-x-100" aria-hidden="true" />
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
