import { listCarriers, listCustomers } from '../../services/adminService';
import { COUNTRIES, EQUIPMENT_TYPES, options } from '../../config/adminStatuses';

// Pickers for the customer / carrier filters come from the server (first 100 by name). Module-level so the
// filter definitions keep a stable identity between renders.
export const customerOptions = () => listCustomers({ limit: 100, sort: 'companyName', order: 'asc' }).then((data) => data.items.map((item) => ({ value: item.id, label: item.companyName })));
export const carrierOptions = () => listCarriers({ limit: 100, sort: 'companyName', order: 'asc' }).then((data) => data.items.map((item) => ({ value: item.id, label: item.companyName })));

export const CROSS_BORDER_OPTIONS = [{ value: 'false', label: 'Domestic' }, { value: 'true', label: 'Cross-border' }];
export const EQUIPMENT_OPTIONS = options(EQUIPMENT_TYPES);
export const COUNTRY_OPTIONS = COUNTRIES.map((country) => ({ value: country, label: country }));
