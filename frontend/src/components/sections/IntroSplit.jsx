import { Check } from 'lucide-react';
import FramedMedia from '../media/FramedMedia';
import PlainText from '../common/PlainText';
import Reveal from '../common/Reveal';
import SectionHeading from '../common/SectionHeading';
import SectionShell from './SectionShell';

/**
 * Introduction block used under a page banner: eyebrow, heading and text on one side, a framed picture on the other, with an
 * optional short list of highlights. Without `media` it is a single column. `paragraphs` are plain text.
 */
export default function IntroSplit({ id, eyebrow, title, paragraphs = [], highlights = [], media, tone = 'default', headingAs }) {
  const headingId = `${id}-heading`;
  const text = paragraphs.filter(Boolean).join('\n\n');
  return (
    <SectionShell id={id} tone={tone} labelledBy={headingId}>
      <div className={media ? 'grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16' : 'max-w-4xl'}>
        <div>
          <SectionHeading id={headingId} eyebrow={eyebrow} title={title} as={headingAs} className="mb-6 sm:mb-6" />
          <Reveal delay={80}>
            <PlainText text={text} className="text-lg leading-relaxed text-steel-600" />
            {highlights.length > 0 && (
              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {highlights.map((item) => (
                  <li key={item} className="flex items-start gap-3 rounded-2xl border border-signal-400/40 bg-gradient-to-br from-signal-400/15 via-signal-400/5 to-transparent px-4 py-3 text-base font-semibold">
                    <Check className="mt-0.5 size-5 shrink-0 text-signal-500" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </Reveal>
        </div>
        {media && <Reveal variant="zoom"><FramedMedia {...media} /></Reveal>}
      </div>
    </SectionShell>
  );
}
