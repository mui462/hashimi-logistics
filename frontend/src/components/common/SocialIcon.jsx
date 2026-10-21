import { cx } from '../../utils/cx';

// Brand marks drawn inline (the icon library has no brand logos), so they need no extra request and follow the text colour.
// `tile` is the platform's own colour; Instagram uses its gradient.
const PLATFORMS = {
  linkedin: {
    label: 'LinkedIn',
    tile: { backgroundColor: '#0A66C2' },
    glyph: <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11.5H3V9.75Zm6.5 0h3.83v1.57h.05c.53-1 1.84-2.07 3.79-2.07 4.05 0 4.8 2.66 4.8 6.12v5.88h-4v-5.2c0-1.24-.02-2.84-1.73-2.84-1.73 0-2 1.35-2 2.75v5.29h-4V9.75Z" />,
  },
  facebook: {
    label: 'Facebook',
    tile: { backgroundColor: '#1877F2' },
    glyph: <path d="M14 8.5V6.9c0-.8.2-1.4 1.4-1.4H17V2.2C16.7 2.1 15.7 2 14.6 2 12.2 2 10.5 3.5 10.5 6.2v2.3h-3v3.6h3V22H14v-9.9h2.9l.5-3.6H14Z" />,
  },
  instagram: {
    label: 'Instagram',
    tile: { backgroundImage: 'linear-gradient(45deg, #FEDA75 0%, #FA7E1E 25%, #D62976 50%, #962FBF 75%, #4F5BD5 100%)' },
    glyph: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="3.8" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="17.2" cy="6.8" r="1.2" />
      </>
    ),
  },
  x: {
    label: 'X',
    tile: { backgroundColor: '#000000' },
    glyph: <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />,
  },
  youtube: {
    label: 'YouTube',
    tile: { backgroundColor: '#FF0000' },
    glyph: <path fillRule="evenodd" d="M21.6 7.2a2.5 2.5 0 0 0-1.75-1.77C18.3 5 12 5 12 5s-6.3 0-7.85.43A2.5 2.5 0 0 0 2.4 7.2C2 8.76 2 12 2 12s0 3.24.4 4.8a2.5 2.5 0 0 0 1.75 1.77C5.7 19 12 19 12 19s6.3 0 7.85-.43a2.5 2.5 0 0 0 1.75-1.77C22 15.24 22 12 22 12s0-3.24-.4-4.8ZM10 15V9l5.2 3L10 15Z" />,
  },
  tiktok: {
    label: 'TikTok',
    tile: { backgroundColor: '#000000' },
    glyph: <path d="M16.6 2h-3.2v13.2a2.8 2.8 0 1 1-2.8-2.8c.3 0 .6 0 .8.1V9.2a6 6 0 1 0 5.2 5.9V8.6a7.4 7.4 0 0 0 4.4 1.4V6.8A4.4 4.4 0 0 1 16.6 2Z" />,
  },
};

export const SOCIAL_LABELS = Object.fromEntries(Object.entries(PLATFORMS).map(([key, value]) => [key, value.label]));

/** A platform's logo in its own colour, as a rounded tile like the contact icons. Decorative: the link next to it carries the name. */
export default function SocialIcon({ platform, className }) {
  const entry = PLATFORMS[platform];
  if (!entry) return null;
  return (
    <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-lg text-white ring-1 ring-white/20', className)} style={entry.tile} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20" className="size-5" fill="currentColor" focusable="false">{entry.glyph}</svg>
    </span>
  );
}
