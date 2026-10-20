import { useLayoutEffect } from 'react';
import { AdminToastProvider } from '../components/admin/AdminToast';
import PortalLayout from '../components/layout/PortalLayout';
import { PATHS } from '../config/paths';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../services/apiClient';
import { adminNavGroups } from '../routes/definitions/adminRoutes';

// A 401 from any admin request (not the sign-in calls themselves) means the session ended: clear it, and the
// SuperAdminRoute guard sends the person to /admin/login.
function useSessionExpiry() {
  const { expireSession } = useAuth();
  // A layout effect, so the handler is in place before any page effect sends its first request.
  useLayoutEffect(() => {
    const id = apiClient.interceptors.response.use(undefined, (error) => {
      if (error?.status === 401 && !String(error.url ?? '').startsWith('/auth/')) expireSession();
      return Promise.reject(error);
    });
    return () => apiClient.interceptors.response.eject(id);
  }, [expireSession]);
}

export default function AdminLayout() {
  useSessionExpiry();
  return (
    <AdminToastProvider>
      <PortalLayout portalName="Super Admin" navGroups={adminNavGroups} homePath={PATHS.admin} />
    </AdminToastProvider>
  );
}
