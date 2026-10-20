import { isDarkTone } from '../../config/sectionAppearance';
import { cx } from '../../utils/cx';
import Reveal, { staggerDelay } from '../common/Reveal';
import SectionHeading from '../common/SectionHeading';
import SectionShell from './SectionShell';

// Numbered process cards, in the same style as the About page's "Our Approach".
export default function StepsSection({ steps, id = 'how-it-works', eyebrow = 'Process', title = 'How It Works', description, tone = 'default', headingAs }) {
  if (!steps?.length) return null;
  const headingId = `${id}-heading`;
  const dark = isDarkTone(tone);
  return (
    <SectionShell id={id} tone={tone} labelledBy={headingId}>
      <SectionHeading id={headingId} eyebrow={eyebrow} title={title} description={description} dark={dark} as={headingAs} />
      <ol className={cx('grid gap-5 sm:grid-cols-2', steps.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
        {steps.map((step, index) => (
          <li key={step.title} className={cx(steps.length > 4 && steps.length % 3 === 1 && index === steps.length - 1 && 'lg:col-span-3')}>
            <Reveal className="h-full" delay={staggerDelay(index, steps.length === 4 ? 4 : 3, 100)}>
              <div className={cx('group relative h-full overflow-hidden rounded-2xl border p-6 transition duration-300 hover:-translate-y-1 sm:p-7', dark ? 'border-white/15 bg-white/5 hover:border-signal-400/60' : 'border-steel-200 bg-white hover:border-signal-400 hover:shadow-[0_20px_40px_-24px_rgb(0_0_0/0.4)]')}>
                <p className={cx('text-5xl font-extrabold leading-none transition-colors duration-300', dark ? 'text-signal-400' : 'text-signal-400/60 group-hover:text-signal-500')} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className="mt-5 text-xl font-bold">
                  <span className="sr-only">Step {index + 1}: </span>
                  {step.title}
                </h3>
                <p className={cx('mt-2 text-base leading-relaxed', dark ? 'text-steel-200' : 'text-steel-600')}>{step.text}</p>
                <span className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-signal-400 to-signal-500 transition-transform duration-500 group-hover:scale-x-100" aria-hidden="true" />
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </SectionShell>
  );
}
