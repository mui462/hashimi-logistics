import AdminListView from '../../components/admin/AdminListView';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import { CROSS_BORDER_OPTIONS, COUNTRY_OPTIONS, EQUIPMENT_OPTIONS, customerOptions } from '../../components/admin/filterOptions';
import { EntityLink, PartnerLink, adminPath, stopLabel } from '../../components/admin/adminLinks';
import Button from '../../components/common/Button';
import { QUOTE_FILTER_STATUSES, options } from '../../config/adminStatuses';
import { listQuotes } from '../../services/adminService';
import { formatDate, formatMoney } from '../../utils/format';

const FIELDS = [
  { name: 'q', label: 'Search', type: 'search' },
  { name: 'status', label: 'Status', type: 'select', options: options(QUOTE_FILTER_STATUSES) },
  { name: 'source', label: 'Source', type: 'select', options: [{ value: 'customer', label: 'Customer portal' }, { value: 'public', label: 'Website guest' }] },
  { name: 'customerId', label: 'Customer', type: 'select', optionsLoader: customerOptions },
  { name: 'crossBorder', label: 'Domestic or cross-border', type: 'select', options: CROSS_BORDER_OPTIONS },
  { name: 'equipmentType', label: 'Equipment', type: 'select', options: EQUIPMENT_OPTIONS },
  { name: 'originCountry', label: 'Origin country', type: 'select', options: COUNTRY_OPTIONS },
  { name: 'destinationCountry', label: 'Destination country', type: 'select', options: COUNTRY_OPTIONS },
  { name: 'createdFrom', label: 'Created from', type: 'date' },
  { name: 'createdTo', label: 'Created to', type: 'date' },
];

const COLUMNS = [
  { key: 'number', header: 'Quote #', primary: true, render: (quote) => <EntityLink to={adminPath('quotes', quote.id)}>{quote.quoteNumber}</EntityLink> },
  { key: 'customer', header: 'Customer', render: (quote) => (quote.isGuest ? <span>Guest: {quote.guestName ?? 'website request'}</span> : <PartnerLink kind="customers" partner={quote.customer} />) },
  { key: 'origin', header: 'Origin', render: (quote) => stopLabel(quote.origin) },
  { key: 'destination', header: 'Destination', render: (quote) => stopLabel(quote.destination) },
  { key: 'equipment', header: 'Equipment', render: (quote) => quote.equipmentType ?? '—' },
  { key: 'pickup', header: 'Pickup', render: (quote) => formatDate(quote.pickupDate, { utc: true }) },
  { key: 'status', header: 'Status', render: (quote) => <AdminStatusBadge status={quote.status} operationsStatus={quote.operationsStatus} /> },
  { key: 'price', header: 'Customer price', render: (quote) => formatMoney(quote.pricing?.customerRate) },
  { key: 'created', header: 'Created', render: (quote) => formatDate(quote.createdAt) },
  { key: 'actions', header: 'Actions', render: (quote) => <Button to={adminPath('quotes', quote.id)} variant="secondary" size="sm" aria-label={`Open quote ${quote.quoteNumber}`}>Open</Button> },
];

export default function QuotesPage() {
  return (
    <AdminPage title="Quotes" description="Quote requests from customers and website guests, with the customer price you set. Open a quote to review, price and send it.">
      <AdminListView fetcher={listQuotes} fields={FIELDS} columns={COLUMNS} getKey={(quote) => quote.id} caption="Quotes" emptyTitle="No quote requests yet" emptyDescription="Requests from customers and from the website quote form will appear here." />
    </AdminPage>
  );
}
