import {
  Bell,
  Files,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  PackageSearch,
  Search,
  Truck,
  UserRound,
  Wallet,
  HandCoins,
} from 'lucide-react';
import { PATHS } from '../../config/paths';
import { buildNavGroups, lazyRoute } from '../routeBuilders';

const MAIN = 'Freight';
const BILLING = 'Documents & Payments';
const COMMUNICATION = 'Communication';
const ACCOUNT = 'Account';

// Carrier portal routes (Phase 6). Every page is code-split. Nav order follows this list.
export const carrierRoutes = [
  lazyRoute({ load: () => import('../../pages/carrier/DashboardPage'), nav: { label: 'Dashboard', icon: LayoutDashboard, group: MAIN, aliases: ['/carrier/dashboard'] } }),
  // /carrier/dashboard is an alias of /carrier: the same lazy page module, no second implementation, no second nav item.
  lazyRoute({ path: 'dashboard', load: () => import('../../pages/carrier/DashboardPage') }),
  lazyRoute({ path: 'loads', load: () => import('../../pages/carrier/LoadsPage'), nav: { label: 'Available Loads', icon: Search, group: MAIN } }),
  lazyRoute({ path: 'loads/:id', load: () => import('../../pages/carrier/LoadDetailPage') }),
  lazyRoute({ path: 'my-loads', load: () => import('../../pages/carrier/MyLoadsPage'), nav: { label: 'My Loads', icon: Truck, group: MAIN } }),
  lazyRoute({ path: 'my-loads/:id', load: () => import('../../pages/carrier/MyLoadDetailPage') }),
  lazyRoute({ path: 'shipments', load: () => import('../../pages/carrier/ShipmentsPage'), nav: { label: 'Shipments', icon: PackageSearch, group: MAIN } }),
  lazyRoute({ path: 'shipments/:id', load: () => import('../../pages/carrier/ShipmentDetailPage') }),
  lazyRoute({ path: 'tracking', load: () => import('../../pages/carrier/TrackingPage'), nav: { label: 'Tracking', icon: MapPin, group: MAIN } }),
  lazyRoute({ path: 'documents', load: () => import('../../pages/carrier/DocumentsPage'), nav: { label: 'Documents', icon: Files, group: BILLING } }),
  lazyRoute({ path: 'documents/:id', load: () => import('../../pages/carrier/DocumentDetailPage') }),
  lazyRoute({ path: 'documents/:id/download', load: () => import('../../pages/carrier/DocumentDownloadPage') }),
  lazyRoute({ path: 'payables', load: () => import('../../pages/carrier/PayablesPage'), nav: { label: 'Payables', icon: HandCoins, group: BILLING } }),
  lazyRoute({ path: 'payables/:id', load: () => import('../../pages/carrier/PayableDetailPage') }),
  lazyRoute({ path: 'payments', load: () => import('../../pages/carrier/PaymentsPage'), nav: { label: 'Payments', icon: Wallet, group: BILLING } }),
  lazyRoute({ path: 'messages', load: () => import('../../pages/carrier/MessagesPage'), nav: { label: 'Messages', icon: MessageSquare, group: COMMUNICATION } }),
  lazyRoute({ path: 'notifications', load: () => import('../../pages/carrier/NotificationsPage'), nav: { label: 'Notifications', icon: Bell, group: COMMUNICATION } }),
  lazyRoute({ path: 'profile', load: () => import('../../pages/carrier/ProfilePage'), nav: { label: 'Profile', icon: UserRound, group: ACCOUNT } }),
  // Anything else under /carrier is an honest "not found" inside the portal layout, not a blank screen.
  lazyRoute({ path: '*', load: () => import('../../pages/carrier/CarrierNotFoundPage') }),
];

export const carrierNavGroups = buildNavGroups(PATHS.carrier, carrierRoutes);
