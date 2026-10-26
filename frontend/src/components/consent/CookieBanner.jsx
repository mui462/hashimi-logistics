import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CONSENT_CATEGORIES, NECESSARY_COPY } from '../../config/consent';
import { PATHS } from '../../config/paths';
import { useConsent } from '../../context/ConsentContext';
import Button from '../common/Button';

/**
 * Cookie consent banner for the public website. Shown until the visitor chooses; "Cookie settings" in the footer reopens it.
 * Rejecting is exactly as easy as accepting, nothing optional is pre-selected, and closing it without choosing (Escape on a
 * reopened panel) changes nothing.
 */
export default function CookieBanner() {
  const consent = useConsent();
  if (!consent || !(consent.needsChoice || consent.settingsOpen)) return null;
  return <Panel consent={consent} />;
}

function Panel({ consent }) {
  const reopened = consent.settingsOpen;
  const [showDetails, setShowDetails] = useState(reopened);
  const [draft, setDraft] = useState(() => ({ ...consent.choices }));
  const panelRef = useRef(null);

  // Reopened from the footer: move focus into the panel, close on Escape, and give focus back to the footer button afterwards.
  useEffect(() => {
    if (!reopened) return undefined;
    const opener = document.activeElement;
    panelRef.current?.focus();
    const onKeyDown = (event) => { if (event.key === 'Escape') consent.closeSettings(); };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (opener?.isConnected) opener.focus?.();
    };
  }, [reopened]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-title"
      aria-describedby="cookie-description"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-h-[calc(100svh-1.5rem)] max-w-3xl overflow-y-auto rounded-2xl border border-steel-200 bg-white p-5 text-ink-900 shadow-[0_24px_60px_-16px_rgb(0_0_0/0.5)] outline-none sm:bottom-5 sm:p-6"
    >
      <h2 id="cookie-title" className="text-lg font-extrabold">Your cookie choices</h2>
      <p id="cookie-description" className="mt-2 text-base leading-relaxed text-steel-600">
        We use cookies that are strictly necessary for this website to work, for example to keep you signed in. With your permission
        we may also use optional analytics and marketing cookies. Optional cookies stay off unless you allow them, and you can change
        your mind at any time from <strong>Cookie settings</strong> in the footer. See our{' '}
        <Link to={PATHS.privacy} className="font-semibold underline underline-offset-4 hover:text-ink-950">Privacy Policy</Link>.
      </p>

      {showDetails ? (
        <form
          className="mt-4"
          onSubmit={(event) => { event.preventDefault(); consent.save(draft); }}
        >
          <fieldset className="space-y-3">
            <legend className="sr-only">Cookie categories</legend>
            <Category id="cookie-necessary" title={NECESSARY_COPY.title} description={NECESSARY_COPY.description} checked disabled />
            {CONSENT_CATEGORIES.map((category) => (
              <Category
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
            <p className="mt-3 text-base text-steel-600">Your browser is sending a Global Privacy Control signal, so optional cookies are off unless you turn them on here.</p>
          )}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button type="submit">Save choices</Button>
            <Button variant="secondary" onClick={consent.rejectAll}>Reject non-essential</Button>
            <Button variant="secondary" onClick={consent.acceptAll}>Accept all</Button>
          </div>
        </form>
      ) : (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button onClick={consent.rejectAll}>Reject non-essential</Button>
          <Button onClick={consent.acceptAll}>Accept all</Button>
          <Button variant="ghost" onClick={() => setShowDetails(true)} aria-expanded="false">Customize</Button>
        </div>
      )}
    </section>
  );
}

function Category({ id, title, description, checked, disabled, onChange }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-steel-200 p-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        readOnly={disabled}
        className="mt-1 size-5 shrink-0 accent-ink-900"
      />
      <label htmlFor={id} className="text-base">
        <span className="block font-bold">{title}{disabled && <span className="font-normal text-steel-600"> (always on)</span>}</span>
        <span className="block text-steel-600">{description}</span>
      </label>
    </div>
  );
}
