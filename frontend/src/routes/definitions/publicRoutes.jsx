import HomePage from '../../pages/public/HomePage';
import NotFoundPage from '../../pages/public/NotFoundPage';

// Inner pages are code-split per route so the homepage bundle stays small. The homepage and 404
// stay in the main bundle because they are the most common entry points.
const page = (path, load, exportName = 'default') => ({
  path,
  lazy: async () => ({ Component: (await load())[exportName] }),
});

export const publicRoutes = [
  { index: true, element: <HomePage /> },
  page('about', () => import('../../pages/public/AboutPage')),
  page('services', () => import('../../pages/public/ServicesPage')),
  page('services/:slug', () => import('../../pages/public/ServiceDetailPage')),
  page('industries', () => import('../../pages/public/IndustriesPage')),
  page('industries/:slug', () => import('../../pages/public/IndustryDetailPage')),
  page('service-areas', () => import('../../pages/public/ServiceAreasPage')),
  page('for-shippers', () => import('../../pages/public/ForShippersPage')),
  page('for-carriers', () => import('../../pages/public/ForCarriersPage')),
  page('how-it-works', () => import('../../pages/public/HowItWorksPage')),
  page('track-shipment', () => import('../../pages/public/TrackShipmentPage')),
  page('request-quote', () => import('../../pages/public/RequestQuotePage')),
  page('become-a-carrier', () => import('../../pages/public/BecomeCarrierPage')),
  page('carrier-resources', () => import('../../pages/public/CarrierResourcesPage')),
  page('resources', () => import('../../pages/public/ResourcesPage')),
  page('resources/:slug', () => import('../../pages/public/ArticlePage')),
  page('pages/:slug', () => import('../../pages/public/CmsPage')),
  page('faq', () => import('../../pages/public/FaqPage')),
  page('contact', () => import('../../pages/public/ContactPage')),
  page('privacy-policy', () => import('../../pages/public/LegalPage'), 'PrivacyPolicyPage'),
  page('terms', () => import('../../pages/public/LegalPage'), 'TermsPage'),
  { path: '*', element: <NotFoundPage /> },
];
