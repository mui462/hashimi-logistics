import { useState } from 'react';
import { isDarkTone } from '../../config/sectionAppearance';
import { cx } from '../../utils/cx';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PATHS } from '../../config/paths';
import Reveal, { staggerDelay } from '../common/Reveal';
import IconByName from '../common/IconByName';
import SectionHeading from '../common/SectionHeading';
import SectionShell from './SectionShell';
import { serviceImageFor } from '../../content/serviceImages';

// Light sweep across a card on hover; stands still for visitors who prefer reduced motion.
const SERVICE_CARD_CSS = `
@property --sv-a{syntax:'<angle>';inherits:false;initial-value:0deg}
.sv-card::before{content:'';position:absolute;inset:0;z-index:2;pointer-events:none;border-radius:inherit;padding:2px;background:conic-gradient(from var(--sv-a),transparent 0 62%,#d8ad54 82%,#f2d28a 90%,transparent 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:0;transition:opacity .4s ease}
.sv-card:hover::before,.sv-card:focus-within::before{opacity:1}
@media (prefers-reduced-motion: no-preference){
  .sv-card:hover::before,.sv-card:focus-within::before{animation:sv-spin 3.5s linear infinite}
  .sv-card::after{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.16) 50%,transparent 65%);transform:translateX(-130%);transition:transform .9s ease}
  .sv-card:hover::after,.sv-card:focus-within::after{transform:translateX(130%)}
  .sv-halo{animation:sv-halo 3.6s ease-in-out infinite}
}
@keyframes sv-spin{to{--sv-a:360deg}}
@keyframes sv-halo{0%,100%{opacity:.55;transform:scale(.9)}50%{opacity:1;transform:scale(1.15)}}
`;

/**
 * One service card. With a picture (the Super Admin's service image, else the predefined one) the picture fills the card behind a
 * neutral dark gradient and the text turns light; with none, or if it fails to load, the card keeps its original white look.
 */
function ServiceCard({ service, index, ctaLabel, sectionHasImage, imageUrl }) {
  // Keyed on the picture, so choosing a different one starts from a clean "not failed" state.
  const [failedUrl, setFailedUrl] = useState(null);
  const failed = failedUrl === imageUrl;
  const pictured = Boolean(imageUrl) && !failed;
  return (
    <li className={cx('sv-card group/card relative isolate overflow-hidden rounded-3xl border-t-[3px] border-t-signal-400 shadow-md ring-1 ring-white/10 transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_22px_45px_rgba(0,0,0,0.45),0_0_0_1px_rgba(216,173,84,0.4)] motion-reduce:transition-none motion-reduce:hover:translate-y-0', pictured ? 'bg-ink-950 text-white' : sectionHasImage ? 'bg-white/90 text-ink-900 backdrop-blur-sm' : 'border border-steel-200 border-t-signal-400 bg-white text-ink-900')}>
      {pictured && (
        <>
          {/* One picture over the whole card: the lower part is the blurred picture, and the sharp picture on top fades into it. */}
          <img src={imageUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" className="absolute inset-0 -z-20 size-full scale-125 object-cover object-bottom blur-xl" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/0 via-black/10 to-black/40" aria-hidden="true" />
        </>
      )}
      <Reveal className="h-full" delay={staggerDelay(index)}>
        <div className={cx('group flex h-full flex-col transition-[background-color,border-color,box-shadow,transform] duration-300 ease-out motion-reduce:transition-none', pictured ? 'min-h-[20rem]' : 'min-h-[18rem] hover:bg-steel-50 focus-within:bg-steel-50')}>
          {pictured && (
            // The picture is shown whole at its own 4:3 shape (never cropped to the card), with the text on a dark panel below it.
            <div className="relative aspect-[4/3] shrink-0 overflow-hidden [-webkit-mask-image:linear-gradient(to_bottom,#000_62%,transparent)] [mask-image:linear-gradient(to_bottom,#000_62%,transparent)]">
              <img src={imageUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(imageUrl)} className="absolute inset-0 size-full object-cover object-center transition-transform duration-500 ease-out motion-reduce:transition-none group-hover/card:scale-105" />
              
            </div>
          )}
          <div className={cx('flex flex-1 flex-col items-center text-center', pictured ? 'relative -mt-5 px-6 pb-7 pt-0 [text-shadow:0_1px_8px_rgb(0_0_0/0.7)] sm:px-7' : 'p-8 sm:p-9')}>
            <span className="relative flex size-[4.5rem] items-center justify-center">
              <span className="sv-halo absolute inset-0 rounded-full bg-signal-400/25 blur-xl transition-[transform,background-color] duration-500 group-hover:scale-150 group-hover:bg-signal-400/40" aria-hidden="true" />
              <span className="flex size-14 items-center justify-center rounded-2xl bg-ink-900 text-signal-400 shadow-[0_0_22px_rgba(216,173,84,0.25)] ring-1 ring-signal-400/40 transition-[background-color,color,transform] duration-300 group-hover:rotate-[-4deg] group-hover:scale-110 group-hover:bg-signal-400 group-hover:text-ink-950 motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-hover:rotate-0">
                <IconByName name={service.icon || 'truck'} className="size-6" />
              </span>
            </span>
            <h3 className="mt-5 text-2xl font-bold">{service.title}</h3>
            <span className="mt-3 block h-0.5 w-10 rounded-full bg-signal-400 transition-[width] duration-500 ease-out group-hover:w-24 motion-reduce:transition-none" aria-hidden="true" />
            <p className={cx('mt-3 flex-1 text-base', pictured ? 'text-white/90' : 'text-steel-600')}>{service.short}</p>
            {/* Same real link and text as before, styled as a compact premium button: gold border, dark translucent fill, gold on hover. */}
            <Link
              to={`${PATHS.services}/${service.slug}`}
              className={cx(
                'group/cta mt-5 inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-signal-400 px-5 text-sm font-bold tracking-wide text-white',
                'transition-[background-color,color,transform] duration-300 ease-out hover:bg-signal-400 hover:text-ink-950 focus-visible:bg-signal-400 focus-visible:text-ink-950 active:translate-y-px motion-reduce:transition-none',
                pictured ? 'bg-black/45 backdrop-blur-sm focus-visible:outline-signal-400' : 'bg-ink-900'
              )}
              aria-label={`${ctaLabel}: ${service.title}`}
            >
              {ctaLabel}
              <ArrowRight className="size-4 text-signal-400 transition-transform duration-300 group-hover/cta:translate-x-1 group-hover/cta:text-ink-950 group-focus-visible/cta:translate-x-1 group-focus-visible/cta:text-ink-950 motion-reduce:transition-none" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </Reveal>
    </li>
  );
}

export default function ServiceGrid({
  services,
  id = 'services',
  eyebrow = 'Services',
  title = 'Freight Solutions Built Around Your Shipment',
  description,
  tone = 'default',
  ctaLabel = 'Learn more',
  headingAs,
  backgroundImage,
  cardImages,
}) {
  // A Super Admin background picture (Homepage -> Services -> Section background image). If it fails to load, the built-in look returns.
  const [imageFailed, setImageFailed] = useState(false);
  if (!services?.length) return null;
  const headingId = `${id}-heading`;
  const hasImage = Boolean(backgroundImage?.url) && !imageFailed;
  const sectionTone = hasImage ? 'image' : tone;
  const background = hasImage ? (
    <>
      <img src={backgroundImage.url} alt="" loading="lazy" decoding="async" onError={() => setImageFailed(true)} className="absolute inset-0 -z-20 size-full object-cover object-center" />
      {/* Neutral black overlay (no blue tint) keeps the heading and text readable over any picture. */}
      <div className="absolute inset-0 -z-10 bg-black/50" aria-hidden="true" />
    </>
  ) : undefined;
  return (
    <SectionShell id={id} tone={sectionTone} labelledBy={headingId} background={background}>
      <style>{SERVICE_CARD_CSS}</style>
      <SectionHeading id={headingId} eyebrow={eyebrow} title={title} description={description} dark={isDarkTone(sectionTone)} as={headingAs} />
      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 lg:gap-4">
        {services.map((service, index) => (
          <ServiceCard key={service.slug} service={service} index={index} ctaLabel={ctaLabel} sectionHasImage={hasImage} imageUrl={serviceImageFor(service, cardImages)} />
        ))}
      </ul>
    </SectionShell>
  );
}
