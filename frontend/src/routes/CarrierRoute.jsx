import { ACCOUNT_TYPES } from '../config/constants';
import RoleRoute from './RoleRoute';

export default function CarrierRoute() {
  return <RoleRoute allowedRoles={[ACCOUNT_TYPES.CARRIER]} />;
}
