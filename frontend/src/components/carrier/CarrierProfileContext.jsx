import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getProfile } from '../../services/carrierService';

const CarrierProfileContext = createContext(null);

// Loads the signed-in carrier's profile once, so the sidebar, top bar and Profile page share a single request.
// A failure only means the company name is not shown; it never blocks the portal.
export function CarrierProfileProvider({ children }) {
  const [state, setState] = useState({ profile: null, error: null, isLoading: true });

  const load = useCallback(() => {
    setState((previous) => ({ ...previous, isLoading: true, error: null }));
    return getProfile()
      .then((profile) => setState({ profile, error: null, isLoading: false }))
      .catch((error) => setState((previous) => ({ ...previous, error, isLoading: false })));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo(
    () => ({ ...state, reload: load, setProfile: (profile) => setState({ profile, error: null, isLoading: false }) }),
    [state, load]
  );
  return <CarrierProfileContext.Provider value={value}>{children}</CarrierProfileContext.Provider>;
}

export function useCarrierProfile() {
  const context = useContext(CarrierProfileContext);
  if (!context) throw new Error('useCarrierProfile must be used inside CarrierProfileProvider.');
  return context;
}
