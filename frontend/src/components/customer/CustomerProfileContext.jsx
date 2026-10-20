import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getProfile } from '../../services/customerService';

const CustomerProfileContext = createContext(null);

// Loads the signed-in customer's profile once, so the sidebar, top bar and Profile page share a single request.
// A failure only means the company name is not shown; it never blocks the portal.
export function CustomerProfileProvider({ children }) {
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
  return <CustomerProfileContext.Provider value={value}>{children}</CustomerProfileContext.Provider>;
}

export function useCustomerProfile() {
  const context = useContext(CustomerProfileContext);
  if (!context) throw new Error('useCustomerProfile must be used inside CustomerProfileProvider.');
  return context;
}
