import { useState } from 'react';
import Reveal, { staggerDelay } from '../common/Reveal';
import Container from '../common/Container';
import IconByName from '../common/IconByName';
import { cx } from '../../utils/cx';

// A white section with four transparent cards (faint brand-gold tint, hairline gold border), spaced from the hero by the
// section's top padding; the services section supplies the gap below. A card may carry its own background picture
// (Homepage -> Trust strip -> card -> Card background picture): it then shows the picture under a dark overlay with white
// text. If that picture fails to load, the card falls back to the transparent look.
export function TrustCard({ item, titleAs: Title = 'p' }) {
  const [imageFailed, setImageFailed] = useState(false);
  const pictured = Boolean(item.image?.url) && !imageFailed;
  return (
    <div
      data-surface={pictured ? 'dark' : undefined}
      className={cx(
        'group relative isolate flex h-full items-center gap-4 overflow-hidden rounded-2xl border p-5 transition duration-300 hover:-translate-y-1 lg:flex-col lg:items-start lg:gap-5 lg:p-7',
        pictured
          ? 'border-white/15 shadow-[0_20px_40px_-20px_rgb(0_0_0/0.8)] hover:border-signal-400/70 lg:min-h-[16rem] lg:justify-between'
          : 'border-signal-400/40 bg-gradient-to-br from-signal-400/15 via-signal-400/5 to-transparent backdrop-blur-sm hover:border-signal-500 hover:from-signal-400/25 hover:via-signal-400/10'
      )}
    >
      {pictured && (
        <>
          <img src={item.image.url} alt={item.image.altText || ''} loading="lazy" decoding="async" onError={() => setImageFailed(true)} className="absolute inset-0 -z-20 size-full object-cover object-center transition-transform duration-700 group-hover:scale-105" />
          {/* Neutral black overlay keeps the text readable over any picture. */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/55 to-black/35" aria-hidden="true" />
        </>
      )}
      <span className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-signal-400 to-signal-500 transition-transform duration-500 group-hover:scale-x-100" aria-hidden="true" />
      <span className={cx('flex size-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-signal-400 to-signal-500 text-ink-950 transition-transform duration-300 group-hover:scale-105', pictured ? 'shadow-[0_0_28px_rgb(216_173_84/0.55)] ring-4 ring-signal-400/20' : 'shadow-[0_8px_16px_-6px_rgb(196_154_63/0.8)]')}>
        <IconByName name={item.icon} className="size-7" />
      </span>
      <div>
        <Title className={cx('text-lg font-bold leading-snug', pictured ? 'text-white drop-shadow' : 'text-ink-900')}>{item.title}</Title>
        {item.text && <p className={cx('mt-1 text-sm leading-relaxed', pictured ? 'text-steel-100/90' : 'text-steel-600')}>{item.text}</p>}
      </div>
    </div>
  );
}

export default function TrustStrip({ items, label = 'Why shippers choose Hashimi Logistics' }) {
  if (!items?.length) return null;
  return (
    <section aria-label={label} className="bg-white pt-12 sm:pt-16 lg:pt-20">
      <Container>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {items.map((item, index) => (
            <li key={item.title}>
              <Reveal className="h-full" delay={staggerDelay(index)}>
                <TrustCard item={item} />
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
