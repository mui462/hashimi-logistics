import { Navigate, Outlet, useLocation } from 'react-router-dom';
import LoadingState from '../components/common/LoadingState';
import { PATHS, ROLE_HOME_PATHS } from '../config/paths';
import { useAuth } from '../hooks/useAuth';

export default function RoleRoute({ allowedRoles, loginPath = PATHS.login }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState label="Checking your session" fullPage />;
  }
  if (!user) {
    return <Navigate to={loginPath} replace state={{ from: location }} />;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={ROLE_HOME_PATHS[user.role]} replace />;
  }
  return <Outlet />;
}
