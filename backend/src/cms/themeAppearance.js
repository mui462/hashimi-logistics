/**
 * Public website theme (Website CMS -> Website theme). One spec drives the stored schema, the API validator and the
 * defaults. Only #RRGGBB colours, named presets and bounded whole numbers are accepted; nothing is free-form CSS.
 * The defaults are the current neutral charcoal palette, so an unsaved theme changes nothing.
 *
 * frontend/src/config/themeAppearance.js mirrors this spec (a test keeps the two identical).
 */
import { HEX_COLOR } from './navbarAppearance.js';

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

/** Valid saved values kept, the default for anything missing or malformed. Colours upper-case. Never throws. */
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

export const isDefaultTheme = (theme) => JSON.stringify(resolveThemeAppearance(theme)) === JSON.stringify(DEFAULT_THEME_APPEARANCE);
