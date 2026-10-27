import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, X } from 'lucide-react';
import { CONSENT_CATEGORIES, NECESSARY_COPY } from '../../config/consent';
import { PATHS } from '../../config/paths';
import { useConsent } from '../../context/ConsentContext';
import { cx } from '../../utils/cx';
import { registerBanner } from '../../utils/consentStore';

/**
 * Cookie consent card for the whole website, shown full-page over a dimmed backdrop.
 *
 * - Shown on every page load and reload until the visitor presses Reject all, Accept all or Save choices, even when an earlier
 *   choice is already saved (that choice keeps deciding which optional cookies are on until they answer again).
 * - "Cookie settings" in the footer reopens it with the current choices; its X and Escape close it without changing anything.
 * Rejecting is exactly as easy as accepting and nothing optional is pre-selected.
 */
export default function CookieBanner() {
  const consent = useConsent();
  const present = Boolean(consent);

  // Tells the consent store a banner exists, so an action never waits for one that is not on the page.
  useEffect(() => (present ? registerBanner() : undefined), [present]);

  if (!consent || !(consent.needsChoice || consent.settingsOpen)) return null;
  return <Panel consent={consent} />;
}

const PILL = 'inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-5 text-base font-bold transition duration-200 hover:-translate-y-px active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0';

function Panel({ consent }) {
  const reopened = consent.settingsOpen;
  const [showDetails, setShowDetails] = useState(reopened);
  const [draft, setDraft] = useState(() => ({ ...consent.choices }));
  const panelRef = useRef(null);

  // Full-page and modal: the page behind cannot be scrolled or reached with the keyboard until a choice is made.
  // Focus moves into the card and goes back to where it was afterwards.
  useEffect(() => {
    const opener = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      // Escape only closes the card reopened from "Cookie settings"; the first-time card needs a button press.
      if (event.key === 'Escape' && reopened) consent.closeSettings();
      if (event.key !== 'Tab' || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!panelRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [reopened, consent]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink-950/80 p-4 backdrop-blur-sm">
    <section
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-title"
      aria-describedby="cookie-description"
      className="consent-rise my-auto w-full max-w-lg overflow-hidden rounded-2xl border border-steel-200 bg-white text-ink-900 shadow-[0_28px_70px_-18px_rgb(0_0_0/0.55)] outline-none"
    >
      <div className="h-1.5 bg-gradient-to-r from-signal-400 via-signal-500 to-signal-400" aria-hidden="true" />
      <div className="relative p-6 sm:p-8">
        {reopened && (
          <button
            type="button"
            onClick={consent.closeSettings}
            aria-label="Close cookie settings"
            className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-full text-steel-600 transition-colors hover:bg-steel-100 hover:text-ink-950"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        )}

        <div className="flex items-start gap-4 pr-9">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-signal-400/20 text-signal-500" aria-hidden="true">
            <Cookie className="size-6" />
          </span>
          <div>
            <h2 id="cookie-title" className="text-lg font-extrabold leading-tight">Cookie preferences</h2>
            <p id="cookie-description" className="mt-1 text-sm leading-relaxed text-steel-600">
              Strictly necessary cookies keep the website working and you signed in. Optional analytics and marketing
              cookies stay off unless you allow them. Change this any time under <strong>Cookie settings</strong> in the footer.{' '}
              <Link to={PATHS.privacy} className="font-semibold text-ink-900 underline underline-offset-4 hover:text-ink-950">Privacy Policy</Link>
            </p>
          </div>
        </div>

        {consent.required && (
          <p role="status" className="mt-4 rounded-xl border border-signal-400/50 bg-signal-400/15 px-3 py-2 text-sm font-semibold">
            Please choose an option to continue.
          </p>
        )}

        {showDetails ? (
          <form className="mt-4" onSubmit={(event) => { event.preventDefault(); consent.save(draft); }}>
            <fieldset className="space-y-2">
              <legend className="sr-only">Cookie categories</legend>
              <Toggle id="cookie-necessary" title={NECESSARY_COPY.title} description={NECESSARY_COPY.description} checked disabled />
              {CONSENT_CATEGORIES.map((category) => (
                <Toggle
                  key={category.key}
                  id={`cookie-${category.key}`}
                  title={category.title}
                  description={category.description}
                  checked={draft[category.key] === true}
                  onChange={(event) => setDraft((current) => ({ ...current, [category.key]: event.target.checked }))}
                />
              ))}
            </fieldset>
            {consent.status === 'gpc' && (
              <p className="mt-3 text-sm text-steel-600">Your browser sends a Global Privacy Control signal, so optional cookies are off unless you turn them on here.</p>
            )}
            <button type="submit" className={cx(PILL, 'mt-4 w-full bg-ink-900 text-white hover:bg-ink-800')}>Save choices</button>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={consent.rejectAll} className={cx(PILL, 'border-2 border-ink-900 bg-white text-ink-900 hover:bg-steel-50')}>Reject all</button>
              <button type="button" onClick={consent.acceptAll} className={cx(PILL, 'border-2 border-ink-900 bg-white text-ink-900 hover:bg-steel-50')}>Accept all</button>
            </div>
          </form>
        ) : (
          <div className="mt-4">
            <div className="flex gap-2">
              <button type="button" onClick={consent.rejectAll} className={cx(PILL, 'bg-ink-900 text-white shadow-[0_8px_18px_-8px_rgb(0_0_0/0.7)] hover:bg-ink-800')}>Reject all</button>
              <button type="button" onClick={consent.acceptAll} className={cx(PILL, 'bg-signal-400 text-ink-950 shadow-[0_8px_18px_-8px_rgb(196_154_63/0.95)] hover:bg-signal-500')}>Accept all</button>
            </div>
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="mx-auto mt-2 flex min-h-10 items-center justify-center px-3 text-base font-semibold text-ink-900 underline underline-offset-4 hover:text-ink-950"
            >
              Customize
            </button>
          </div>
        )}
      </div>
    </section>
    </div>
  );
}

function Toggle({ id, title, description, checked, disabled, onChange }) {
  return (
    <label
      htmlFor={id}
      className={cx(
        'flex items-start gap-3 rounded-xl border border-steel-200 bg-steel-50 p-3 transition-colors',
        disabled ? 'cursor-default' : 'cursor-pointer hover:border-signal-400'
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}{disabled && <span className="text-sm font-normal text-steel-600"> (always on)</span>}</span>
        <span className="mt-0.5 block text-sm leading-snug text-steel-600">{description}</span>
      </span>
      <span className="relative mt-0.5 shrink-0">
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} readOnly={disabled} className="peer sr-only" />
        <span className="block h-6 w-11 rounded-full bg-steel-300 transition-colors peer-checked:bg-ink-900 peer-disabled:opacity-60 peer-focus-visible:ring-2 peer-focus-visible:ring-focus peer-focus-visible:ring-offset-2" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5 motion-reduce:transition-none" />
      </span>
    </label>
  );
}
