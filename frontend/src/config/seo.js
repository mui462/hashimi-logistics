import { brand } from './brand';

const siteUrl = (import.meta.env.VITE_SITE_URL || '').trim().replace(/\/+$/, '');
const ogImage = (import.meta.env.VITE_OG_IMAGE || '').trim();

// siteUrl drives canonical and Open Graph URLs. When it is not configured those tags are omitted
// rather than guessed. ogImage works the same way.
export const seoDefaults = {
  siteName: brand.name,
  siteUrl,
  ogImage,
  description: `${brand.name}. ${brand.tagline}. ${brand.supportingStatement}.`,
  robots: 'index,follow',
};
