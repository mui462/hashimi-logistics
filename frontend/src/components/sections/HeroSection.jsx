import { cx } from '../../utils/cx';
import Button from '../common/Button';
import Container from '../common/Container';
import HeroMedia from '../media/HeroMedia';
import Breadcrumbs from '../common/Breadcrumbs';

// Home hero overlay when no CMS homepage has been saved: neutral black, light enough to keep the media clearly visible.
// A saved CMS overlay (Website CMS -> Homepage) always wins, including switching it off.
const DEFAULT_HOME_OVERLAY = { color: '#000000', opacity: 0.3 };
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function resolveOverlay(overlay, isHome) {
  if (overlay === undefined) return isHome ? DEFAULT_HOME_OVERLAY : null;
  if (!overlay || overlay.enabled === false) return null;
  const opacity = Number(overlay.opacity);
  return {
    color: HEX.test(overlay.color ?? '') ? overlay.color : DEFAULT_HOME_OVERLAY.color,
    opacity: Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : DEFAULT_HOME_OVERLAY.opacity,
  };
}

// Home hero motion: a slow cinematic push-in on the picture, a soft light sweep, text that rises in one line at a time and a
// scroll cue. All of it is switched off for visitors who prefer reduced motion, which leaves the plain hero.
const HOME_HERO_CSS = `
@media (prefers-reduced-motion: no-preference){
  .hero-kb{animation:hero-kb 26s ease-in-out infinite alternate;will-change:transform}
  .hero-sweep{animation:hero-sweep 11s ease-in-out infinite}
  .hero-rise{animation:hero-rise .9s cubic-bezier(.22,.61,.36,1) both}
  .hero-line{transform-origin:left;animation:hero-line 1s .2s cubic-bezier(.22,.61,.36,1) both}
  .hero-cue-dot{animation:hero-cue 1.8s ease-in-out infinite}
}
@keyframes hero-kb{from{transform:scale(1) translate3d(0,0,0)}to{transform:scale(1.09) translate3d(-1.2%,-1%,0)}}
@keyframes hero-sweep{0%{transform:translateX(-60%);opacity:0}30%{opacity:1}70%{opacity:1}100%{transform:translateX(160%);opacity:0}}
@keyframes hero-rise{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
@keyframes hero-line{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes hero-cue{0%{opacity:0;transform:translateY(0)}30%{opacity:1}100%{opacity:0;transform:translateY(14px)}}
`;

// Prop-driven hero. `variant="home"` is the full cinematic hero; `variant="page"` is the compact
// inner-page hero. Both sit under the transparent fixed navbar, so they reserve space for it.
// `actions`: [{ label, to?, href?, variant? }].
export default function HeroSection({
  variant = 'page',
  eyebrow,
  title: titleProp,
  subtitle,
  description: descriptionProp,
  actions = [],
  scene = 'highway',
  media: mediaProp,
  overlay,
  cms,
  breadcrumbs,
  children,
}) {
  // A published CMS page may replace the banner heading, subtitle and picture; anything it leaves empty keeps the built-in value.
  const title = cms?.heroHeading?.trim() || titleProp;
  const description = cms?.heroSubtitle?.trim() || descriptionProp;
  const media = cms?.heroImage?.url ? { videoSrc: '', posterSrc: cms.heroImage.url, posterAlt: cms.heroImage.altText ?? '' } : mediaProp;
  const isHome = variant === 'home';
  const activeOverlay = resolveOverlay(overlay, isHome);

  return (
    <section
      data-surface="dark"
      data-hero={variant}
      className={cx(
        'relative isolate overflow-hidden text-white',
        // The home hero sits under the one-row navbar (4.5rem); its black ground only shows while the media loads.
        isHome ? 'min-h-[min(100svh,880px)] bg-black pt-28 lg:pt-32 xl:pt-44' : 'bg-ink-950 pt-28 lg:pt-44 xl:pt-48'
      )}
    >
      {isHome && <style>{HOME_HERO_CSS}</style>}
      {isHome ? (
        <div className="hero-kb absolute inset-0">
          <HeroMedia scene={scene} media={media} />
        </div>
      ) : (
        <HeroMedia scene={scene} media={media} />
      )}
      {activeOverlay && <div className="absolute inset-0" style={{ backgroundColor: activeOverlay.color, opacity: activeOverlay.opacity }} aria-hidden="true" data-testid="hero-overlay" />}
      {isHome && (
        <>
          {/* Neutral depth only (no tint): a darker bottom edge for the content and soft corner vignette, plus a faint moving light sweep. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/25" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.45)_100%)]" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="hero-sweep absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
          </div>
        </>
      )}
      {/* The home hero uses only the neutral overlay above (no tinted layers); inner pages keep their own scrim. */}
      {!isHome && (
        <>
          <div className="absolute inset-0 bg-ink-950/85 lg:bg-gradient-to-r lg:from-ink-950/95 lg:via-ink-950/60 lg:to-transparent" aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink-950/50 to-transparent" aria-hidden="true" />
        </>
      )}
      <Container className={cx('relative flex flex-col justify-center', isHome ? 'min-h-[calc(min(100svh,880px)-7rem)] pb-16 lg:min-h-[calc(min(100svh,880px)-8rem)]' : 'pb-14 sm:pb-20')}>
        <div className={cx('max-w-3xl', isHome && '[text-shadow:0_2px_12px_rgb(0_0_0/0.75),0_1px_2px_rgb(0_0_0/0.6)]')}>
          {breadcrumbs && <Breadcrumbs items={breadcrumbs} dark />}
          {eyebrow && (
            <p className={cx('mb-4 flex items-center gap-3 text-base font-bold uppercase tracking-widest', isHome ? 'hero-rise text-[#ffc233]' : 'text-signal-400')}>
              <span className={cx('h-1 w-8', isHome ? 'hero-line bg-[#f2a900]' : 'bg-signal-500')} aria-hidden="true" />
              {eyebrow}
            </p>
          )}
          <h1 className={cx('font-extrabold text-balance break-words', isHome ? 'hero-rise text-4xl sm:text-5xl lg:text-6xl' : 'text-4xl sm:text-5xl')} style={isHome ? { animationDelay: '.15s' } : undefined}>{title}</h1>
          {subtitle && <p style={isHome ? { animationDelay: '.3s' } : undefined} className={cx('mt-5 font-semibold', isHome ? 'hero-rise text-xl text-[#ffc233] sm:text-2xl' : 'text-lg text-signal-400 sm:text-xl')}>{subtitle}</p>}
          {description && <p style={isHome ? { animationDelay: '.45s' } : undefined} className={cx('mt-4 max-w-2xl', isHome ? 'hero-rise text-lg text-white/90 sm:text-xl' : 'text-lg text-steel-200')}>{description}</p>}
          {actions.length > 0 && (
            <div className={cx('mt-8 flex flex-col gap-3 sm:flex-row', isHome && 'hero-rise')} style={isHome ? { animationDelay: '.6s' } : undefined}>
              {actions.map((action) => (
                <Button
                  key={action.label}
                  to={action.to}
                  href={action.href}
                  tone="dark"
                  size="lg"
                  variant={action.variant || 'primary'}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
          {children}
        </div>
      </Container>
      {isHome && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 hidden justify-center sm:flex" aria-hidden="true">
          <span className="flex h-10 w-6 justify-center rounded-full border-2 border-white/60 pt-2"><span className="hero-cue-dot block h-2 w-1 rounded-full bg-[#ffc233]" /></span>
        </div>
      )}
      <div className="lane-rule relative" style={isHome ? { '--color-signal-400': '#ffc233' } : undefined} aria-hidden="true" />
    </section>
  );
}
