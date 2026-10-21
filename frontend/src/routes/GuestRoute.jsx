import { useRef } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import LoadingState from '../components/common/LoadingState';
import { ACCOUNT_TYPES } from '../config/constants';
import { PATHS, ROLE_HOME_PATHS } from '../config/paths';
import { useAuth } from '../hooks/useAuth';

const PORTAL_ROLES = { customer: ACCOUNT_TYPES.CUSTOMER, carrier: ACCOUNT_TYPES.CARRIER };

/** The account type a sign-in or register page is for; null when the page is not specific to one. */
function requestedRole(pathname, params) {
  if (pathname === PATHS.adminLogin) return ACCOUNT_TYPES.SUPER_ADMIN;
  const kind = pathname === PATHS.register ? params.get('type') : pathname === PATHS.login ? params.get('portal') : null;
  return Object.hasOwn(PORTAL_ROLES, kind ?? '') ? PORTAL_ROLES[kind] : null;
}

export default function GuestRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  // Was someone already signed in when this page opened? A person who signs in on this very page must still be sent to their dashboard.
  const alreadySignedIn = useRef(null);
  if (!isLoading) {
    if (alreadySignedIn.current === null) alreadySignedIn.current = Boolean(user);
    else if (!user) alreadySignedIn.current = false;
  }

  if (isLoading) {
    return <LoadingState label="Checking your session" fullPage />;
  }
  if (user) {
    // The browser is signed in as another kind of account (the Super Admin, while a customer or carrier opens their own sign-in):
    // show the sign-in form they asked for. Signing in there replaces the session and then lands on the right dashboard.
    const wanted = requestedRole(location.pathname, params);
    if (alreadySignedIn.current && wanted && wanted !== user.role) return <Outlet />;
    const home = ROLE_HOME_PATHS[user.role];
    const requestedPath = location.state?.from?.pathname;
    const destination = requestedPath?.startsWith(home) ? requestedPath : home;
    return <Navigate to={destination} replace />;
  }
  return <Outlet />;
}
