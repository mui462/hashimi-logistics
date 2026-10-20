import { Link } from 'react-router-dom';
import { brand } from '../../config/brand';
import { PATHS } from '../../config/paths';
import { cx } from '../../utils/cx';

/** `tagline` (navbar only) adds a small line under the name and switches to the larger header sizing. */
export default function Logo({ tone = 'light', to = PATHS.home, name = brand.name, image, tagline }) {
  const isDark = tone === 'dark';
  const large = Boolean(tagline);

  return (
    <Link to={to} className="inline-flex max-w-full items-center gap-3 xl:gap-4" aria-label={`${name} home`}>
      {image?.url ? (
        <img src={image.url} alt="" className={cx('w-auto shrink-0 object-contain', large ? 'h-12 max-w-[10rem] sm:h-16 sm:max-w-[13rem] xl:h-[4.75rem] xl:max-w-[16rem]' : 'h-10 max-w-[8rem]')} />
      ) : (
      // The built-in mark keeps its original brand colours (navy #11263c, gold #f2a900), whatever the site theme is.
      <svg viewBox="0 0 32 32" className={cx('shrink-0', large ? 'size-12 sm:size-16 xl:size-[4.75rem]' : 'size-10')} aria-hidden="true">
        <rect width="32" height="32" rx="6" className={isDark ? 'fill-white' : 'fill-[#11263c]'} />
        <path
          d="M8 9l7 7-7 7"
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-[#f2a900]"
        />
        <path
          d="M16 9l7 7-7 7"
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isDark ? 'stroke-[#11263c]' : 'stroke-white'}
        />
      </svg>
      )}
      <span className="flex min-w-0 flex-col">
        <span
          className={cx(
            'font-extrabold leading-tight tracking-tight',
            large ? 'text-base sm:text-lg xl:text-xl' : 'text-lg',
            tagline ? '[color:var(--nav-text,#111111)]' : isDark ? 'text-white' : 'text-ink-900'
          )}
        >
          {name}
        </span>
        {tagline && (
          <span className="mt-0.5 text-balance text-[0.5625rem] font-semibold uppercase leading-tight tracking-[0.1em] [color:var(--nav-link-active,#D8AD54)] sm:text-[0.625rem] sm:tracking-[0.12em] lg:whitespace-nowrap xl:text-[0.6875rem]">
            {tagline}
          </span>
        )}
      </span>
    </Link>
  );
}
