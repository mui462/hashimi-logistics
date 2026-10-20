import { formatMoney } from '../../utils/format';
import DetailList from '../customer/DetailList';

// Customer rate, carrier rate and margin exactly as the server calculated them. Margin is never an input.
export default function PricingSummary({ pricing }) {
  return (
    <DetailList
      items={[
        { label: 'Customer rate', value: formatMoney(pricing?.customerRate) },
        { label: 'Carrier rate', value: formatMoney(pricing?.carrierRate) },
        { label: 'Broker margin (calculated by the server)', value: formatMoney(pricing?.brokerMargin) },
        { label: 'Margin percentage', value: pricing?.marginPercent == null ? '—' : `${pricing.marginPercent}%` },
      ]}
    />
  );
}
