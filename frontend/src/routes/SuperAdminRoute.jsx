import { ACCOUNT_TYPES } from '../config/constants';
import { PATHS } from '../config/paths';
import RoleRoute from './RoleRoute';

export default function SuperAdminRoute() {
  return <RoleRoute allowedRoles={[ACCOUNT_TYPES.SUPER_ADMIN]} loginPath={PATHS.adminLogin} />;
}
