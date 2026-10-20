import { isIanaTimezone } from '../models/helpers/fields.js';

/**
 * Wall-clock times are only meaningful together with an IANA timezone ("America/Chicago", "Asia/Karachi").
 * The server never assumes a timezone: callers must name the zone of the facility, and the stored instant is UTC.
 */

export const isValidTimeZone = isIanaTimezone;

const formatters = new Map();
function formatterFor(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    );
  }
  return formatters.get(timeZone);
}

function wallClockParts(date, timeZone) {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Offset (ms) of `timeZone` from UTC at the given instant: positive east of Greenwich. */
function offsetMs(date, timeZone) {
  const p = wallClockParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** True for "YYYY-MM-DDTHH:mm[:ss]" with no offset: a wall-clock time that needs a timezone. */
export const isLocalDateTime = (value) => typeof value === 'string' && LOCAL_PATTERN.test(value);

/**
 * Converts a wall-clock time in `timeZone` to the UTC instant. Returns null when the text is not a real calendar time
 * (for example 2026-02-30). Times skipped by a DST jump resolve forward, as most calendars do.
 */
export function zonedLocalToUtc(local, timeZone) {
  const match = LOCAL_PATTERN.exec(local);
  if (!match || !isValidTimeZone(timeZone)) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? 0));
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(guess);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  const first = guess - offsetMs(new Date(guess), timeZone);
  const second_ = guess - offsetMs(new Date(first), timeZone);
  // If the refined instant does not read back as the requested wall-clock time, the time falls in a DST gap: use the
  // first estimate, which lands just after the jump.
  const p = wallClockParts(new Date(second_), timeZone);
  const readsBack = p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute;
  return new Date(readsBack ? second_ : first);
}

/** "2026-11-03 09:00" for the instant as seen on a wall clock in `timeZone`. */
export function formatInZone(date, timeZone) {
  if (!date || !isValidTimeZone(timeZone)) return null;
  const p = wallClockParts(new Date(date), timeZone);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}
