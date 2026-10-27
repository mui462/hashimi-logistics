import { CONSENT_CATEGORIES, CONSENT_DISMISS_KEY, CONSENT_MAX_AGE_DAYS, CONSENT_STORAGE_KEY, CONSENT_VERSION } from '../config/consent';

/**
 * The visitor's cookie choices, kept in this browser only (localStorage; nothing is sent to the server).
 *
 * status: 'unset'  no valid choice yet (never answered, expired, or the categories changed): the banner is shown
 *         'saved'  the visitor chose; `choices` says what is allowed
 *         'gpc'    no choice, but the browser sends Global Privacy Control: optional categories stay off and nobody is nagged
 *
 * `answered` is false on every page load until a banner button is pressed, even when an earlier choice is saved: the banner shows
 * again on each visit and reload. The saved choice still decides which optional cookies are on in the meantime.
 * `dismissed` is true when the visitor closed the banner without choosing (this browser session). `gateOpen` is true while an action
 * that uses cookies is waiting for them to choose (see ensureConsentChoice).
 *
 * Optional categories are false in every state except an explicit "saved" yes. If storage is blocked the choice still applies
 * for the current page session (kept in memory).
 */
const KEYS = CONSENT_CATEGORIES.map((category) => category.key);
const DAY = 24 * 60 * 60 * 1000;

const build = (value) => Object.fromEntries(KEYS.map((key) => [key, value]));
const normalize = (choices) => Object.fromEntries(KEYS.map((key) => [key, choices?.[key] === true]));

let memory = null;
let dismissedInMemory = false;
let answeredThisLoad = false; // a banner button was pressed since this page was loaded
let snapshot = null;
let gate = null; // { promise, resolve } while an action waits for a choice
let bannerCount = 0;
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

function isDismissed() {
  try {
    if (globalThis.sessionStorage?.getItem(CONSENT_DISMISS_KEY) === '1') return true;
  } catch {
    // Storage blocked: the in-memory flag below still applies.
  }
  return dismissedInMemory;
}

function compute() {
  const extra = { dismissed: isDismissed(), gateOpen: gate !== null, answered: answeredThisLoad };
  const stored = readStored();
  if (stored) return { status: 'saved', choices: normalize(stored.choices), savedAt: stored.savedAt, ...extra };
  return { status: globalPrivacyControl() ? 'gpc' : 'unset', choices: build(false), savedAt: null, ...extra };
}

function settleGate(chosen) {
  if (!gate) return;
  const pending = gate;
  gate = null;
  pending.resolve(chosen);
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
  answeredThisLoad = true;
  try {
    globalThis.localStorage?.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage blocked: the in-memory copy above still applies to this session.
  }
  settleGate(true);
  refresh();
}

/** The visitor closed the banner without choosing. Nothing is saved; a waiting action is cancelled. */
export function dismissBanner() {
  dismissedInMemory = true;
  try {
    globalThis.sessionStorage?.setItem(CONSENT_DISMISS_KEY, '1');
  } catch {
    // Storage blocked: the in-memory flag still applies.
  }
  settleGate(false);
  refresh();
}

/** The banner component announces itself, so an action never waits for a banner that is not on the page. */
export function registerBanner() {
  bannerCount += 1;
  return () => {
    bannerCount -= 1;
    if (bannerCount === 0) {
      settleGate(false);
      refresh();
    }
  };
}

/**
 * Call before an action that uses cookies (sign in, register, send a form). Resolves true straight away when the visitor has
 * already chosen (or Global Privacy Control answered for them). Otherwise it shows the banner and resolves true once they choose,
 * or false if they close it. Several waiting actions share one banner.
 */
export function ensureConsentChoice() {
  if (getConsentSnapshot().status !== 'unset' || bannerCount === 0) return Promise.resolve(true);
  if (!gate) {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    gate = { promise, resolve };
    refresh();
  }
  return gate.promise;
}

export const acceptAll = () => saveConsent(build(true));
export const rejectAll = () => saveConsent(build(false));

export function clearConsent() {
  memory = null;
  dismissedInMemory = false;
  answeredThisLoad = false;
  try {
    globalThis.localStorage?.removeItem(CONSENT_STORAGE_KEY);
    globalThis.sessionStorage?.removeItem(CONSENT_DISMISS_KEY);
  } catch {
    // nothing to remove
  }
  settleGate(false);
  refresh();
}

export const hasConsent = (category, state = getConsentSnapshot()) => state.choices[category] === true;
