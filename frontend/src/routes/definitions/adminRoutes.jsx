import { Navigate } from 'react-router-dom';
import {
  Activity,
  Banknote,
  Calculator,
  Landmark,
  ReceiptText,
  Scale,
  Bell,
  BookOpen,
  Briefcase,
  Factory,
  FileText,
  Files,
  Globe,
  HelpCircle,
  Home,
  Image,
  LayoutDashboard,
  Mail,
  MapPin,
  MessageSquare,
  PackageSearch,
  Paintbrush,
  Palette,
  Quote,
  Search,
  Settings,
  ShieldCheck,
  Truck,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
import { PATHS } from '../../config/paths';
import { buildNavGroups, lazyRoute, placeholderRoute } from '../routeBuilders';

const OVERVIEW = 'Overview';
const OPERATIONS = 'Operations';
const PARTNERS = 'Partners';
const FINANCE = 'Finance';
const DOCUMENTS = 'Documents';
const COMMUNICATION = 'Communication';
const SYSTEM = 'System';
const WEBSITE = 'Website CMS';

const page = (name) => () => import(`../../pages/admin/${name}.jsx`);
const cmsPage = (name) => () => import(`../../pages/admin/cms/${name}.jsx`);

// Super Admin routes. Every working page is code-split. The Website CMS routes (Phase 9) manage the public site; there is no
// /admin/loads/new because loads are created only by converting an accepted quote (the Phase 7 API has no direct-create endpoint).
export const adminRoutes = [
  lazyRoute({ load: page('DashboardPage'), nav: { label: 'Dashboard', icon: LayoutDashboard, group: OVERVIEW, aliases: ['/admin/dashboard'] } }),
  lazyRoute({ path: 'dashboard', load: page('DashboardPage') }),

  lazyRoute({ path: 'quotes', load: page('QuotesPage'), nav: { group: OPERATIONS, label: 'Quotes', icon: FileText } }),
  lazyRoute({ path: 'quotes/:id', load: page('QuoteDetailPage') }),
  lazyRoute({ path: 'loads', load: page('LoadsPage'), nav: { group: OPERATIONS, label: 'Loads', icon: Truck } }),
  lazyRoute({ path: 'loads/:id', load: page('LoadDetailPage') }),
  lazyRoute({ path: 'loads/:id/edit', load: page('LoadEditPage') }),
  lazyRoute({ path: 'loads/:id/matching', load: page('LoadMatchingPage') }),
  lazyRoute({ path: 'shipments', load: page('ShipmentsPage'), nav: { group: OPERATIONS, label: 'Shipments', icon: PackageSearch } }),
  lazyRoute({ path: 'shipments/:id', load: page('ShipmentDetailPage') }),

  lazyRoute({ path: 'customers', load: page('CustomersPage'), nav: { group: PARTNERS, label: 'Customers', icon: Users } }),
  lazyRoute({ path: 'customers/:id', load: page('CustomerDetailPage') }),
  lazyRoute({ path: 'carriers', load: page('CarriersPage'), nav: { group: PARTNERS, label: 'Carriers', icon: Briefcase } }),
  lazyRoute({ path: 'carriers/:id', load: page('CarrierDetailPage') }),
  lazyRoute({ path: 'carrier-applications', load: page('ApplicationsPage'), nav: { group: PARTNERS, label: 'Carrier applications', icon: UserCheck } }),
  lazyRoute({ path: 'carrier-applications/:id', load: page('ApplicationDetailPage') }),

  lazyRoute({ path: 'finance', load: page('FinanceOverviewPage'), nav: { group: FINANCE, label: 'Finance overview', icon: Landmark, exclude: ['/admin/finance/invoices', '/admin/finance/payables', '/admin/finance/payments'] } }),
  lazyRoute({ path: 'finance/invoices', load: page('FinanceInvoicesPage'), nav: { group: FINANCE, label: 'Customer invoices', icon: ReceiptText, exclude: ['/admin/finance/invoices/new'] } }),
  lazyRoute({ path: 'finance/invoices/new', load: page('FinanceInvoiceNewPage') }),
  lazyRoute({ path: 'finance/invoices/:id', load: page('FinanceInvoiceDetailPage') }),
  lazyRoute({ path: 'finance/payables', load: page('FinancePayablesPage'), nav: { group: FINANCE, label: 'Carrier payables', icon: Calculator, exclude: ['/admin/finance/payables/new'] } }),
  lazyRoute({ path: 'finance/payables/new', load: page('FinancePayableNewPage') }),
  lazyRoute({ path: 'finance/payables/:id', load: page('FinancePayableDetailPage') }),
  lazyRoute({ path: 'finance/payments', load: page('FinanceTransactionsPage'), nav: { group: FINANCE, label: 'Payment records', icon: Scale } }),
  lazyRoute({ path: 'payments', load: page('PaymentsPage'), nav: { group: FINANCE, label: 'Payments', icon: Banknote } }),
  lazyRoute({ path: 'payments/:id', load: page('PaymentDetailPage') }),
  lazyRoute({ path: 'documents', load: page('DocumentsPage'), nav: { group: DOCUMENTS, label: 'Documents', icon: Files } }),
  lazyRoute({ path: 'documents/:id', load: page('DocumentDetailPage') }),
  lazyRoute({ path: 'notifications', load: page('NotificationsPage'), nav: { group: COMMUNICATION, label: 'Notifications', icon: Bell } }),
  lazyRoute({ path: 'contact-messages', load: page('ContactMessagesPage'), nav: { group: COMMUNICATION, label: 'Contact messages', icon: MessageSquare } }),
  lazyRoute({ path: 'contact-messages/:id', load: page('ContactMessageDetailPage') }),
  lazyRoute({ path: 'notification-deliveries', load: page('NotificationDeliveriesPage'), nav: { group: COMMUNICATION, label: 'Delivery log', icon: Mail } }),
  /* Website CMS (Phase 9). Settings stays at /admin/settings (one editable page); the CMS path redirects to it. */
  lazyRoute({ path: 'cms', load: cmsPage('CmsOverviewPage'), nav: { group: WEBSITE, label: 'Website overview', icon: Globe, end: true } }),
  lazyRoute({ path: 'cms/homepage', load: cmsPage('CmsHomepagePage'), nav: { group: WEBSITE, label: 'Homepage', icon: Home } }),
  lazyRoute({ path: 'cms/pages', load: cmsPage('PagesPages'), exportName: 'PagesListPage', nav: { group: WEBSITE, label: 'Pages', icon: Files } }),
  lazyRoute({ path: 'cms/pages/new', load: cmsPage('PagesPages'), exportName: 'PageNewPage' }),
  lazyRoute({ path: 'cms/pages/:id', load: cmsPage('PagesPages'), exportName: 'PageEditPage' }),
  lazyRoute({ path: 'cms/services', load: cmsPage('CollectionPages'), exportName: 'ServicesListPage', nav: { group: WEBSITE, label: 'Services', icon: Wrench } }),
  lazyRoute({ path: 'cms/services/new', load: cmsPage('CollectionPages'), exportName: 'ServiceNewPage' }),
  lazyRoute({ path: 'cms/services/:id', load: cmsPage('CollectionPages'), exportName: 'ServiceEditPage' }),
  lazyRoute({ path: 'cms/industries', load: cmsPage('CollectionPages'), exportName: 'IndustriesListPage', nav: { group: WEBSITE, label: 'Industries', icon: Factory } }),
  lazyRoute({ path: 'cms/industries/new', load: cmsPage('CollectionPages'), exportName: 'IndustryNewPage' }),
  lazyRoute({ path: 'cms/industries/:id', load: cmsPage('CollectionPages'), exportName: 'IndustryEditPage' }),
  lazyRoute({ path: 'cms/service-areas', load: cmsPage('CollectionPages'), exportName: 'ServiceAreasListPage', nav: { group: WEBSITE, label: 'Service areas', icon: MapPin } }),
  lazyRoute({ path: 'cms/service-areas/new', load: cmsPage('CollectionPages'), exportName: 'ServiceAreaNewPage' }),
  lazyRoute({ path: 'cms/service-areas/:id', load: cmsPage('CollectionPages'), exportName: 'ServiceAreaEditPage' }),
  lazyRoute({ path: 'cms/blog', load: cmsPage('BlogPages'), exportName: 'BlogListPage', nav: { group: WEBSITE, label: 'Blog / Resources', icon: BookOpen } }),
  lazyRoute({ path: 'cms/blog/new', load: cmsPage('BlogPages'), exportName: 'BlogNewPage' }),
  lazyRoute({ path: 'cms/blog/:id', load: cmsPage('BlogPages'), exportName: 'BlogEditPage' }),
  lazyRoute({ path: 'cms/faqs', load: cmsPage('CollectionPages'), exportName: 'FaqsListPage', nav: { group: WEBSITE, label: 'FAQs', icon: HelpCircle } }),
  lazyRoute({ path: 'cms/faqs/new', load: cmsPage('CollectionPages'), exportName: 'FaqNewPage' }),
  lazyRoute({ path: 'cms/faqs/:id', load: cmsPage('CollectionPages'), exportName: 'FaqEditPage' }),
  lazyRoute({ path: 'cms/testimonials', load: cmsPage('CollectionPages'), exportName: 'TestimonialsListPage', nav: { group: WEBSITE, label: 'Testimonials', icon: Quote } }),
  lazyRoute({ path: 'cms/testimonials/new', load: cmsPage('CollectionPages'), exportName: 'TestimonialNewPage' }),
  lazyRoute({ path: 'cms/testimonials/:id', load: cmsPage('CollectionPages'), exportName: 'TestimonialEditPage' }),
  lazyRoute({ path: 'cms/media', load: cmsPage('CmsMediaPage'), nav: { group: WEBSITE, label: 'Media library', icon: Image } }),
  lazyRoute({ path: 'cms/seo', load: cmsPage('CmsSeoPage'), nav: { group: WEBSITE, label: 'SEO', icon: Search } }),
  lazyRoute({ path: 'cms/navbar', load: cmsPage('CmsNavbarAppearancePage'), nav: { group: WEBSITE, label: 'Navbar appearance', icon: Palette } }),
  lazyRoute({ path: 'cms/theme', load: cmsPage('CmsThemePage'), nav: { group: WEBSITE, label: 'Website theme', icon: Paintbrush } }),
  { path: 'cms/settings', element: <Navigate to="/admin/settings" replace /> },
  { path: 'cms/homepage-sections', element: <Navigate to="/admin/cms/homepage" replace /> },
  { path: 'seo', element: <Navigate to="/admin/cms/seo" replace /> },
  placeholderRoute({ path: 'forms', title: 'Forms' }),
  lazyRoute({ path: 'activity-logs', load: page('ActivityLogsPage'), nav: { group: SYSTEM, label: 'Activity logs', icon: Activity } }),
  lazyRoute({ path: 'security', load: page('SecurityPage'), nav: { group: SYSTEM, label: 'Security', icon: ShieldCheck } }),
  lazyRoute({ path: 'settings', load: page('SettingsPage'), nav: { group: SYSTEM, label: 'Settings', icon: Settings } }),

  // Anything else under /admin is an honest "not found" inside the admin layout, not a blank screen.
  lazyRoute({ path: '*', load: page('AdminNotFoundPage') }),
];

export const adminNavGroups = buildNavGroups(PATHS.admin, adminRoutes);
