/**
 * Public website navbar appearance (Website CMS -> Navbar appearance). One spec drives the stored schema, the API validator
 * and the defaults, so the three can never disagree. Values are deliberately narrow: colours are #RRGGBB only and every
 * number has a range. No CSS strings, URLs or markup are ever accepted or returned.
 *
 * frontend/src/config/navbarAppearance.js mirrors this spec (a test keeps the two identical).
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

/**
 * The appearance the website should use: every stored value that is valid, the approved default for anything missing or
 * malformed. Colours are returned upper-case. Never throws, so a damaged record still yields a usable navbar.
 */
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

/** True when the resolved appearance equals the approved defaults. */
export const isDefaultAppearance = (appearance) => JSON.stringify(resolveNavbarAppearance(appearance)) === JSON.stringify(DEFAULT_NAVBAR_APPEARANCE);
