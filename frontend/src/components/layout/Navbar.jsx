import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, matchPath, useLocation } from 'react-router-dom';
import { ArrowRight, ChevronDown, LogIn, Menu, ShieldCheck, Truck, User, X } from 'lucide-react';
import { brand } from '../../config/brand';
import { useSiteContent } from '../../context/SiteContentContext';
import { headerNavItems } from '../../config/navigation';
import { DEFAULT_NAVBAR_APPEARANCE, isSolidNavbar, navbarCssVars } from '../../config/navbarAppearance';
import { PATHS } from '../../config/paths';
import { cx } from '../../utils/cx';
import Container from '../common/Container';
import Logo from '../common/Logo';

const MENU_ID = 'mobile-menu';

// Navbar motion. Everything here is switched off for visitors who prefer reduced motion, leaving the plain bar.
const NAVBAR_CSS = `
@media (prefers-reduced-motion: no-preference){
  .nb-drop{animation:nb-drop .7s cubic-bezier(.22,.61,.36,1) both}
  .nb-fade{animation:nb-fade .6s cubic-bezier(.22,.61,.36,1) both}
  .nb-pop{animation:nb-pop .22s ease-out both;transform-origin:top}
  .nb-shimmer{animation:nb-shimmer 6s ease-in-out infinite}
  .nb-logo{transition:transform .35s ease}
  .nb-logo:hover{transform:scale(1.04)}
  .nb-shine::after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.55) 50%,transparent 70%);transform:translateX(-130%);transition:transform .7s ease;pointer-events:none}
  .nb-shine:hover::after,.nb-shine:focus-visible::after{transform:translateX(130%)}
}
@keyframes nb-drop{from{opacity:0;transform:translateY(-100%)}to{opacity:1;transform:none}}
@keyframes nb-fade{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
@keyframes nb-pop{from{opacity:0;transform:translateY(-6px) scale(.97)}to{opacity:1;transform:none}}
@keyframes nb-shimmer{0%{transform:translateX(-120%);opacity:0}15%{opacity:1}85%{opacity:1}100%{transform:translateX(420%);opacity:0}}
`;

// Customer and Carrier open the portal's entry step (register or sign in) on the shared portal-aware page; Super Admin opens its own page.
// The portal in the address only picks the wording; the server and every dashboard route still check the account's role.
export const LOGIN_ACTIONS = [
  { label: 'Customer Sign In', to: `${PATHS.login}?portal=customer&step=choose`, Icon: User },
  { label: 'Carrier Sign In', to: `${PATHS.login}?portal=carrier&step=choose`, Icon: Truck },
  { label: 'Super Admin Sign In', to: PATHS.adminLogin, Icon: ShieldCheck },
];

/**
 * Navbar class names. Every colour comes from a CSS custom property set by navbarCssVars() (the Super Admin's saved
 * appearance, or the approved defaults), so nothing here hard-codes a palette. Exported for the admin preview.
 */
export const NAV_STYLES = {
  header:
    'border-b [background-color:var(--nav-bg)] [border-color:var(--nav-border)] [box-shadow:var(--nav-shadow)] [backdrop-filter:blur(var(--nav-blur))] [-webkit-backdrop-filter:blur(var(--nav-blur))] [color:var(--nav-text)] transition-[background-color,border-color,box-shadow,color] [transition-duration:var(--nav-transition)] motion-reduce:transition-none',
  pill:
    'flex flex-wrap items-center justify-between rounded-[2rem] border [background-color:var(--nav-bg)] [border-color:var(--nav-border)] [box-shadow:var(--nav-shadow)] [backdrop-filter:blur(var(--nav-blur))] [-webkit-backdrop-filter:blur(var(--nav-blur))] [color:var(--nav-text)] transition-[background-color,border-color,box-shadow,color] [transition-duration:var(--nav-transition)] motion-reduce:transition-none',
  link: 'relative inline-flex min-h-11 items-center whitespace-nowrap px-3.5 text-[0.9375rem] font-semibold tracking-wide transition-colors hover:bg-white/[0.06] after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:origin-center after:scale-x-0 after:bg-[var(--nav-link-active)] after:transition-transform after:duration-300 hover:after:scale-x-100 focus-visible:after:scale-x-100 xl:min-h-[var(--nav-h)] motion-reduce:transition-none',
  linkIdle: 'border-transparent [color:var(--nav-text)] hover:[color:var(--nav-link-hover)]',
  linkActive: '[border-color:var(--nav-link-active)] [color:var(--nav-link-active)] after:scale-x-100',
  icon: '[color:var(--nav-icon)]',
  dropdown: 'nb-pop min-w-56 overflow-hidden rounded-2xl py-2 [background-color:var(--nav-dd-bg)] border [border-color:var(--nav-border)] [box-shadow:0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur-md',
  dropdownItem: 'flex min-h-11 items-center px-4 text-[0.9375rem] font-semibold [color:var(--nav-dd-text)] hover:[background-color:var(--nav-dd-hover-bg)] hover:[color:var(--nav-dd-hover-text)] focus-visible:[background-color:var(--nav-dd-hover-bg)] focus-visible:[color:var(--nav-dd-hover-text)]',
  dropdownItemActive: '[color:var(--nav-link-active)]',
  action: 'inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-full border-2 px-5 text-[0.9375rem] font-semibold tracking-wide transition-[background-color,color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(216,173,84,0.35)] active:translate-y-px motion-reduce:transition-none motion-reduce:hover:translate-y-0',
  track: '[border-color:var(--nav-track-border)] [background-color:var(--nav-track-bg)] [color:var(--nav-track-text)] hover:[background-color:var(--nav-track-hover-bg)] hover:[color:var(--nav-track-hover-text)]',
  login: '[color:var(--nav-text)] [border-color:var(--nav-border)] hover:[background-color:var(--nav-track-hover-bg)] hover:[color:var(--nav-track-hover-text)] focus-visible:[background-color:var(--nav-track-hover-bg)] focus-visible:[color:var(--nav-track-hover-text)]',
  quote: '[border-color:var(--nav-quote-border)] [background-color:var(--nav-quote-bg)] [color:var(--nav-quote-text)] hover:[background-color:var(--nav-quote-hover-bg)] hover:[color:var(--nav-quote-hover-text)]',
};

const isActivePath = (pathname, item) => Boolean(item.to && matchPath({ path: item.to, end: Boolean(item.end) }, pathname));
const groupIsActive = (pathname, item) => (item.children ?? []).some((child) => isActivePath(pathname, child));

/** Desktop dropdown (disclosure pattern): opens on click, keyboard or hover; Escape, outside clicks and leaving focus close it. */
function DesktopDropdown({ item, pathname, alignRight = false }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const listId = useId();
  const active = groupIsActive(pathname, item);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  return (
    <li
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!wrapperRef.current?.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className={cx(NAV_STYLES.link, 'gap-1', active ? NAV_STYLES.linkActive : NAV_STYLES.linkIdle)}
      >
        {item.label}
        <ChevronDown className={cx('size-4 transition-transform motion-reduce:transition-none', NAV_STYLES.icon, open && 'rotate-180')} aria-hidden="true" />
      </button>
      {/* Padding (not margin) keeps the pointer inside the hover area on the way down to the menu. */}
      <div className={cx('absolute top-full z-10 pt-2', alignRight ? 'right-0' : 'left-0', !open && 'hidden')}>
        <ul id={listId} className={NAV_STYLES.dropdown}>
          {item.children.map((child) => (
            <li key={child.to}>
              <NavLink to={child.to} className={({ isActive }) => cx(NAV_STYLES.dropdownItem, isActive && NAV_STYLES.dropdownItemActive)}>
                {child.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

/** Desktop "Sign In" disclosure listing all three account types, so no sign-in is hidden when space is tight. */
function SignInMenu({ pathname, compact = false }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const listId = useId();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!wrapperRef.current?.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button ref={buttonRef} type="button" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((value) => !value)} className={compact ? 'inline-flex items-center gap-1.5 font-semibold hover:text-signal-400' : cx(NAV_STYLES.action, NAV_STYLES.login, 'gap-2')}>
        <LogIn className={compact ? 'size-3.5 text-signal-400' : 'size-4'} aria-hidden="true" />
        Sign In
        <ChevronDown className={cx('size-4 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden="true" />
      </button>
      <div className={cx('absolute right-0 top-full z-10 pt-2', !open && 'hidden')}>
        <ul id={listId} className={NAV_STYLES.dropdown}>
          {LOGIN_ACTIONS.map(({ label, to, Icon }) => (
            <li key={label}>
              <Link to={to} className={cx(NAV_STYLES.dropdownItem, 'gap-3 whitespace-nowrap')}>
                <Icon className={cx('size-4', NAV_STYLES.icon)} aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MobileGroup({ item, pathname }) {
  const [open, setOpen] = useState(() => groupIsActive(pathname, item));
  const listId = useId();
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className={cx('flex min-h-12 w-full items-center justify-between border-l-4 px-4 text-lg font-semibold', groupIsActive(pathname, item) ? NAV_STYLES.linkActive : 'border-transparent [color:var(--nav-text)]')}
      >
        {item.label}
        <ChevronDown className={cx('size-5 transition-transform motion-reduce:transition-none', NAV_STYLES.icon, open && 'rotate-180')} aria-hidden="true" />
      </button>
      <ul id={listId} hidden={!open} className="pb-2">
        {item.children.map((child) => (
          <li key={child.to}>
            <NavLink to={child.to} className={({ isActive }) => cx('flex min-h-12 items-center pl-10 pr-4 text-base font-semibold', isActive ? NAV_STYLES.dropdownItemActive : '[color:var(--nav-text)] hover:[color:var(--nav-link-hover)]')}>
              {child.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </li>
  );
}

/**
 * Fixed public navbar in one row: logo, primary links (with the Solutions dropdown), then Track Shipment and Request a
 * Quote. It is white (#FFFFFF) by default over the hero and after scrolling; the scroll state only adds the shadow. Colours, transparency, blur, shadows, timing and the threshold come from the Super Admin's saved navbar appearance
 * (Website CMS -> Navbar appearance), falling back to the approved defaults. Below 1280px the links move into the menu.
 */
export default function Navbar({ items = headerNavItems, primaryAction: primaryProp, trackAction = { label: 'Track Shipment', to: PATHS.trackShipment } }) {
  const site = useSiteContent();
  const appearance = site?.navbarAppearance ?? DEFAULT_NAVBAR_APPEARANCE;
  // The quote button comes from the CMS header button when one is set; otherwise the built-in "Request a Quote".
  const primaryAction = primaryProp ?? site?.cta ?? { label: site?.company.primaryCta ?? brand.primaryCta, to: PATHS.requestQuote };
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  const toggleRef = useRef(null);
  const threshold = appearance.scrolled.scrollThreshold;

  useEffect(() => setIsOpen(false), [pathname]);

  // React skips the re-render when the boolean does not change, so scrolling only updates state when the threshold is crossed.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        toggleRef.current?.focus();
      }
    };
    // The page behind the open menu does not scroll; the previous value is restored when the menu closes.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  // Close the menu if the window grows past the desktop breakpoint while it is open.
  useEffect(() => {
    if (!isOpen || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(min-width: 80rem)');
    const onChange = (event) => event.matches && setIsOpen(false);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, [isOpen]);

  const solid = isSolidNavbar(appearance, { scrolled, menuOpen: isOpen });
  const quoteProps = primaryAction.href ? { href: primaryAction.href } : { to: primaryAction.to };
  const QuoteTag = primaryAction.href ? 'a' : Link;

  return (
    <header data-scrolled={solid} data-navbar-state={solid ? 'solid' : 'transparent'} style={navbarCssVars(appearance, solid)} className={cx('nb-drop fixed inset-x-0 top-0 z-50', NAV_STYLES.header)}>
      <style>{NAVBAR_CSS}</style>
      {/* Soft sheen across the top of the bar and a fine gold edge along the bottom. */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent" aria-hidden="true" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-signal-400/70 to-transparent" aria-hidden="true" />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden" aria-hidden="true">
        <span className="nb-shimmer block h-full w-1/4 bg-gradient-to-r from-transparent via-white to-transparent" />
      </span>

      {/* Top row: logo on the left, then Sign In, Track Shipment and Request a Quote. On desktop it folds away once the page scrolls, leaving the page links. */}
      <div className={cx('relative grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none', scrolled ? 'xl:grid-rows-[0fr] xl:invisible' : 'xl:grid-rows-[1fr]')}>
        <div className={cx('min-h-0 xl:border-b xl:[border-color:var(--nav-border)]', scrolled && 'xl:overflow-hidden')}>
          <Container>
            <div className="flex min-h-18 items-center justify-between gap-4 xl:min-h-[5.25rem] xl:gap-6">
              <div className="nb-logo min-w-0 xl:shrink-0">
                <Logo tone="light" name={site?.company.name} image={site?.logo} tagline={site?.company.tagline ?? brand.tagline} />
              </div>

              <div className="hidden shrink-0 items-center gap-2 xl:flex 2xl:gap-3">
                <SignInMenu pathname={pathname} />
                <Link to={trackAction.to} className={cx(NAV_STYLES.action, NAV_STYLES.track)}>
                  {trackAction.label}
                </Link>
                <QuoteTag {...quoteProps} className={cx(NAV_STYLES.action, NAV_STYLES.quote, 'nb-shine group/q relative gap-2 overflow-hidden')}>
                  {primaryAction.label}
                  <ArrowRight className="size-4 transition-transform duration-300 group-hover/q:translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
                </QuoteTag>
              </div>

              <button
                ref={toggleRef}
                type="button"
                className={cx('inline-flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-white/10 xl:hidden', NAV_STYLES.icon)}
                aria-expanded={isOpen}
                aria-controls={MENU_ID}
                aria-label={isOpen ? 'Close menu' : 'Open menu'}
                onClick={() => setIsOpen((open) => !open)}
              >
                {isOpen ? <X className="size-7" aria-hidden="true" /> : <Menu className="size-7" aria-hidden="true" />}
              </button>
            </div>
          </Container>
        </div>
      </div>

      {/* Bottom row: every page link, centred, in its own row so nothing runs out of space. */}
      <nav aria-label="Primary" className="relative hidden [--nav-h:3rem] xl:block">
        <Container>
          <ul className="flex items-center justify-center gap-x-1 2xl:gap-x-2">
            {items.map((item, index) =>
              item.children ? (
                <DesktopDropdown key={item.label} item={item} pathname={pathname} alignRight={index === items.length - 1} />
              ) : (
                <li key={item.to} className="nb-fade" style={{ animationDelay: `${300 + index * 60}ms` }}>
                  <NavLink to={item.to} end={item.end} className={({ isActive }) => cx(NAV_STYLES.link, isActive ? NAV_STYLES.linkActive : NAV_STYLES.linkIdle)}>
                    {item.label}
                  </NavLink>
                </li>
              )
            )}
          </ul>
        </Container>
      </nav>

      {isOpen && (
        <div id={MENU_ID} className="nb-pop max-h-[calc(100svh-4.5rem)] overflow-y-auto border-t [background-color:var(--nav-dd-bg)] [border-color:var(--nav-border)] xl:hidden">
          <Container className="py-4">
            <nav aria-label="Mobile">
              <ul>
                {items.map((item) =>
                  item.children ? (
                    <MobileGroup key={item.label} item={item} pathname={pathname} />
                  ) : (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) => cx('flex min-h-12 items-center border-l-4 px-4 text-lg font-semibold', isActive ? NAV_STYLES.linkActive : 'border-transparent [color:var(--nav-text)] hover:[color:var(--nav-link-hover)]')}
                      >
                        {item.label}
                      </NavLink>
                    </li>
                  )
                )}
              </ul>
            </nav>
            <div className="mt-4 grid gap-3 border-t pt-4 [border-color:var(--nav-border)]">
              <p className="text-sm font-semibold uppercase tracking-wider [color:var(--nav-link-active)]">Sign in</p>
              {LOGIN_ACTIONS.map(({ label, to, Icon }) => (
                <Link key={label} to={to} className={cx(NAV_STYLES.action, NAV_STYLES.login, 'min-h-12 gap-2 text-lg')}>
                  <Icon className="size-5" aria-hidden="true" />
                  {label}
                </Link>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <QuoteTag {...quoteProps} className={cx(NAV_STYLES.action, NAV_STYLES.quote, 'min-h-12 text-lg sm:flex-1')}>
                {primaryAction.label}
              </QuoteTag>
              <Link to={trackAction.to} className={cx(NAV_STYLES.action, NAV_STYLES.track, 'min-h-12 text-lg sm:flex-1')}>
                {trackAction.label}
              </Link>
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
