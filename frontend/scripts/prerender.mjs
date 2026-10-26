/**
 * Runs after `vite build` (see the "build" script). Writes a copy of dist/index.html for every public route with that page's own
 * <title>, description, Open Graph tags and a <noscript> summary with links already in the HTML. Crawlers and link previews
 * (WhatsApp, Facebook, LinkedIn) that do not run JavaScript then see real page information instead of an empty shell. The React
 * app still renders the full page and refreshes these tags itself (components/seo/Seo.jsx), so behaviour is unchanged.
 *
 * Only built-in content is used here. Pages the Super Admin adds in the CMS are not known at build time; they keep working
 * through the normal app (Googlebot renders JavaScript) and are listed in /sitemap.xml.
 *
 * Canonical and og:url are written only when VITE_SITE_URL is set at build time, like the rest of the app: nothing is guessed.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brand } from '../src/config/brand.js';
import { industries } from '../src/content/industries.js';
import { services } from '../src/content/services.js';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const siteUrl = (process.env.VITE_SITE_URL || '').trim().replace(/\/+$/, '');
const ogImage = (process.env.VITE_OG_IMAGE || '').trim();

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const NAV = [
  ['/', 'Home'], ['/about', 'About Us'], ['/services', 'Freight Services'], ['/industries', 'Industries'], ['/service-areas', 'Service Areas'],
  ['/for-shippers', 'For Shippers'], ['/for-carriers', 'For Carriers'], ['/how-it-works', 'How It Works'], ['/request-quote', 'Request a Quote'],
  ['/become-a-carrier', 'Become a Carrier'], ['/faq', 'FAQ'], ['/contact', 'Contact Us'],
];

// Keep these in step with the <Seo> calls in src/pages/public (the app overwrites them at runtime either way).
const routes = [
  { path: '/', generic: true, title: brand.tagline, description: `${brand.name} ${brand.tagline}. ${brand.supportingStatement}.` },
  { path: '/about', title: 'About Us', description: `Learn about ${brand.name}, a freight brokerage coordinating domestic and cross-border transportation across North America.` },
  { path: '/services', title: 'Freight Services', description: `Full truckload, LTL, dry van, reefer, flatbed, expedited, specialized and cross-border freight coordinated by ${brand.name}` },
  { path: '/industries', title: 'Industries', description: 'Freight transportation for manufacturing, construction, automotive, retail, food and beverage, agriculture, industrial and consumer goods.' },
  { path: '/service-areas', title: 'Service Areas', description: 'Freight coordinated across the United States, Canada and Mexico: U.S. domestic, U.S. to Canada and U.S. to Mexico.' },
  { path: '/for-shippers', title: 'For Shippers', description: 'Freight coordination for shippers: carrier network, shipment visibility, flexible transportation and cross-border support.' },
  { path: '/for-carriers', title: 'For Carriers', description: `Carriers: haul domestic and cross-border freight with ${brand.name} Apply online.` },
  { path: '/how-it-works', title: 'How It Works', description: `From quote request to delivery: how ${brand.name} coordinates your shipment.` },
  { path: '/request-quote', title: 'Request a Quote', description: `Request a freight quote from ${brand.name} Tell us about your shipment in a few steps.` },
  { path: '/become-a-carrier', title: 'Become a Carrier', description: `Apply to haul freight with ${brand.name}` },
  { path: '/carrier-resources', title: 'Carrier Resources', description: `Onboarding, documents, POD instructions and support for carriers working with ${brand.name}` },
  { path: '/resources', title: 'Resources', description: `Freight, transportation and cross-border articles and updates from ${brand.name}` },
  { path: '/track-shipment', title: 'Track Shipment', description: `Track your ${brand.name} shipment with your tracking number.` },
  { path: '/faq', title: 'Frequently Asked Questions', description: `Answers about shipping, carriers, quotes, tracking and cross-border freight with ${brand.name}` },
  { path: '/contact', title: 'Contact Us', description: `Contact ${brand.name} about shipping, carrier opportunities or general questions.` },
  ...services.map((s) => ({ path: `/services/${s.slug}`, title: s.title, description: s.short })),
  ...industries.map((i) => ({ path: `/industries/${i.slug}`, title: `${i.title} Freight`, description: i.short })),
];

const template = await readFile(path.join(dist, 'index.html'), 'utf8');

function render(route) {
  // dist/index.html is also the fallback for every route the app owns (login, portals, unknown paths), so it stays generic:
  // no canonical, og:url or robots tag that would wrongly describe those pages.
  const fullTitle = route.generic ? brand.name : `${route.title} | ${brand.name}`;
  const url = siteUrl && !route.generic ? `${siteUrl}${route.path}` : '';
  const tags = [
    `<meta name="description" content="${escapeHtml(route.description)}" />`,
    !route.generic && '<meta name="robots" content="index,follow" />',
    url && `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:title" content="${escapeHtml(fullTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(route.description)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${escapeHtml(brand.name)}" />`,
    url && `<meta property="og:url" content="${escapeHtml(url)}" />`,
    ogImage && `<meta property="og:image" content="${escapeHtml(ogImage)}" />`,
    `<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}" />`,
  ].filter(Boolean).join('\n    ');
  const links = NAV.map(([href, label]) => `<li><a href="${href}">${escapeHtml(label)}</a></li>`).join('');
  const noscript = `<noscript><h1>${escapeHtml(route.title)}</h1><p>${escapeHtml(route.description)}</p><nav aria-label="Main"><ul>${links}</ul></nav></noscript>`;
  // Function replacers: the text may contain "$" sequences that String.replace would otherwise interpret.
  return template
    .replace(/<meta\s+name="description"[\s\S]*?\/>\s*/i, () => '')
    .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(fullTitle)}</title>\n    ${tags}`)
    .replace('<div id="root"></div>', () => `<div id="root"></div>\n    ${noscript}`);
}

for (const route of routes) {
  const file = route.path === '/' ? path.join(dist, 'index.html') : path.join(dist, route.path.slice(1), 'index.html');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, render(route));
}
console.log(`Prerendered head tags for ${routes.length} public routes${siteUrl ? ` (canonical base ${siteUrl})` : ' (no VITE_SITE_URL: canonical omitted)'}.`);
