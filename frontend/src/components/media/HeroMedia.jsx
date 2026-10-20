import { useEffect, useRef, useState } from 'react';
import { heroMedia } from '../../config/media';
import MediaImage from './MediaImage';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Background media for hero sections.
// - No video configured: poster image (if any) or the illustrated scene. Nothing is downloaded.
// - Video configured: poster/fallback is always painted underneath; the video fades in only once it
//   can play, and is dropped silently if it errors. Reduced-motion users get the poster only.
// The video is muted, looped, inline, and preload="metadata" so it never blocks first paint.
export default function HeroMedia({ media = heroMedia, scene = 'highway' }) {
  const { videoSrc, videoType, posterSrc, posterAlt, autoplay = true, loop = true } = media;
  const [status, setStatus] = useState('idle');
  const [reduced] = useState(prefersReducedMotion);
  const videoRef = useRef(null);
  const useVideo = Boolean(videoSrc) && autoplay && !reduced && status !== 'failed';

  useEffect(() => {
    const video = videoRef.current;
    if (video && useVideo) {
      // play() returns a promise in modern browsers; autoplay can still be refused by the browser.
      const attempt = video.play?.();
      attempt?.catch?.(() => setStatus('failed'));
    }
  }, [useVideo]);

  return (
    <div className="absolute inset-0 overflow-hidden" data-testid="hero-media" data-video-state={useVideo ? status : 'none'}>
      <MediaImage src={posterSrc} alt={posterAlt || ''} scene={scene} eager />
      {useVideo && (
        <video
          ref={videoRef}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`}
          autoPlay
          muted
          loop={loop}
          playsInline
          preload="metadata"
          poster={posterSrc || undefined}
          aria-hidden="true"
          tabIndex={-1}
          onCanPlay={() => setStatus('ready')}
          onError={() => setStatus('failed')}
        >
          <source src={videoSrc} type={videoType} onError={() => setStatus('failed')} />
        </video>
      )}
    </div>
  );
}
