import { cx } from '../../utils/cx';
import Container from '../common/Container';
import { isDarkTone, useSectionAppearance } from '../../config/sectionAppearance';

const TONES = {
  default: 'bg-[var(--color-surface)] text-ink-900',
  muted: 'bg-steel-50 text-ink-900',
  dark: 'bg-ink-900 text-white',
  darker: 'bg-ink-950 text-white',
  // Glass: content sits on a translucent panel over the darkest surface.
  glass: 'bg-ink-950 text-white',
  // Transparent: the section's own `background` layers (picture + overlay) show through behind the content.
  image: 'bg-transparent text-white',
};

const SPACING = { compact: 'py-10 sm:py-14 lg:py-16', standard: 'py-14 sm:py-20 lg:py-24', spacious: 'py-20 sm:py-28 lg:py-32' };

// Shared section wrapper: consistent vertical rhythm, tone and labelled landmark.
export default function SectionShell({ tone = 'default', id, labelledBy, className, background, children }) {
  const dark = isDarkTone(tone);
  const { spacing } = useSectionAppearance();
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      data-surface={dark ? 'dark' : undefined}
      className={cx(TONES[tone] ?? TONES.default, SPACING[spacing] ?? SPACING.standard, background && 'relative isolate overflow-hidden', className)}
    >
      {background}
      <Container>{tone === 'glass' ? <div className="glass-panel p-6 sm:p-10">{children}</div> : children}</Container>
    </section>
  );
}
