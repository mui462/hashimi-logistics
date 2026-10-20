import { Navigate, Outlet, useLocation } from 'react-router-dom';
import LoadingState from '../components/common/LoadingState';
import { ROLE_HOME_PATHS } from '../config/paths';
import { useAuth } from '../hooks/useAuth';

export default function GuestRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState label="Checking your session" fullPage />;
  }
  if (user) {
    const home = ROLE_HOME_PATHS[user.role];
    const requestedPath = location.state?.from?.pathname;
    const destination = requestedPath?.startsWith(home) ? requestedPath : home;
    return <Navigate to={destination} replace />;
  }
  return <Outlet />;
}
