import { cx } from '../../utils/cx';
import MediaImage from './MediaImage';

/**
 * A picture in the site's frame: rounded corners, soft shadow and an offset gold outline. It shows `image` (or `src`) when there
 * is one, otherwise the site's illustrated freight scene, so an empty media slot is never a broken image. Pictures are only
 * cropped (object-cover); they are never changed.
 */
export default function FramedMedia({ image, src, alt, scene = 'highway', className = 'aspect-[4/3]' }) {
  const url = image?.url ?? src;
  return (
    <div className={cx('relative isolate', className)}>
      <div className="absolute -bottom-3 -right-3 -z-10 size-full rounded-3xl border-2 border-signal-400/50" aria-hidden="true" />
      <div className="size-full overflow-hidden rounded-3xl bg-ink-900 shadow-[0_24px_50px_-24px_rgb(0_0_0/0.6)] ring-1 ring-black/5">
        <MediaImage src={url} alt={image?.altText || alt || ''} scene={scene} />
      </div>
    </div>
  );
}
