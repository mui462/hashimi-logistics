import { ACCOUNT_TYPES } from '../config/constants';
import RoleRoute from './RoleRoute';

export default function CustomerRoute() {
  return <RoleRoute allowedRoles={[ACCOUNT_TYPES.CUSTOMER]} />;
}
