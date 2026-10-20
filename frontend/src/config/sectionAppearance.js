import { createContext, useContext } from 'react';

/**
 * Homepage section appearance presets. Mirrors backend/src/cms/sectionAppearance.js (a test compares the two).
 * "default" means the section's built-in look, so an unsaved section renders exactly as before.
 */
export const SECTION_BACKGROUNDS = Object.freeze(['default', 'light', 'muted', 'dark', 'glass']);
export const SECTION_SPACINGS = Object.freeze(['compact', 'standard', 'spacious']);
export const SECTION_ANIMATIONS = Object.freeze(['default', 'none', 'fade', 'up']);
export const SECTION_CARD_STYLES = Object.freeze(['default', 'glass']);

const ALL_BACKGROUNDS = SECTION_BACKGROUNDS;
const LIGHT_BACKGROUNDS = ['default', 'light', 'muted'];

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

/** Background preset -> SectionShell tone. "default" returns the section's own tone unchanged. */
export const toneForBackground = (background, builtInTone) => ({ light: 'default', muted: 'muted', dark: 'dark', glass: 'glass' })[background] ?? builtInTone;

/** Tones whose text is light (white headings, light body text). */
export const isDarkTone = (tone) => tone === 'dark' || tone === 'darker' || tone === 'glass' || tone === 'image';

/** The current section's appearance, for SectionShell (spacing), Reveal (animation) and cards (card style). */
export const SectionAppearanceContext = createContext(DEFAULT_SECTION_APPEARANCE);
export const useSectionAppearance = () => useContext(SectionAppearanceContext);
