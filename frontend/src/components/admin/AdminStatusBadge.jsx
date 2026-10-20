import { humanize, toneFor } from '../../config/adminStatuses';
import Badge from '../common/Badge';

// Always words. `status` is the server's own value; pass `operationsStatus` when the response carries one.
export default function AdminStatusBadge({ status, operationsStatus }) {
  const value = operationsStatus ?? status;
  return <Badge tone={toneFor(value)}>{humanize(value)}</Badge>;
}
