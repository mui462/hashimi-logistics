/**
 * Public website theme. Mirrors backend/src/cms/themeAppearance.js exactly (a test compares the two). The defaults are
 * the site's neutral charcoal palette, so the website looks the same until a theme is saved. Only validated #RRGGBB
 * colours, listed presets and in-range numbers are ever turned into CSS custom properties.
 */
import { HEX_COLOR } from './navbarAppearance';

export { HEX_COLOR };

const color = (fallback) => ({ type: 'color', default: fallback });
const choice = (fallback, options) => ({ type: 'enum', default: fallback, options });
const range = (fallback, min, max) => ({ type: 'number', default: fallback, min, max });

export const THEME_APPEARANCE_SPEC = Object.freeze({
  colors: {
    accentColor: color('#D8AD54'),
    accentHoverColor: color('#C49A3F'),
    darkColor: color('#1A1A1A'),
    darkestColor: color('#111111'),
    darkRaisedColor: color('#262626'),
    darkBorderColor: color('#3A3A3A'),
    surfaceColor: color('#FFFFFF'),
    mutedSurfaceColor: color('#F5F5F4'),
    borderColor: color('#D6D6D4'),
    mutedTextColor: color('#4A4A4A'),
  },
  layout: {
    contentWidth: choice('standard', ['narrow', 'standard', 'wide']),
    cornerRadius: choice('sharp', ['sharp', 'soft', 'rounded']),
  },
  motion: {
    preset: choice('standard', ['off', 'subtle', 'standard']),
    durationMs: range(600, 200, 1000),
    staggerMs: range(80, 0, 150),
  },
});

export function isValidThemeValue(field, value) {
  if (field.type === 'color') return typeof value === 'string' && HEX_COLOR.test(value);
  if (field.type === 'enum') return field.options.includes(value);
  return Number.isInteger(value) && value >= field.min && value <= field.max;
}

const groups = () => Object.entries(THEME_APPEARANCE_SPEC);

export const DEFAULT_THEME_APPEARANCE = Object.freeze(
  Object.fromEntries(groups().map(([group, fields]) => [group, Object.freeze(Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.default])))]))
);

export function resolveThemeAppearance(stored) {
  return Object.fromEntries(
    groups().map(([group, fields]) => [
      group,
      Object.fromEntries(
        Object.entries(fields).map(([key, field]) => {
          const value = stored?.[group]?.[key];
          if (!isValidThemeValue(field, value)) return [key, field.default];
          return [key, field.type === 'color' ? value.toUpperCase() : value];
        })
      ),
    ])
  );
}

const CONTENT_WIDTHS = { narrow: '72rem', standard: '80rem', wide: '90rem' };
// sharp = the current look (square cards, 6px buttons).
const RADII = { sharp: { card: '0px', button: '0.375rem' }, soft: { card: '0.5rem', button: '0.5rem' }, rounded: { card: '1rem', button: '0.75rem' } };
// The reveal animation's travel and starting opacity per preset; "off" shows everything at once.
const MOTION = { off: { distance: '0px', opacity: '1' }, subtle: { distance: '8px', opacity: '0' }, standard: { distance: '16px', opacity: '0' } };
const BASE_STAGGER_MS = 80; // Reveal's built-in stagger step; the saved stagger scales it.

/**
 * CSS custom properties for the public website. They override the design tokens the existing classes already use
 * (bg-ink-950, text-steel-600, bg-signal-400...), so no component needs per-theme code. Applied on the public layout
 * only; the portals and the admin panel keep the default palette.
 */
export function themeCssVars(input) {
  const t = resolveThemeAppearance(input);
  const radius = RADII[t.layout.cornerRadius];
  const motion = MOTION[t.motion.preset];
  const off = t.motion.preset === 'off';
  return {
    '--color-signal-400': t.colors.accentColor,
    '--color-signal-500': t.colors.accentHoverColor,
    '--color-ink-900': t.colors.darkColor,
    '--color-ink-950': t.colors.darkestColor,
    '--color-ink-800': t.colors.darkRaisedColor,
    '--color-ink-700': t.colors.darkBorderColor,
    '--color-surface': t.colors.surfaceColor,
    '--color-steel-50': t.colors.mutedSurfaceColor,
    '--color-steel-200': t.colors.borderColor,
    '--color-steel-600': t.colors.mutedTextColor,
    '--site-content-width': CONTENT_WIDTHS[t.layout.contentWidth],
    '--site-card-radius': radius.card,
    '--site-button-radius': radius.button,
    '--reveal-duration': off ? '0ms' : `${t.motion.durationMs}ms`,
    '--reveal-distance': motion.distance,
    '--reveal-start-opacity': motion.opacity,
    '--reveal-stagger-scale': off ? '0' : String(t.motion.staggerMs / BASE_STAGGER_MS),
  };
}
