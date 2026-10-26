import { Router } from 'express';
import { env } from '../config/env.js';
import { BlogPost } from '../models/BlogPost.js';
import { Industry } from '../models/Industry.js';
import { Page } from '../models/Page.js';
import { Service } from '../models/Service.js';
import { SiteSettings } from '../models/SiteSettings.js';

/**
 * Public /sitemap.xml and /robots.txt, generated from the same visibility rules as the public CMS API (content.service.js).
 * The site address is the Super Admin's canonical base URL when set, otherwise CLIENT_URL, so pointing the site at a new
 * domain needs no code change. Nothing private (login, portals, admin) is ever listed.
 */
const router = Router();

const VISIBLE = { isActive: true, archivedAt: null };
const NOT_NOINDEX = { 'SEO.noIndex': { $ne: true } };

// Public pages the React router serves (frontend/src/routes/definitions/publicRoutes.jsx), minus login and portals.
const STATIC_PATHS = [
  '/', '/about', '/services', '/industries', '/service-areas', '/for-shippers', '/for-carriers', '/how-it-works',
  '/request-quote', '/become-a-carrier', '/carrier-resources', '/resources', '/faq', '/contact', '/privacy-policy', '/terms',
];
// Built-in content shown until the Super Admin creates the first record of a collection (frontend/src/content).
const BUILT_IN_SERVICES = ['full-truckload', 'ltl', 'dry-van', 'reefer', 'flatbed', 'expedited', 'specialized', 'cross-border'];
const BUILT_IN_INDUSTRIES = ['manufacturing', 'construction', 'automotive', 'retail', 'food-beverage', 'agriculture', 'industrial', 'consumer-goods'];

const escapeXml = (value) => value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
const day = (date) => (date ? new Date(date).toISOString().slice(0, 10) : undefined);

async function siteOrigin() {
  const settings = await SiteSettings.findOne({ key: 'primary' }).select('canonicalBaseUrl').lean();
  const configured = typeof settings?.canonicalBaseUrl === 'string' ? settings.canonicalBaseUrl.trim() : '';
  try {
    return new URL(configured || env.CLIENT_URL).origin;
  } catch {
    return env.CLIENT_URL;
  }
}

async function collectionEntries(Model, base, builtIn, extraFilter = {}) {
  const [docs, any] = await Promise.all([
    Model.find({ ...VISIBLE, ...extraFilter }).select('slug updatedAt').sort({ displayOrder: 1 }).lean(),
    Model.exists({}),
  ]);
  if (!any) return builtIn.map((slug) => ({ path: `${base}/${slug}` }));
  return docs.filter((doc) => doc.slug).map((doc) => ({ path: `${base}/${doc.slug}`, lastmod: day(doc.updatedAt) }));
}

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const now = new Date();
    const [origin, services, industries, pages, posts] = await Promise.all([
      siteOrigin(),
      collectionEntries(Service, '/services', BUILT_IN_SERVICES, NOT_NOINDEX),
      collectionEntries(Industry, '/industries', BUILT_IN_INDUSTRIES, NOT_NOINDEX),
      Page.find({ status: 'published', pageKey: { $exists: false }, ...NOT_NOINDEX }).select('slug updatedAt').lean(),
      BlogPost.find({ status: { $in: ['published', 'scheduled'] }, publishedAt: { $lte: now }, ...NOT_NOINDEX }).select('slug updatedAt publishedAt').lean(),
    ]);
    const entries = [
      ...STATIC_PATHS.map((path) => ({ path })),
      ...services,
      ...industries,
      ...pages.filter((p) => p.slug).map((p) => ({ path: `/pages/${p.slug}`, lastmod: day(p.updatedAt) })),
      ...posts.filter((p) => p.slug).map((p) => ({ path: `/resources/${p.slug}`, lastmod: day(p.updatedAt ?? p.publishedAt) })),
    ];
    const body = entries
      .map((e) => `  <url><loc>${escapeXml(origin + e.path)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`)
      .join('\n');
    res
      .type('application/xml')
      .set('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
  } catch (error) {
    next(error);
  }
});

router.get('/robots.txt', async (req, res, next) => {
  try {
    const origin = await siteOrigin();
    res
      .type('text/plain')
      .set('Cache-Control', 'public, max-age=0, s-maxage=3600')
      .send(
        [
          'User-agent: *',
          'Allow: /',
          'Disallow: /admin/',
          'Disallow: /customer/',
          'Disallow: /carrier/',
          'Disallow: /login',
          'Disallow: /register',
          'Disallow: /forgot-password',
          'Disallow: /reset-password',
          'Disallow: /verify-email',
          '',
          `Sitemap: ${origin}/sitemap.xml`,
          '',
        ].join('\n')
      );
  } catch (error) {
    next(error);
  }
});

export default router;
