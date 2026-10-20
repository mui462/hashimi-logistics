import {
  Bell,
  FilePlus2,
  FileText,
  Files,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  PackageSearch,
  Receipt,
  ReceiptText,
  UserRound,
} from 'lucide-react';
import { PATHS } from '../../config/paths';
import { buildNavGroups, lazyRoute } from '../routeBuilders';

const MAIN = 'Main';
const BILLING = 'Documents & Billing';
const COMMUNICATION = 'Communication';
const ACCOUNT = 'Account';

// Customer portal routes (Phase 5). Every page is code-split. Nav order follows this list.
export const customerRoutes = [
  lazyRoute({ load: () => import('../../pages/customer/DashboardPage'), nav: { label: 'Dashboard', icon: LayoutDashboard, group: MAIN, aliases: ['/customer/dashboard'] } }),
  // /customer/dashboard is an alias of /customer: the same lazy page module, no second implementation, no second nav item.
  lazyRoute({ path: 'dashboard', load: () => import('../../pages/customer/DashboardPage') }),
  lazyRoute({ path: 'quotes/new', load: () => import('../../pages/customer/QuoteNewPage'), nav: { label: 'Request a Quote', icon: FilePlus2, group: MAIN } }),
  lazyRoute({ path: 'quotes', load: () => import('../../pages/customer/QuotesPage'), nav: { label: 'My Quotes', icon: FileText, group: MAIN, exclude: ['/customer/quotes/new'] } }),
  lazyRoute({ path: 'quotes/:id', load: () => import('../../pages/customer/QuoteDetailPage') }),
  lazyRoute({ path: 'shipments', load: () => import('../../pages/customer/ShipmentsPage'), nav: { label: 'My Shipments', icon: PackageSearch, group: MAIN } }),
  lazyRoute({ path: 'shipments/:id', load: () => import('../../pages/customer/ShipmentDetailPage') }),
  lazyRoute({ path: 'tracking', load: () => import('../../pages/customer/TrackingPage'), nav: { label: 'Tracking', icon: MapPin, group: MAIN } }),
  lazyRoute({ path: 'documents', load: () => import('../../pages/customer/DocumentsPage'), nav: { label: 'Documents', icon: Files, group: BILLING } }),
  lazyRoute({ path: 'billing', load: () => import('../../pages/customer/BillingPage'), nav: { label: 'Billing', icon: ReceiptText, group: BILLING, exclude: [] } }),
  lazyRoute({ path: 'billing/:id', load: () => import('../../pages/customer/BillingInvoiceDetailPage') }),
  lazyRoute({ path: 'invoices', load: () => import('../../pages/customer/InvoicesPage'), nav: { label: 'Invoices', icon: Receipt, group: BILLING } }),
  lazyRoute({ path: 'messages', load: () => import('../../pages/customer/MessagesPage'), nav: { label: 'Messages', icon: MessageSquare, group: COMMUNICATION } }),
  lazyRoute({ path: 'notifications', load: () => import('../../pages/customer/NotificationsPage'), nav: { label: 'Notifications', icon: Bell, group: COMMUNICATION } }),
  lazyRoute({ path: 'profile', load: () => import('../../pages/customer/ProfilePage'), nav: { label: 'Profile', icon: UserRound, group: ACCOUNT } }),
  // Anything else under /customer is an honest "not found" inside the portal layout, not a blank screen.
  lazyRoute({ path: '*', load: () => import('../../pages/customer/CustomerNotFoundPage') }),
];

export const customerNavGroups = buildNavGroups(PATHS.customer, customerRoutes);
