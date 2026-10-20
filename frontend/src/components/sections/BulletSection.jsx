import { Check } from 'lucide-react';
import { isDarkTone } from '../../config/sectionAppearance';
import { cx } from '../../utils/cx';
import Reveal, { staggerDelay } from '../common/Reveal';
import SectionHeading from '../common/SectionHeading';
import SectionShell from './SectionShell';

// Heading + checklist (What We Handle, Equipment, Requirements, Typical Freight...) shown as rounded cards with a gold check.
// `paragraphs` optional.
export default function BulletSection({ id, eyebrow, title, description, items = [], paragraphs = [], tone = 'default', columns = 2, headingAs }) {
  const headingId = `${id}-heading`;
  const dark = isDarkTone(tone);
  return (
    <SectionShell id={id} tone={tone} labelledBy={headingId}>
      <SectionHeading id={headingId} eyebrow={eyebrow} title={title} description={description} dark={dark} as={headingAs} />
      {paragraphs.map((p) => (
        <p key={p} className={cx('mb-4 max-w-3xl text-lg leading-relaxed', dark ? 'text-steel-200' : 'text-steel-600')}>
          {p}
        </p>
      ))}
      {items.length > 0 && (
        <ul className={cx('grid gap-3 sm:grid-cols-2 sm:gap-4', columns === 3 && 'lg:grid-cols-3')}>
          {items.map((item, index) => (
            <li key={item}>
              <Reveal className="h-full" delay={staggerDelay(index, 2, 60)}>
                <div className={cx('group flex h-full items-start gap-4 rounded-2xl border px-5 py-4 text-lg transition duration-300 hover:-translate-y-0.5', dark ? 'border-white/15 bg-white/5 hover:border-signal-400/60' : 'border-steel-200 bg-white hover:border-signal-400 hover:shadow-[0_16px_32px_-22px_rgb(0_0_0/0.4)]')}>
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-signal-400 to-signal-500 text-ink-950">
                    <Check className="size-4" strokeWidth={3} aria-hidden="true" />
                  </span>
                  <span>{item}</span>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}
