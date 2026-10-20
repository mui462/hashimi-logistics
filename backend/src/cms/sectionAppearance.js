/**
 * Homepage section appearance presets (Website CMS -> Homepage, per section). Named presets only; each section accepts
 * only the options its component can render safely (for example the FAQ keeps a light background because its text is
 * dark). "default" always means "the section's built-in look", so an unsaved section changes nothing.
 *
 * frontend/src/config/sectionAppearance.js mirrors this (a test keeps the two identical).
 */

export const SECTION_BACKGROUNDS = Object.freeze(['default', 'light', 'muted', 'dark', 'glass']);
export const SECTION_SPACINGS = Object.freeze(['compact', 'standard', 'spacious']);
export const SECTION_ANIMATIONS = Object.freeze(['default', 'none', 'fade', 'up']);
export const SECTION_CARD_STYLES = Object.freeze(['default', 'glass']);

const ALL_BACKGROUNDS = SECTION_BACKGROUNDS;
const LIGHT_BACKGROUNDS = ['default', 'light', 'muted'];

/** What each stored homepage section supports. Keys are the Homepage model's section fields. */
export const SECTION_APPEARANCE_CAPABILITIES = Object.freeze({
  trust: { animation: true },
  servicesSection: { backgrounds: ALL_BACKGROUNDS, spacing: true, animation: true },
  whyChooseUs: { backgrounds: ALL_BACKGROUNDS, spacing: true, animation: true, cardStyle: true },
  howItWorks: { backgrounds: ALL_BACKGROUNDS, spacing: true, animation: true },
  industries: { backgrounds: ALL_BACKGROUNDS, spacing: true, animation: true, cardStyle: true },
  crossBorder: { spacing: true, animation: true },
  serviceAreas: { backgrounds: ALL_BACKGROUNDS, spacing: true, animation: true, cardStyle: true },
  statsSection: { spacing: true, animation: true },
  testimonials: { spacing: true, animation: true, cardStyle: true },
  faq: { backgrounds: LIGHT_BACKGROUNDS, spacing: true, animation: true },
  finalCTA: { animation: true },
});

export const DEFAULT_SECTION_APPEARANCE = Object.freeze({ background: 'default', spacing: 'standard', animation: 'default', cardStyle: 'default' });

/** The appearance a section should render with: supported, valid saved values; the default for everything else. */
export function resolveSectionAppearance(sectionKey, stored) {
  const caps = SECTION_APPEARANCE_CAPABILITIES[sectionKey] ?? {};
  const pick = (value, allowed, fallback) => (allowed && allowed.includes(value) ? value : fallback);
  return {
    background: pick(stored?.background, caps.backgrounds, DEFAULT_SECTION_APPEARANCE.background),
    spacing: pick(stored?.spacing, caps.spacing ? SECTION_SPACINGS : null, DEFAULT_SECTION_APPEARANCE.spacing),
    animation: pick(stored?.animation, caps.animation ? SECTION_ANIMATIONS : null, DEFAULT_SECTION_APPEARANCE.animation),
    cardStyle: pick(stored?.cardStyle, caps.cardStyle ? SECTION_CARD_STYLES : null, DEFAULT_SECTION_APPEARANCE.cardStyle),
  };
}
