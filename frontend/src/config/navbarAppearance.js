/**
 * Public navbar appearance. Mirrors backend/src/cms/navbarAppearance.js exactly (a test compares the two): the same groups,
 * fields, limits and approved defaults. The website renders these defaults whenever the saved settings are missing,
 * malformed or cannot be loaded, and only ever turns validated #RRGGBB colours and in-range numbers into CSS values.
 */

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const color = (fallback) => ({ type: 'color', default: fallback });
const range = (fallback, min, max) => ({ type: 'number', default: fallback, min, max });
const flag = (fallback) => ({ type: 'boolean', default: fallback });

const button = (defaults) => ({
  textColor: color(defaults.textColor),
  backgroundColor: color(defaults.backgroundColor),
  backgroundOpacity: range(defaults.backgroundOpacity, 0, 100),
  borderColor: color(defaults.borderColor),
  hoverTextColor: color(defaults.hoverTextColor),
  hoverBackgroundColor: color(defaults.hoverBackgroundColor),
  hoverBackgroundOpacity: range(defaults.hoverBackgroundOpacity, 0, 100),
});

export const NAVBAR_APPEARANCE_SPEC = Object.freeze({
  // A solid graphite bar at every scroll position: clean and professional, readable over any section.
  hero: {
    transparentEnabled: flag(false),
    backgroundColor: color('#22252A'),
    backgroundOpacity: range(100, 0, 100),
    textColor: color('#FFFFFF'),
    iconColor: color('#FFFFFF'),
    borderColor: color('#3A3F46'),
    borderOpacity: range(100, 0, 100),
    blur: range(0, 0, 20),
    shadow: flag(true),
  },
  scrolled: {
    solidEnabled: flag(true),
    backgroundColor: color('#22252A'),
    textColor: color('#FFFFFF'),
    iconColor: color('#FFFFFF'),
    borderColor: color('#3A3F46'),
    shadow: flag(true),
    transitionMs: range(300, 0, 1000),
    scrollThreshold: range(24, 0, 400),
  },
  links: {
    hoverColor: color('#E6C27A'),
    activeColor: color('#E6C27A'),
    dropdownBackgroundColor: color('#22252A'),
    dropdownTextColor: color('#D5D8DC'),
    dropdownHoverBackgroundColor: color('#2E3238'),
    dropdownHoverTextColor: color('#FFFFFF'),
  },
  trackButton: button({ textColor: '#FFFFFF', backgroundColor: '#D8AD54', backgroundOpacity: 0, borderColor: '#D8AD54', hoverTextColor: '#111111', hoverBackgroundColor: '#D8AD54', hoverBackgroundOpacity: 100 }),
  quoteButton: button({ textColor: '#111111', backgroundColor: '#D8AD54', backgroundOpacity: 100, borderColor: '#D8AD54', hoverTextColor: '#111111', hoverBackgroundColor: '#E6C27A', hoverBackgroundOpacity: 100 }),
});

/**
 * Earlier defaults (white, black glass, bronze, amber, slate). A saved value that still equals one of these was never
 * customised (it is a copy of an old default), so it is upgraded to the current default. Anything else the admin chose is kept.
 */
const PREVIOUS_DEFAULTS = Object.freeze({
  hero: { transparentEnabled: [true], backgroundColor: ['#FFFFFF', '#111111', '#7A5810', '#000000', '#26221C', '#2E2410'], backgroundOpacity: [64, 62, 58, 52, 45, 40, 35, 32, 0], textColor: ['#111111'], iconColor: ['#111111'], borderColor: ['#E5E5E5', '#FFFFFF', '#FFE3A0', '#D8AD54', '#E6C27A'], borderOpacity: [38, 30, 28, 20, 14, 12, 0], blur: [20, 16, 14, 12, 8], shadow: [false] },
  scrolled: { backgroundColor: ['#FFFFFF', '#111111', '#7A5810', '#1A1A1A', '#26221C', '#2A2112', '#16261F', '#3C4147'], textColor: ['#111111'], iconColor: ['#111111'], borderColor: ['#E5E5E5', '#2A2A2A', '#202020', '#9A7425', '#333333', '#3D362B', '#4A3A1A', '#2F4A3E', '#5A6168'] },
  links: { hoverColor: ['#8A6414', '#D8AD54', '#FFE3A0'], activeColor: ['#8A6414', '#D8AD54', '#FFE3A0'], dropdownBackgroundColor: ['#FFFFFF', '#181818', '#202020', '#6A4B0D', '#1A1A1A', '#26221C', '#2A2112'], dropdownTextColor: ['#333333', '#D0D0D0', '#F3E6C4', '#E4DCCB', '#EBDFC4'], dropdownHoverBackgroundColor: ['#F6F1E4', '#262626', '#111111', '#8A6414', '#2A2A2A', '#3A3328', '#3D3016'], dropdownHoverTextColor: ['#111111'] },
  trackButton: { textColor: ['#111111'], backgroundColor: ['#FFE3A0'], borderColor: ['#FFE3A0'], hoverTextColor: ['#3A2A08'], hoverBackgroundColor: ['#FFE3A0'] },
  quoteButton: { textColor: ['#3A2A08'], backgroundColor: ['#FFE3A0'], borderColor: ['#FFE3A0'], hoverTextColor: ['#3A2A08'], hoverBackgroundColor: ['#FFFFFF'] },
});

const isPreviousDefault = (group, key, value) => {
  const previous = PREVIOUS_DEFAULTS[group]?.[key];
  if (!previous) return false;
  return previous.some((candidate) => (typeof candidate === 'string' ? String(value).toUpperCase() === candidate : value === candidate));
};

const groups = () => Object.entries(NAVBAR_APPEARANCE_SPEC);

export function isValidValue(field, value) {
  if (field.type === 'color') return typeof value === 'string' && HEX_COLOR.test(value);
  if (field.type === 'number') return Number.isInteger(value) && value >= field.min && value <= field.max;
  return typeof value === 'boolean';
}

export const DEFAULT_NAVBAR_APPEARANCE = Object.freeze(
  Object.fromEntries(groups().map(([group, fields]) => [group, Object.freeze(Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.default])))]))
);

/** Every valid value kept, the approved default for anything missing or malformed. Never throws. */
export function resolveNavbarAppearance(stored) {
  return Object.fromEntries(
    groups().map(([group, fields]) => [
      group,
      Object.fromEntries(
        Object.entries(fields).map(([key, field]) => {
          const value = stored?.[group]?.[key];
          if (!isValidValue(field, value) || isPreviousDefault(group, key, value)) return [key, field.default];
          return [key, field.type === 'color' ? value.toUpperCase() : value];
        })
      ),
    ])
  );
}

/** "#RRGGBB" + 0-100 -> "rgba(r, g, b, a)". Inputs are validated first, so the output is always a plain colour. */
export function withOpacity(hex, percent) {
  const safe = HEX_COLOR.test(hex) ? hex : '#000000';
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(safe.slice(index, index + 2), 16));
  const alpha = Math.min(100, Math.max(0, Number(percent) || 0)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Whether the navbar shows its solid (scrolled) style. Transparent mode off = always solid; solid-on-scroll off = never by scrolling. */
export function isSolidNavbar(appearance, { scrolled, menuOpen }) {
  return !appearance.hero.transparentEnabled || menuOpen || (appearance.scrolled.solidEnabled && scrolled);
}

const SHADOW = '0 8px 24px rgba(0, 0, 0, 0.28)';

/**
 * CSS custom properties for one navbar state. Only the navbar background (and border) get the transparency, so the logo,
 * links and buttons stay fully opaque. Applied as an inline style on the header (or on a preview), never globally.
 */
export function navbarCssVars(input, solid) {
  const a = resolveNavbarAppearance(input);
  const state = solid
    ? { bg: a.scrolled.backgroundColor, text: a.scrolled.textColor, icon: a.scrolled.iconColor, border: a.scrolled.borderColor, blur: 0, shadow: a.scrolled.shadow }
    : { bg: withOpacity(a.hero.backgroundColor, a.hero.backgroundOpacity), text: a.hero.textColor, icon: a.hero.iconColor, border: withOpacity(a.hero.borderColor, a.hero.borderOpacity), blur: a.hero.blur, shadow: a.hero.shadow };
  return {
    '--nav-bg': state.bg,
    '--nav-text': state.text,
    '--nav-icon': state.icon,
    '--nav-border': state.border,
    '--nav-blur': `${state.blur}px`,
    '--nav-shadow': state.shadow ? SHADOW : 'none',
    '--nav-transition': `${a.scrolled.transitionMs}ms`,
    '--nav-link-hover': a.links.hoverColor,
    '--nav-link-active': a.links.activeColor,
    '--nav-dd-bg': a.links.dropdownBackgroundColor,
    '--nav-dd-text': a.links.dropdownTextColor,
    '--nav-dd-hover-bg': a.links.dropdownHoverBackgroundColor,
    '--nav-dd-hover-text': a.links.dropdownHoverTextColor,
    '--nav-track-text': a.trackButton.textColor,
    '--nav-track-bg': withOpacity(a.trackButton.backgroundColor, a.trackButton.backgroundOpacity),
    '--nav-track-border': a.trackButton.borderColor,
    '--nav-track-hover-text': a.trackButton.hoverTextColor,
    '--nav-track-hover-bg': withOpacity(a.trackButton.hoverBackgroundColor, a.trackButton.hoverBackgroundOpacity),
    '--nav-quote-text': a.quoteButton.textColor,
    '--nav-quote-bg': withOpacity(a.quoteButton.backgroundColor, a.quoteButton.backgroundOpacity),
    '--nav-quote-border': a.quoteButton.borderColor,
    '--nav-quote-hover-text': a.quoteButton.hoverTextColor,
    '--nav-quote-hover-bg': withOpacity(a.quoteButton.hoverBackgroundColor, a.quoteButton.hoverBackgroundOpacity),
  };
}
