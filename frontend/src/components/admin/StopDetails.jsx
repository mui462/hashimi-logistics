import DetailList from '../customer/DetailList';
import { formatStop } from '../../utils/format';

// One pickup or delivery location as the server sent it (admin sees full contact details).
export default function StopDetails({ stop }) {
  if (!stop) return <p className="text-base text-steel-600">No location recorded.</p>;
  return (
    <DetailList
      items={[
        { label: 'Facility', value: stop.facilityName },
        { label: 'Address', value: [stop.street, formatStop(stop), stop.zipCode].filter(Boolean).join(', ') },
        { label: 'Contact', value: stop.contactName },
        { label: 'Contact phone', value: stop.contactPhone },
        { label: 'Contact email', value: stop.contactEmail, wide: true },
      ]}
    />
  );
}
