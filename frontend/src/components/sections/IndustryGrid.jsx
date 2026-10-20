import { isDarkTone, useSectionAppearance } from '../../config/sectionAppearance';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PATHS } from '../../config/paths';
import IconByName from '../common/IconByName';
import Reveal, { staggerDelay } from '../common/Reveal';
import SectionHeading from '../common/SectionHeading';
import MediaImage from '../media/MediaImage';
import SectionShell from './SectionShell';

export default function IndustryGrid({
  industries,
  id = 'industries',
  eyebrow = 'Industries',
  title = 'Freight Expertise Across Industries',
  description,
  tone = 'muted',
  headingAs,
  showcase = false,
  cardImages,
}) {
  const { cardStyle } = useSectionAppearance();
  if (!industries?.length) return null;
  const headingId = `${id}-heading`;
  return (
    <SectionShell id={id} tone={tone} labelledBy={headingId}>
      <SectionHeading id={headingId} eyebrow={eyebrow} title={title} description={description} dark={isDarkTone(tone)} as={headingAs} />
      <ul className={showcase ? 'grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4' : 'grid gap-6 sm:grid-cols-2 lg:grid-cols-4'}>
        {industries.map((industry, index) => showcase ? (
          <li key={industry.slug} className="group/card relative isolate flex min-h-[26rem] overflow-hidden rounded-br-[3.5rem] rounded-tl-[3.5rem] rounded-bl-xl rounded-tr-xl border border-white/15 bg-black/20 text-white shadow-lg transition-[transform,box-shadow] duration-500 ease-out hover:-translate-y-2 hover:shadow-2xl motion-reduce:transition-none motion-reduce:hover:translate-y-0">
            <MediaImage src={cardImages?.[industry.slug]?.url ?? industry.image?.url} slot={industry.slug} scene={industry.scene} alt="" className="absolute inset-0 -z-20 transition-transform duration-700 ease-out group-hover/card:scale-110 motion-reduce:transition-none" />
            {/* Light neutral shade only at the foot, so the picture stays fully visible above the text panel. */}
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/60 via-transparent to-transparent" aria-hidden="true" />
            <Reveal className="flex w-full flex-col justify-between p-4 sm:p-5" delay={staggerDelay(index)}>
              <span className="ml-auto flex size-12 items-center justify-center rounded-full border border-signal-400/70 bg-black/40 text-signal-400 backdrop-blur-md transition-[background-color,color,transform] duration-500 group-hover/card:rotate-[360deg] group-hover/card:bg-signal-400 group-hover/card:text-ink-950 motion-reduce:transition-none motion-reduce:group-hover/card:rotate-0">
                <IconByName name={industry.icon} className="size-6" />
              </span>
              {/* Frosted panel carrying the text, with a gold edge on the left. */}
              <div className="mt-auto rounded-2xl border border-white/15 border-l-4 border-l-signal-400 bg-black/45 p-5 backdrop-blur-md">
                <h3 className="text-xl font-bold">{industry.title}</h3>
                <p className="mt-2 text-base text-white/90">{industry.short}</p>
                <Link
                  to={`${PATHS.industries}/${industry.slug}`}
                  className="group/cta mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-signal-400 px-5 text-sm font-bold text-ink-950 shadow-md transition-[background-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:bg-[#E6C27A] hover:shadow-[0_8px_20px_rgba(216,173,84,0.4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  aria-label={`View industry: ${industry.title}`}
                >
                  View industry
                  <ArrowRight className="size-4 transition-transform duration-300 group-hover/cta:translate-x-1 group-focus-visible/cta:translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
                </Link>
              </div>
            </Reveal>
          </li>
        ) : (
          <li key={industry.slug}>
            <Reveal className="h-full" delay={staggerDelay(index)}>
            <article className={`group flex h-full flex-col overflow-hidden ${cardStyle === 'glass' ? 'glass-card' : 'rounded-[var(--site-card-radius,0px)] border border-steel-200 bg-white'} transition-[background-color,border-color,box-shadow,transform] duration-300 ease-out motion-reduce:transition-none hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.10)] hover:border-steel-300 focus-within:border-steel-300`}>
              <div className="aspect-[16/10] overflow-hidden bg-ink-900">
                <MediaImage src={industry.image?.url} slot={industry.slug} scene={industry.scene} alt={industry.image?.altText ?? ''} className="transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none" />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center gap-3">
                  <IconByName name={industry.icon} className="size-6 text-ink-800" />
                  <h3 className="text-xl font-bold">{industry.title}</h3>
                </div>
                <p className="mt-2 flex-1 text-base text-steel-600">{industry.short}</p>
                <Link
                  to={`${PATHS.industries}/${industry.slug}`}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 text-base font-bold underline-offset-4 group-hover:underline"
                  aria-label={`View industry: ${industry.title}`}
                >
                  View industry
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </Link>
              </div>
            </article>
            </Reveal>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
