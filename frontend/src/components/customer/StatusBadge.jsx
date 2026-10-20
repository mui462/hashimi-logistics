import { LOAD_STATUS, PAYMENT_STATUS, QUOTE_STATUS, shipmentStatus } from '../../config/customerStatuses';
import Badge from '../common/Badge';

const RESOLVERS = {
  quote: (status) => QUOTE_STATUS[status],
  shipment: shipmentStatus,
  payment: (status) => PAYMENT_STATUS[status],
  load: (status) => LOAD_STATUS[status],
};

export default function StatusBadge({ kind, status }) {
  const resolved = RESOLVERS[kind]?.(status) ?? { label: String(status || 'Unknown'), tone: 'neutral' };
  return <Badge tone={resolved.tone}>{resolved.label}</Badge>;
}
