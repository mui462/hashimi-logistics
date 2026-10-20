import { imageOverrides } from '../../config/media';
import { cx } from '../../utils/cx';
import FreightScene from './FreightScene';

// Renders a real image when one is configured (by `src` or by `slot` in config/media.js),
// otherwise the illustrated freight scene. Images are lazy loaded and decoded asynchronously.
export default function MediaImage({ src, slot, alt = '', scene = 'highway', className, eager = false }) {
  const resolved = src || (slot && imageOverrides[slot]);

  if (resolved) {
    return (
      <img
        src={resolved}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className={cx('h-full w-full object-cover', className)}
      />
    );
  }

  return <FreightScene scene={scene} className={cx('h-full w-full', className)} />;
}
