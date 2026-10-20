import { useSectionAppearance } from '../../config/sectionAppearance';
import { useEffect, useRef, useState } from 'react';
import { cx } from '../../utils/cx';

const MAX_DELAY_MS = 400;

/**
 * The site's one entrance animation: a short fade with a small upward move (`variant="up"`, default), a plain fade, or a
 * gentle zoom for images. One IntersectionObserver per element that stays attached, so the animation replays on every scroll in and out; no scroll listeners.
 * `delay` (ms, capped) staggers cards in a grid. Content is visible immediately when IntersectionObserver is unavailable,
 * when printing, and for visitors who prefer reduced motion (see index.css). Keep hover effects on an inner element:
 * a transition utility on the same element would replace the reveal transition.
 */
export default function Reveal({ as: Component = 'div', variant: ownVariant = 'up', delay = 0, className, style, children, ...rest }) {
  const ref = useRef(null);
  // A homepage section may override the animation (Homepage editor -> Animation: None, Fade or Up).
  const sectionAnimation = useSectionAppearance().animation;
  const variant = sectionAnimation && sectionAnimation !== 'default' ? sectionAnimation : ownVariant;
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !ref.current) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        // Follows the element in and out of view, so the entrance replays every time the visitor scrolls back to it.
        const last = entries[entries.length - 1];
        setVisible(last.isIntersecting);
      },
      { rootMargin: '0px 0px -8% 0px' }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const wait = Math.min(Math.max(0, Number(delay) || 0), MAX_DELAY_MS);
  return (
    <Component
      ref={ref}
      data-visible={visible}
      data-variant={variant}
      className={cx('reveal', className)}
      style={wait ? { ...style, '--reveal-delay': `${wait}ms` } : style}
      {...rest}
    >
      {children}
    </Component>
  );
}

/** Stagger for the n-th card of a grid: cards in one row arrive one after another, each row starts again. */
export const staggerDelay = (index, perRow = 4, step = 80) => (index % perRow) * step;
