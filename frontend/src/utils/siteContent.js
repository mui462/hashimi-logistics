import { resolveNavbarAppearance } from '../config/navbarAppearance';
import { resolveThemeAppearance } from '../config/themeAppearance';
import { brand, contactDetails } from '../config/brand';

/** CMS text wins only when it has content; otherwise the built-in value stays. */
export const text = (value, fallback = '') => (typeof value === 'string' && value.trim() ? value.trim() : fallback);
export const list = (value) => (Array.isArray(value) ? value : []);

/** A CMS button ({ label, url }) as a Button/HeroSection action: site paths become router links, everything else a plain link. */
export function toAction(button, variant) {
  if (!button?.label || !button?.url) return null;
  const internal = button.url.startsWith('/') && !button.url.startsWith('//');
  return { label: button.label, ...(internal ? { to: button.url } : { href: button.url }), ...(variant ? { variant } : {}) };
}
export const actionsFrom = (primary, secondary, fallback) => {
  const found = [toAction(primary), toAction(secondary, 'secondary')].filter(Boolean);
  return found.length > 0 ? found : fallback;
};

const DAY = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
const ORDER = Object.keys(DAY);

/** Company details for the navbar, footer and head: CMS settings over the Phase 4 defaults. Contact details exist only if entered. */
export function mergeSiteSettings(settings) {
  const s = settings?.configured ? settings : null;
  const company = {
    ...brand,
    name: text(s?.companyName, brand.name),
    shortName: text(s?.shortName, brand.shortName),
    tagline: text(s?.tagline, brand.tagline),
    primaryCta: text(s?.primaryCta?.label, brand.primaryCta),
  };
  const address = s?.address ? [s.address.street, [s.address.city, [s.address.state, s.address.zipCode].filter(Boolean).join(' ')].filter(Boolean).join(', '), s.address.country].filter(Boolean).join(', ') : '';
  const hours = list(s?.businessHours)
    .sort((a, b) => ORDER.indexOf(a.day) - ORDER.indexOf(b.day))
    .map((row) => `${DAY[row.day]}: ${row.isClosed ? 'Closed' : `${row.opensAt ?? '?'} to ${row.closesAt ?? '?'}`}`);
  const contact = { ...contactDetails, phone: text(s?.phone, contactDetails.phone), email: text(s?.email, contactDetails.email), address: address || contactDetails.address, businessHours: hours.length > 0 ? hours : contactDetails.businessHours };
  const social = Object.fromEntries(list(s?.socialLinks).map((link) => [link.platform, link.url]));
  return {
    configured: Boolean(s), settings: s, company, contact, social,
    logo: s?.logo?.url ? s.logo : null,
    cta: toAction(s?.primaryCta),
    footerText: text(s?.footerText),
    copyrightText: text(s?.copyrightText),
    // Served even before any settings are saved; resolved here so a missing or damaged payload still gives the approved defaults.
    navbarAppearance: resolveNavbarAppearance(settings?.navbarAppearance),
    themeAppearance: resolveThemeAppearance(settings?.themeAppearance),
  };
}
