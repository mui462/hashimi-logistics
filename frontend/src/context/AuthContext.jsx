import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import * as authService from '../services/authService';

export const AuthContext = createContext(null);

const LOADING = { user: null, isLoading: true };

export function AuthProvider({ children }) {
  const [session, setSession] = useState(LOADING);

  useEffect(() => {
    let isCurrent = true;

    authService
      .getCurrentUser()
      .then((user) => isCurrent && setSession({ user, isLoading: false }))
      .catch(() => isCurrent && setSession({ user: null, isLoading: false }));

    return () => {
      isCurrent = false;
    };
  }, []);

  const startSession = useCallback(async (request) => {
    const user = await request;
    setSession({ user, isLoading: false });
    return user;
  }, []);

  const value = useMemo(
    () => ({
      user: session.user,
      isLoading: session.isLoading,
      isAuthenticated: Boolean(session.user),
      login: (credentials) => startSession(authService.login(credentials)),
      adminLogin: (credentials) => startSession(authService.adminLogin(credentials)),
      register: (details) => startSession(authService.register(details)),
      googleLogin: (details) => startSession(authService.googleLogin(details)),
      googleRegister: (details) => startSession(authService.googleRegister(details)),
      // Called when the API says the session is gone (401) so protected routes send the person to sign in.
      expireSession: () => setSession({ user: null, isLoading: false }),
      logout: async () => {
        await authService.logout();
        setSession({ user: null, isLoading: false });
      },
    }),
    [session, startSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
