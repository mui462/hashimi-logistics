import express, { Router } from 'express';
import { getHealth, getReadiness } from '../controllers/health.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireCarrier, requireCustomer, requireSuperAdmin } from '../middleware/authorize.js';
import { requireOwnerContext } from '../middleware/ownerContext.js';
import carrierRoutes from '../carrier/carrier.routes.js';
import { getCarrierAccountStatus } from '../admin/carrierApproval.service.js';
import { noStore } from '../middleware/noStore.js';
import { sendSuccess } from '../utils/apiResponse.js';
import customerRoutes from '../customer/customer.routes.js';
import adminRoutes from '../admin/admin.routes.js';
import publicRoutes from '../public/public.routes.js';
import cmsRoutes from '../cms/cms.routes.js';
import contentRoutes from '../cms/content.routes.js';
import operationsRoutes from '../operations/operations.routes.js';
import financeRoutes from '../finance/finance.routes.js';
import chatbotRoutes from '../chatbot/chatbot.routes.js';
import cronRoutes from '../notifications/cron.routes.js';
import authRoutes from './auth.routes.js';
import storageRoutes from './storage.routes.js';
import { createPlaceholderRouter } from './placeholder.routes.js';

const ACCESS_GUARDS = {
  public: [],
  authenticated: [authenticate, requireOwnerContext],
  superAdmin: [authenticate, requireSuperAdmin],
};

const PLACEHOLDER_MODULES = [
  { path: '/users', name: 'users', access: 'superAdmin' },
  { path: '/customers', name: 'customers', access: 'superAdmin' },
  { path: '/carriers', name: 'carriers', access: 'superAdmin' },
  { path: '/carrier-applications', name: 'carrier-applications', access: 'public' },
  { path: '/quotes', name: 'quotes', access: 'public' },
  { path: '/loads', name: 'loads', access: 'authenticated' },
  { path: '/shipments', name: 'shipments', access: 'authenticated' },
  { path: '/tracking', name: 'tracking', access: 'public' },
  { path: '/documents', name: 'documents', access: 'authenticated' },
  { path: '/payments', name: 'payments', access: 'authenticated' },
  { path: '/notifications', name: 'notifications', access: 'authenticated' },
  { path: '/cms', name: 'cms', access: 'public' },
  { path: '/services', name: 'services', access: 'public' },
  { path: '/industries', name: 'industries', access: 'public' },
  { path: '/service-areas', name: 'service-areas', access: 'public' },
  { path: '/blog', name: 'blog', access: 'public' },
  { path: '/faqs', name: 'faqs', access: 'public' },
  { path: '/testimonials', name: 'testimonials', access: 'public' },
  { path: '/media', name: 'media', access: 'superAdmin' },
  { path: '/seo', name: 'seo', access: 'public' },
  { path: '/site-settings', name: 'site-settings', access: 'public' },
];

const router = Router();

router.get('/health', getHealth);
router.get('/health/ready', getReadiness);
router.use('/auth', authRoutes);
// Scheduler-driven delivery runner (needs CRON_SECRET; absent otherwise).
router.use('/internal', cronRoutes);
// Phase 10: file delivery for the development-only local storage provider (inert unless STORAGE_PROVIDER=local).
router.use('/storage/local', storageRoutes);
// Customer portal API (Phase 5): customers only, always scoped to the signed-in customer's own records.
router.use('/customer', authenticate, requireCustomer, requireOwnerContext, customerRoutes);
// Carrier portal API (Phase 6): carriers only, always scoped to the signed-in carrier's own records.
// A carrier's own approval status. Deliberately outside the owner context so suspended or deactivated carriers can still see why.
router.get('/carrier/account-status', authenticate, requireCarrier, noStore, async (req, res) => sendSuccess(res, { data: await getCarrierAccountStatus(req.user) }));
router.use('/carrier', authenticate, requireCarrier, requireOwnerContext, carrierRoutes);
// Brokerage operations API (Phase 7): Super Admin only. Customers and carriers receive 403 before any handler runs.
router.use('/operations', authenticate, requireSuperAdmin, operationsRoutes);
// Finance API (Phase 12): invoices, payment records, carrier payables. Super Admin only; customers and carriers get 403.
router.use('/finance', authenticate, requireSuperAdmin, financeRoutes);
// Website CMS (Phase 9). Public read API for the website; the admin API is Super Admin only and is mounted before /admin.
router.use('/content', contentRoutes);
router.use('/admin/cms', authenticate, requireSuperAdmin, express.json({ limit: '1mb' }), cmsRoutes);
// Super Admin read API (Phase 8): partners, documents, payments, logs, security, settings and search.
router.use('/admin', authenticate, requireSuperAdmin, adminRoutes);
// Public website forms and tracking (no account): POST /quotes, /carrier-applications, /contact and GET /tracking/:number.
// Mounted before the placeholders so those keep answering GET / exactly as before.
router.use('/', publicRoutes);
// Public AI assistant (stateless, no account, no database writes): POST /chatbot/messages, GET /chatbot/status.
router.use('/chatbot', chatbotRoutes);

for (const { path, name, access } of PLACEHOLDER_MODULES) {
  router.use(path, ...ACCESS_GUARDS[access], createPlaceholderRouter(name));
}

export default router;
