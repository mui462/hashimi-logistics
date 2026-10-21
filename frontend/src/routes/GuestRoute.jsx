import { useRef } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import SignedInElsewhere from '../components/auth/SignedInElsewhere';
import LoadingState from '../components/common/LoadingState';
import { ACCOUNT_TYPES } from '../config/constants';
import { PATHS, ROLE_HOME_PATHS } from '../config/paths';
import { useAuth } from '../hooks/useAuth';

const PORTAL_ROLES = { customer: ACCOUNT_TYPES.CUSTOMER, carrier: ACCOUNT_TYPES.CARRIER };
const PORTAL_LABELS = { customer: 'Customer', carrier: 'Carrier' };

/** The account type a sign-in or register page is for, and how to name it; null when the page is not specific to one. */
function requestedAccount(pathname, params) {
  if (pathname === PATHS.adminLogin) return { role: ACCOUNT_TYPES.SUPER_ADMIN, label: 'Super Admin sign in' };
  const kind = pathname === PATHS.register ? params.get('type') : pathname === PATHS.login ? params.get('portal') : null;
  if (!Object.hasOwn(PORTAL_ROLES, kind ?? '')) return null;
  return { role: PORTAL_ROLES[kind], label: `${PORTAL_LABELS[kind]} ${pathname === PATHS.register ? 'registration' : 'sign in'}` };
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
    // Signed in as a different kind of account than the page is for (the Super Admin opening the Customer sign-in): let the
    // person choose, instead of silently landing on the other dashboard.
    const wanted = requestedAccount(location.pathname, params);
    if (alreadySignedIn.current && wanted && wanted.role !== user.role) return <SignedInElsewhere wantedLabel={wanted.label} />;
    const home = ROLE_HOME_PATHS[user.role];
    const requestedPath = location.state?.from?.pathname;
    const destination = requestedPath?.startsWith(home) ? requestedPath : home;
    return <Navigate to={destination} replace />;
  }
  return <Outlet />;
}
