import IconByName from '../common/IconByName';
import PlainText from '../common/PlainText';
import Reveal, { staggerDelay } from '../common/Reveal';
import SectionHeading from '../common/SectionHeading';
import FramedMedia from '../media/FramedMedia';
import MediaImage from '../media/MediaImage';
import SectionShell from './SectionShell';
import FeatureGrid from './FeatureGrid';
import { paragraphsOf, splitItems } from '../../utils/aboutContent';

// The About page sections under the banner. Each one receives the resolved heading, text and picture of its slot
// (utils/aboutContent.js), so the Super Admin's wording and pictures replace the built-in ones.

const Picture = FramedMedia;

export function WhoWeAre({ slot }) {
  return (
    <SectionShell id="who-we-are" labelledBy="who-heading">
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div>
          <SectionHeading id="who-heading" eyebrow="About" title={slot.heading} />
          <Reveal delay={80}>
            <PlainText text={slot.body} className="space-y-0 text-lg leading-relaxed text-steel-600" />
          </Reveal>
        </div>
        <Reveal variant="zoom">
          <Picture image={slot.image} scene="dryvan" />
        </Reveal>
      </div>
    </SectionShell>
  );
}

export function Mission({ slot }) {
  return (
    <SectionShell
      tone="darker"
      id="mission"
      labelledBy="mission-heading"
      background={
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
          <div className="absolute -left-24 top-0 size-96 rounded-full bg-signal-400/10 blur-3xl" />
          <div className="absolute -right-20 bottom-0 size-80 rounded-full bg-signal-500/10 blur-3xl" />
        </div>
      }
    >
      <Reveal className="mx-auto max-w-4xl border-l-4 border-signal-400 pl-6 sm:pl-10">
        <h2 id="mission-heading" className="mb-5 text-base font-bold uppercase tracking-widest text-signal-400">{slot.heading}</h2>
        {slot.image && (
          <div className="mb-8 aspect-[21/9] overflow-hidden rounded-2xl ring-1 ring-white/10">
            <MediaImage src={slot.image.url} alt={slot.image.altText ?? ''} />
          </div>
        )}
        <PlainText text={slot.body} className="text-2xl font-semibold leading-snug sm:text-3xl lg:text-4xl" />
      </Reveal>
    </SectionShell>
  );
}

export function Approach({ slot }) {
  const { intro, items } = splitItems(slot.body);
  return (
    <SectionShell tone="muted" id="approach" labelledBy="approach-heading">
      <SectionHeading id="approach-heading" eyebrow="How we work" title={slot.heading} description={intro.join(' ') || undefined} />
      {slot.image && (
        <Reveal variant="zoom" className="mb-10 aspect-[21/9] overflow-hidden rounded-2xl ring-1 ring-black/5">
          <MediaImage src={slot.image.url} alt={slot.image.altText ?? ''} />
        </Reveal>
      )}
      {items.length > 0 && (
        <ol className="grid gap-5 md:grid-cols-3">
          {items.map((item, index) => (
            <li key={item.title}>
              <Reveal className="h-full" delay={staggerDelay(index, 3)}>
                <div className="group relative h-full overflow-hidden rounded-2xl border border-steel-200 bg-white p-7 transition duration-300 hover:-translate-y-1 hover:border-signal-400 hover:shadow-[0_20px_40px_-24px_rgb(0_0_0/0.4)]">
                  <span className="text-5xl font-extrabold leading-none text-signal-400/60 transition-colors duration-300 group-hover:text-signal-500" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  <h3 className="mt-5 text-xl font-bold">{item.title}</h3>
                  <p className="mt-2 text-base leading-relaxed text-steel-600">{item.text}</p>
                  <span className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-signal-400 to-signal-500 transition-transform duration-500 group-hover:scale-x-100" aria-hidden="true" />
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      )}
    </SectionShell>
  );
}

// The four cards use the homepage's "Why Hashimi" card style (FeatureGrid showcase). A card's own picture, if the Super Admin
// added one, shows behind its text.
export function SetsUsApart({ intro, cards }) {
  if (!intro.visible && cards.length === 0) return null;
  return (
    <FeatureGrid
      showcase
      id="what-sets-us-apart"
      eyebrow="Why Hashimi"
      title={intro.heading}
      description={paragraphsOf(intro.body).join(' ') || undefined}
      hideHeading={!intro.visible}
      items={cards.map((card) => ({ icon: card.icon, title: card.heading, text: card.body, image: card.image }))}
      tone="dark"
    />
  );
}

const PILLAR_ICONS = ['message', 'clipboard', 'users'];

export function Commitment({ slot }) {
  const { intro, items } = splitItems(slot.body);
  return (
    <SectionShell tone="muted" id="commitment" labelledBy="commitment-heading">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
        <div>
          <SectionHeading id="commitment-heading" eyebrow="Our promise to you" title={slot.heading} />
          {intro.length > 0 && <Reveal delay={80}><p className="text-lg leading-relaxed text-steel-600">{intro.join(' ')}</p></Reveal>}
          {slot.image && (
            <Reveal variant="zoom" className="mt-8">
              <Picture image={slot.image} scene="loading" className="aspect-[4/3]" />
            </Reveal>
          )}
        </div>
        {items.length > 0 && (
          <ul className="space-y-4">
            {items.map((item, index) => (
              <li key={item.title}>
                <Reveal delay={staggerDelay(index, 3)}>
                  <div className="group flex gap-5 rounded-2xl border border-steel-200 bg-white p-6 transition duration-300 hover:border-signal-400 hover:shadow-[0_20px_40px_-24px_rgb(0_0_0/0.4)]">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-signal-400 to-signal-500 text-ink-950 shadow-[0_8px_16px_-6px_rgb(196_154_63/0.8)] transition-transform duration-300 group-hover:scale-105">
                      <IconByName name={PILLAR_ICONS[index % PILLAR_ICONS.length]} className="size-6" />
                    </span>
                    <div>
                      <h3 className="text-lg font-bold">{item.title}</h3>
                      <p className="mt-1 text-base leading-relaxed text-steel-600">{item.text}</p>
                    </div>
                  </div>
                </Reveal>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionShell>
  );
}
