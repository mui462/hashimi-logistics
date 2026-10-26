import { CONSENT_CATEGORIES, CONSENT_MAX_AGE_DAYS, CONSENT_STORAGE_KEY, CONSENT_VERSION } from '../config/consent';

/**
 * The visitor's cookie choices, kept in this browser only (localStorage; nothing is sent to the server).
 *
 * status: 'unset'  no valid choice yet (never answered, expired, or the categories changed): the banner is shown
 *         'saved'  the visitor chose; `choices` says what is allowed
 *         'gpc'    no choice, but the browser sends Global Privacy Control: optional categories stay off and nobody is nagged
 *
 * Optional categories are false in every state except an explicit "saved" yes. If storage is blocked the choice still applies
 * for the current page session (kept in memory).
 */
const KEYS = CONSENT_CATEGORIES.map((category) => category.key);
const DAY = 24 * 60 * 60 * 1000;

const build = (value) => Object.fromEntries(KEYS.map((key) => [key, value]));
const normalize = (choices) => Object.fromEntries(KEYS.map((key) => [key, choices?.[key] === true]));

let memory = null;
let snapshot = null;
const listeners = new Set();

function globalPrivacyControl() {
  try {
    return globalThis.navigator?.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

function readStored() {
  let record = memory;
  try {
    const raw = globalThis.localStorage?.getItem(CONSENT_STORAGE_KEY);
    if (raw) record = JSON.parse(raw);
  } catch {
    // Storage blocked or the value is not valid JSON: fall back to the in-memory choice, if any.
  }
  if (!record || record.version !== CONSENT_VERSION || typeof record.savedAt !== 'number') return null;
  if (Date.now() - record.savedAt > CONSENT_MAX_AGE_DAYS * DAY || record.savedAt > Date.now() + DAY) return null;
  return record;
}

function compute() {
  const stored = readStored();
  if (stored) return { status: 'saved', choices: normalize(stored.choices), savedAt: stored.savedAt };
  return { status: globalPrivacyControl() ? 'gpc' : 'unset', choices: build(false), savedAt: null };
}

function refresh() {
  snapshot = compute();
  listeners.forEach((listener) => listener());
}

/** A stable object until the choice changes (required by useSyncExternalStore). */
export function getConsentSnapshot() {
  snapshot ??= compute();
  return snapshot;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Another tab saved or changed the choice.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === CONSENT_STORAGE_KEY || event.key === null) refresh();
  });
}

export function saveConsent(choices) {
  const record = { version: CONSENT_VERSION, savedAt: Date.now(), choices: normalize(choices) };
  memory = record;
  try {
    globalThis.localStorage?.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage blocked: the in-memory copy above still applies to this session.
  }
  refresh();
}

export const acceptAll = () => saveConsent(build(true));
export const rejectAll = () => saveConsent(build(false));

export function clearConsent() {
  memory = null;
  try {
    globalThis.localStorage?.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // nothing to remove
  }
  refresh();
}

export const hasConsent = (category, state = getConsentSnapshot()) => state.choices[category] === true;
