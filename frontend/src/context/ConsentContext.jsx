import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore } from 'react';
import { CONSENT_CATEGORIES } from '../config/consent';
import { acceptAll, getConsentSnapshot, rejectAll, saveConsent, subscribe } from '../utils/consentStore';

const ConsentContext = createContext(null);

// Nothing is rendered or loaded on the server/prerender: treat the choice as already made and everything optional as off.
const SERVER_SNAPSHOT = { status: 'saved', choices: Object.fromEntries(CONSENT_CATEGORIES.map((category) => [category.key, false])), savedAt: null };

/** Cookie choices for the public website. `hasConsent('analytics')` is the only thing optional scripts should ask. */
export function ConsentProvider({ children }) {
  const state = useSyncExternalStore(subscribe, getConsentSnapshot, () => SERVER_SNAPSHOT);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const save = useCallback((choices) => { saveConsent(choices); setSettingsOpen(false); }, []);
  const accept = useCallback(() => { acceptAll(); setSettingsOpen(false); }, []);
  const reject = useCallback(() => { rejectAll(); setSettingsOpen(false); }, []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const value = useMemo(
    () => ({
      status: state.status,
      choices: state.choices,
      hasConsent: (category) => state.choices[category] === true,
      needsChoice: state.status === 'unset',
      settingsOpen,
      save,
      acceptAll: accept,
      rejectAll: reject,
      openSettings,
      closeSettings,
    }),
    [state, settingsOpen, save, accept, reject, openSettings, closeSettings]
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

/** Null outside the public website (portals, sign-in), where no optional cookies are ever used. */
export const useConsent = () => useContext(ConsentContext);
