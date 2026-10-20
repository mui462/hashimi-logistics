import { cx } from '../../utils/cx';
import Reveal from './Reveal';

export default function SectionHeading({ eyebrow, title, description, as: Heading = 'h2', dark = false, className, id }) {
  return (
    <Reveal className={cx('mb-10 max-w-3xl sm:mb-12', className)}>
      {eyebrow && (
        <p className={cx('mb-3 flex items-center gap-3 text-base font-bold uppercase tracking-widest', dark ? 'text-signal-400' : 'text-steel-600')}>
          <span className="h-1 w-8 bg-signal-500" aria-hidden="true" />
          {eyebrow}
        </p>
      )}
      <Heading id={id} className="text-3xl font-extrabold sm:text-4xl lg:text-[2.6rem]">
        {title}
      </Heading>
      {description && (
        <p className={cx('mt-4 text-lg', dark ? 'text-steel-200' : 'text-steel-600')}>{description}</p>
      )}
    </Reveal>
  );
}
