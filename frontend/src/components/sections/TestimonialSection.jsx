import { useSectionAppearance } from '../../config/sectionAppearance';
import Reveal, { staggerDelay } from '../common/Reveal';
import SectionHeading from '../common/SectionHeading';
import EmptyState from '../common/EmptyState';
import SectionShell from './SectionShell';

// Renders approved testimonials only. With none, the section is hidden (default) or shows an
// honest empty state when `showEmpty` is set. Never ships placeholder quotes.
export default function TestimonialSection({ testimonials = [], id = 'testimonials', title = 'What Our Customers Say', showEmpty = false, headingAs }) {
  const { cardStyle } = useSectionAppearance();
  if (!testimonials.length) {
    if (!showEmpty) return null;
    return (
      <SectionShell id={id} tone="muted" labelledBy={`${id}-heading`}>
        <SectionHeading id={`${id}-heading`} title={title} as={headingAs} />
        <EmptyState title="No testimonials published yet" description="Customer testimonials will appear here once they are approved." />
      </SectionShell>
    );
  }
  const headingId = `${id}-heading`;
  return (
    <SectionShell id={id} tone="muted" labelledBy={headingId}>
      <SectionHeading id={headingId} eyebrow="Testimonials" title={title} as={headingAs} />
      <ul className="grid gap-6 md:grid-cols-3">
        {testimonials.map((item, index) => (
          <li key={item.id || item.name}>
            <Reveal className="h-full" delay={staggerDelay(index, 3)}>
            <figure className={`h-full border-t-4 border-t-signal-500 p-6 ${cardStyle === 'glass' ? 'glass-card' : 'rounded-[var(--site-card-radius,0px)] border border-steel-200 bg-white'}`}>
              <blockquote className="text-lg">“{item.quote}”</blockquote>
              <figcaption className="mt-4 text-base font-bold">
                {item.name}
                {(item.role || item.company) && (
                  <span className="block font-normal text-steel-600">{[item.role, item.company].filter(Boolean).join(', ')}</span>
                )}
              </figcaption>
            </figure>
            </Reveal>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
