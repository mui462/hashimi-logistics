/**
 * CMS read models. Every shape is an explicit allow-list: nothing is spread from a Mongoose document, so a field added
 * to a model later (admin notes, storage keys, user ids) can never reach a response by accident.
 *
 *   admin*   Super Admin editor views (include drafts, hidden/archived state, timestamps)
 *   public*  visitor views (only what the public website renders)
 */
const id = (value) => (value == null ? undefined : String(value));
const iso = (value) => (value ? new Date(value).toISOString() : null);
const text = (value) => (value === undefined || value === null || value === '' ? null : value);

const asset = (value) => (value?.url ? { url: value.url, altText: text(value.altText), mediaId: id(value.mediaId) ?? null } : null);
const publicAsset = (value) => (value?.url ? { url: value.url, altText: text(value.altText) } : null);
const button = (value) => (value?.label && value?.url ? { label: value.label, url: value.url } : null);
const seo = (value) => ({
  title: text(value?.title),
  description: text(value?.description),
  keywords: [...(value?.keywords ?? [])],
  canonicalUrl: text(value?.canonicalUrl),
  ogImage: text(value?.ogImage),
  noIndex: Boolean(value?.noIndex),
});
const strings = (list) => [...(list ?? [])];
const archived = (doc) => Boolean(doc.archivedAt);
const sortByOrder = (items) => [...(items ?? [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
const activeItems = (items) => sortByOrder((items ?? []).filter((item) => item.isActive !== false));

const item = (entry) => ({ id: id(entry._id), title: entry.title, description: text(entry.description), icon: text(entry.icon), displayOrder: entry.displayOrder ?? 0, isActive: entry.isActive !== false });
const publicItem = (entry) => ({ title: entry.title, description: text(entry.description), icon: text(entry.icon) });
const trustItem = (entry) => ({ ...item(entry), image: asset(entry.image) });
const publicTrustItem = (entry) => ({ ...publicItem(entry), image: publicAsset(entry.image) });

const header = (section) => ({
  title: text(section?.title),
  subtitle: text(section?.subtitle),
  description: text(section?.description),
  isActive: section?.isActive !== false,
  image: asset(section?.image),
  button: button(section?.button),
});
const publicHeader = (section) => ({
  title: text(section?.title),
  subtitle: text(section?.subtitle),
  description: text(section?.description),
  image: publicAsset(section?.image),
  button: button(section?.button),
});

/* ---------- homepage ---------- */
export function adminHomepage(doc, { defaultOrder }) {
  if (!doc) return { exists: false, sectionOrder: [...defaultOrder] };
  const hero = doc.hero ?? {};
  return withSectionAppearance({
    exists: true,
    updatedAt: iso(doc.updatedAt),
    sectionOrder: completeOrder(doc.sectionOrder, defaultOrder),
    hero: {
      eyebrow: text(hero.eyebrow), title: text(hero.title), subtitle: text(hero.subtitle), description: text(hero.description),
      backgroundVideo: asset(hero.backgroundVideo), fallbackImage: asset(hero.fallbackImage), poster: asset(hero.poster),
      primaryButton: button(hero.primaryButton), secondaryButton: button(hero.secondaryButton),
      overlay: { color: hero.overlay?.color ?? '#000000', opacity: hero.overlay?.opacity ?? 0.5, isActive: hero.overlay?.isActive !== false },
      autoplay: hero.autoplay !== false, muted: hero.muted !== false, loop: hero.loop !== false, isActive: hero.isActive !== false,
    },
    trust: { ...header(doc.trust), items: sortByOrder(doc.trust?.items).map(trustItem) },
    servicesSection: { ...header(doc.servicesSection), cardImages: (doc.servicesSection?.cardImages ?? []).filter((c) => c.image?.url).map((c) => ({ slug: c.slug, image: asset(c.image) })) },
    whyChooseUs: { ...header(doc.whyChooseUs), items: sortByOrder(doc.whyChooseUs?.items).map(item) },
    howItWorks: { ...header(doc.howItWorks), steps: sortByOrder(doc.howItWorks?.steps).map(item) },
    industries: { ...header(doc.industries), cardImages: (doc.industries?.cardImages ?? []).filter((c) => c.image?.url).map((c) => ({ slug: c.slug, image: asset(c.image) })) },
    crossBorder: { ...header(doc.crossBorder), highlights: strings(doc.crossBorder?.highlights) },
    serviceAreas: { ...header(doc.serviceAreas), cardImages: (doc.serviceAreas?.cardImages ?? []).filter((c) => c.image?.url).map((c) => ({ slug: c.slug, image: asset(c.image) })) },
    statsSection: header(doc.statsSection),
    stats: sortByOrder(doc.stats).map((stat) => ({ id: id(stat._id), label: stat.label, value: stat.value, description: text(stat.description), isActive: stat.isActive !== false, displayOrder: stat.displayOrder ?? 0 })),
    networkSection: { ...header(doc.networkSection), items: sortByOrder(doc.networkSection?.items).map(item) },
    quoteSection: header(doc.quoteSection),
    testimonials: header(doc.testimonials),
    faq: header(doc.faq),
    finalCTA: { ...header(doc.finalCTA), primaryButton: button(doc.finalCTA?.primaryButton), secondaryButton: button(doc.finalCTA?.secondaryButton) },
    SEO: seo(doc.SEO),
  }, doc);
}

/** Saved order first, then any section the saved order does not mention (a newly added section is never lost). */
export function completeOrder(saved, defaultOrder) {
  const known = (saved ?? []).filter((key) => defaultOrder.includes(key));
  return [...known, ...defaultOrder.filter((key) => !known.includes(key))];
}

export function publicHomepage(doc, { defaultOrder }) {
  if (!doc) return { configured: false, sectionOrder: [...defaultOrder] };
  const hero = doc.hero ?? {};
  const heroActive = hero.isActive !== false;
  const section = (name, extra = {}) => ({ enabled: doc[name]?.isActive !== false, ...publicHeader(doc[name]), ...extra });
  return withSectionAppearance({
    configured: true,
    sectionOrder: completeOrder(doc.sectionOrder, defaultOrder),
    hero: {
      eyebrow: text(hero.eyebrow), title: text(hero.title), subtitle: text(hero.subtitle), description: text(hero.description),
      video: heroActive && hero.backgroundVideo?.url ? { url: hero.backgroundVideo.url, altText: text(hero.backgroundVideo.altText) } : null,
      poster: publicAsset(hero.poster) ?? publicAsset(hero.fallbackImage),
      fallbackImage: publicAsset(hero.fallbackImage),
      primaryButton: button(hero.primaryButton), secondaryButton: button(hero.secondaryButton),
      overlay: { color: hero.overlay?.color ?? '#000000', opacity: hero.overlay?.opacity ?? 0.5, enabled: hero.overlay?.isActive !== false },
      autoplay: hero.autoplay !== false, muted: hero.muted !== false, loop: hero.loop !== false,
    },
    trust: section('trust', { items: activeItems(doc.trust?.items).map(publicTrustItem) }),
    services: section('servicesSection', { cardImages: (doc.servicesSection?.cardImages ?? []).filter((c) => c.image?.url).map((c) => ({ slug: c.slug, image: publicAsset(c.image) })) }),
    whyChooseUs: section('whyChooseUs', { items: activeItems(doc.whyChooseUs?.items).map(publicItem) }),
    howItWorks: section('howItWorks', { steps: activeItems(doc.howItWorks?.steps).map(publicItem) }),
    industries: section('industries', { cardImages: (doc.industries?.cardImages ?? []).filter((c) => c.image?.url).map((c) => ({ slug: c.slug, image: publicAsset(c.image) })) }),
    crossBorder: section('crossBorder', { highlights: strings(doc.crossBorder?.highlights) }),
    serviceAreas: section('serviceAreas', { cardImages: (doc.serviceAreas?.cardImages ?? []).filter((c) => c.image?.url).map((c) => ({ slug: c.slug, image: publicAsset(c.image) })) }),
    stats: section('statsSection', { items: activeItems(doc.stats).map((stat) => ({ label: stat.label, value: stat.value, description: text(stat.description) })) }),
    network: section('networkSection', { items: activeItems(doc.networkSection?.items).map(publicItem) }),
    quote: section('quoteSection'),
    testimonials: section('testimonials'),
    faq: section('faq'),
    finalCTA: section('finalCTA', { primaryButton: button(doc.finalCTA?.primaryButton), secondaryButton: button(doc.finalCTA?.secondaryButton) }),
    seo: seo(doc.SEO),
  }, doc, (key) => ({ servicesSection: 'services', statsSection: 'stats' })[key] ?? key);
}

/* ---------- pages ---------- */
const pageSections = (list) => sortByOrder(list).map((s) => ({ id: id(s._id), heading: text(s.heading), body: text(s.body), image: asset(s.image), displayOrder: s.displayOrder ?? 0, isActive: s.isActive !== false }));

export function adminPage(doc) {
  return {
    id: id(doc._id), title: doc.title, slug: doc.slug, pageKey: doc.pageKey ?? null, isSystem: Boolean(doc.pageKey), status: doc.status,
    excerpt: text(doc.excerpt), content: text(doc.content), heroHeading: text(doc.heroHeading), heroSubtitle: text(doc.heroSubtitle),
    heroImage: asset(doc.heroImage), introImage: asset(doc.introImage), sections: pageSections(doc.sections), cta: button(doc.cta), displayOrder: doc.displayOrder ?? 0,
    SEO: seo(doc.SEO), createdAt: iso(doc.createdAt), updatedAt: iso(doc.updatedAt),
  };
}
export const adminPageSummary = (doc) => ({ id: id(doc._id), title: doc.title, slug: doc.slug, pageKey: doc.pageKey ?? null, isSystem: Boolean(doc.pageKey), status: doc.status, excerpt: text(doc.excerpt), updatedAt: iso(doc.updatedAt) });

export function publicPage(doc) {
  return {
    title: doc.title, slug: doc.slug, pageKey: doc.pageKey ?? null, excerpt: text(doc.excerpt), content: text(doc.content),
    heroHeading: text(doc.heroHeading), heroSubtitle: text(doc.heroSubtitle), heroImage: publicAsset(doc.heroImage), introImage: publicAsset(doc.introImage),
    sections: activeItems(doc.sections).map((s) => ({ heading: text(s.heading), body: text(s.body), image: publicAsset(s.image) })),
    cta: button(doc.cta), seo: seo(doc.SEO), updatedAt: iso(doc.updatedAt),
  };
}

/* ---------- services / industries / service areas ---------- */
export function adminService(doc, { areas } = {}) {
  return {
    id: id(doc._id), name: doc.name, slug: doc.slug, shortDescription: text(doc.shortDescription), fullDescription: text(doc.fullDescription), icon: text(doc.icon),
    image: asset(doc.image), heroImage: asset(doc.heroImage), benefits: strings(doc.benefits), features: strings(doc.features),
    serviceAreaIds: (doc.serviceAreaIds ?? []).map(String), serviceAreas: areas, cta: button(doc.cta), isFeatured: Boolean(doc.isFeatured),
    isActive: doc.isActive !== false, isArchived: archived(doc), displayOrder: doc.displayOrder ?? 0, SEO: seo(doc.SEO), createdAt: iso(doc.createdAt), updatedAt: iso(doc.updatedAt),
  };
}
export const adminServiceSummary = (doc) => ({ id: id(doc._id), name: doc.name, slug: doc.slug, shortDescription: text(doc.shortDescription), isFeatured: Boolean(doc.isFeatured), isActive: doc.isActive !== false, isArchived: archived(doc), displayOrder: doc.displayOrder ?? 0, updatedAt: iso(doc.updatedAt) });
export const publicServiceCard = (doc) => ({ slug: doc.slug, name: doc.name, shortDescription: text(doc.shortDescription), icon: text(doc.icon), image: publicAsset(doc.image), isFeatured: Boolean(doc.isFeatured) });
export const publicServiceDetail = (doc, areas = []) => ({
  ...publicServiceCard(doc), fullDescription: text(doc.fullDescription), heroImage: publicAsset(doc.heroImage), benefits: strings(doc.benefits), features: strings(doc.features),
  serviceAreas: areas.map(publicAreaCard), cta: button(doc.cta), seo: seo(doc.SEO),
});

export function adminIndustry(doc) {
  return {
    id: id(doc._id), name: doc.name, slug: doc.slug, shortDescription: text(doc.shortDescription), description: text(doc.description), icon: text(doc.icon),
    image: asset(doc.image), benefits: strings(doc.benefits), cta: button(doc.cta), isActive: doc.isActive !== false, isArchived: archived(doc),
    displayOrder: doc.displayOrder ?? 0, SEO: seo(doc.SEO), createdAt: iso(doc.createdAt), updatedAt: iso(doc.updatedAt),
  };
}
export const adminIndustrySummary = (doc) => ({ id: id(doc._id), name: doc.name, slug: doc.slug, shortDescription: text(doc.shortDescription), isActive: doc.isActive !== false, isArchived: archived(doc), displayOrder: doc.displayOrder ?? 0, updatedAt: iso(doc.updatedAt) });
export const publicIndustryCard = (doc) => ({ slug: doc.slug, name: doc.name, shortDescription: text(doc.shortDescription), icon: text(doc.icon), image: publicAsset(doc.image) });
export const publicIndustryDetail = (doc) => ({ ...publicIndustryCard(doc), description: text(doc.description), benefits: strings(doc.benefits), cta: button(doc.cta), seo: seo(doc.SEO) });

export function adminArea(doc) {
  return {
    id: id(doc._id), name: doc.title, slug: doc.slug ?? null, country: doc.country, stateProvince: text(doc.stateProvince), cityRegion: text(doc.cityRegion), description: text(doc.description),
    image: asset(doc.image), coverageType: doc.coverageType, isActive: doc.isActive !== false, isArchived: archived(doc), displayOrder: doc.displayOrder ?? 0,
    SEO: seo(doc.SEO), createdAt: iso(doc.createdAt), updatedAt: iso(doc.updatedAt),
  };
}
export const adminAreaSummary = (doc) => ({ id: id(doc._id), name: doc.title, slug: doc.slug ?? null, country: doc.country, stateProvince: text(doc.stateProvince), cityRegion: text(doc.cityRegion), isActive: doc.isActive !== false, isArchived: archived(doc), displayOrder: doc.displayOrder ?? 0, updatedAt: iso(doc.updatedAt) });
export const publicAreaCard = (doc) => ({ slug: doc.slug ?? null, name: doc.title, country: doc.country, stateProvince: text(doc.stateProvince), cityRegion: text(doc.cityRegion), description: text(doc.description), image: publicAsset(doc.image), coverageType: doc.coverageType });

/* ---------- faqs / testimonials ---------- */
export const adminFaq = (doc) => ({ id: id(doc._id), question: doc.question, answer: doc.answer, category: doc.category, isActive: doc.isActive !== false, isArchived: archived(doc), displayOrder: doc.displayOrder ?? 0, createdAt: iso(doc.createdAt), updatedAt: iso(doc.updatedAt) });
export const publicFaq = (doc) => ({ id: id(doc._id), question: doc.question, answer: doc.answer, category: doc.category });

export const adminTestimonial = (doc) => ({
  id: id(doc._id), customerName: doc.customerName, company: text(doc.company), position: text(doc.position), testimonial: doc.testimonial, photo: asset(doc.photo),
  rating: doc.rating ?? null, isFeatured: Boolean(doc.isFeatured), isActive: doc.isActive !== false, isArchived: archived(doc), displayOrder: doc.displayOrder ?? 0, createdAt: iso(doc.createdAt), updatedAt: iso(doc.updatedAt),
});
export const publicTestimonial = (doc) => ({ id: id(doc._id), customerName: doc.customerName, company: text(doc.company), position: text(doc.position), testimonial: doc.testimonial, photo: publicAsset(doc.photo), rating: doc.rating ?? null, isFeatured: Boolean(doc.isFeatured) });

/* ---------- blog ---------- */
export const isBlogLive = (doc, now = new Date()) => ['published', 'scheduled'].includes(doc.status) && Boolean(doc.publishedAt) && new Date(doc.publishedAt) <= now;

export function adminBlog(doc, now = new Date()) {
  return {
    id: id(doc._id), title: doc.title, slug: doc.slug, excerpt: text(doc.excerpt), content: text(doc.content), featuredImage: asset(doc.featuredImage), category: text(doc.category),
    tags: strings(doc.tags), authorName: text(doc.authorName), isFeatured: Boolean(doc.isFeatured), status: doc.status, isLive: isBlogLive(doc, now),
    publishedAt: iso(doc.publishedAt), scheduledAt: iso(doc.scheduledAt), SEO: seo(doc.SEO), createdAt: iso(doc.createdAt), updatedAt: iso(doc.updatedAt),
  };
}
export const adminBlogSummary = (doc, now = new Date()) => ({
  id: id(doc._id), title: doc.title, slug: doc.slug, category: text(doc.category), authorName: text(doc.authorName), isFeatured: Boolean(doc.isFeatured), status: doc.status,
  isLive: isBlogLive(doc, now), publishedAt: iso(doc.publishedAt), scheduledAt: iso(doc.scheduledAt), updatedAt: iso(doc.updatedAt),
});
export const publicBlogCard = (doc) => ({ slug: doc.slug, title: doc.title, excerpt: text(doc.excerpt), featuredImage: publicAsset(doc.featuredImage), category: text(doc.category), tags: strings(doc.tags), authorName: text(doc.authorName), isFeatured: Boolean(doc.isFeatured), publishedAt: iso(doc.publishedAt) });
export const publicBlogDetail = (doc) => ({ ...publicBlogCard(doc), content: text(doc.content), seo: seo(doc.SEO), updatedAt: iso(doc.updatedAt) });

/* ---------- media: storage keys and provider internals are never copied ---------- */
export const adminMedia = (doc) => ({
  id: id(doc._id), fileName: doc.fileName, url: doc.fileUrl, type: doc.type, mimeType: text(doc.mimeType), size: doc.size ?? null, width: doc.width ?? null, height: doc.height ?? null,
  altText: text(doc.altText), caption: text(doc.caption), folder: doc.folder ?? 'general', provider: doc.provider ?? 'external', isArchived: archived(doc), createdAt: iso(doc.createdAt), updatedAt: iso(doc.updatedAt),
  originalFileName: text(doc.originalFileName), duration: doc.duration ?? null, isStored: (doc.provider ?? 'external') !== 'external', status: archived(doc) ? 'archived' : 'active',
  uploaderName: doc.uploaderName ?? null, archivedAt: iso(doc.archivedAt),
});

/* ---------- settings ---------- */
const address = (value) => ({ street: text(value?.street), city: text(value?.city), state: text(value?.state), zipCode: text(value?.zipCode), country: text(value?.country) });
const hours = (rows) => (rows ?? []).map((row) => ({ day: row.day, isClosed: Boolean(row.isClosed), opensAt: text(row.opensAt), closesAt: text(row.closesAt) }));
const socials = (rows) => (rows ?? []).map((row) => ({ platform: row.platform, url: row.url }));

export function adminSettings(doc) {
  if (!doc) return { exists: false };
  return {
    exists: true, companyName: doc.companyName, shortName: text(doc.shortName), tagline: text(doc.tagline), phone: text(doc.phone), email: text(doc.email), address: address(doc.address),
    businessHours: hours(doc.businessHours), socialLinks: socials(doc.socialLinks), logo: asset(doc.logo), favicon: asset(doc.favicon), primaryCta: button(doc.primaryCta),
    footerText: text(doc.footerText), copyrightText: text(doc.copyrightText), timezone: text(doc.timezone), updatedAt: iso(doc.updatedAt),
  };
}
export function adminGlobalSeo(doc) {
  return {
    exists: Boolean(doc), siteName: doc?.companyName ?? null, websiteTitle: text(doc?.websiteTitle), description: text(doc?.description), canonicalBaseUrl: text(doc?.canonicalBaseUrl),
    defaultSEO: seo(doc?.defaultSEO), updatedAt: iso(doc?.updatedAt),
  };
}
export function adminThemeAppearance(doc) {
  const theme = resolveThemeAppearance(doc?.themeAppearance);
  return { theme, defaults: DEFAULT_THEME_APPEARANCE, isDefault: isDefaultTheme(theme), updatedAt: iso(doc?.updatedAt) };
}
/** Adds each stored section's resolved appearance (supported presets only) to a homepage payload. */
const withSectionAppearance = (payload, doc, keyFor = (key) => key) => {
  for (const key of Object.keys(SECTION_APPEARANCE_CAPABILITIES)) {
    const target = payload[keyFor(key)];
    if (target && typeof target === 'object') target.appearance = resolveSectionAppearance(key, doc?.[key]?.appearance);
  }
  return payload;
};
export function adminNavbarAppearance(doc) {
  const appearance = resolveNavbarAppearance(doc?.navbarAppearance);
  return { appearance, defaults: DEFAULT_NAVBAR_APPEARANCE, isDefault: isDefaultAppearance(appearance), updatedAt: iso(doc?.updatedAt) };
}
export function publicSettings(doc) {
  // Unchanged contract when nothing is saved: the website then uses its built-in defaults, including the navbar's.
  if (!doc) return { configured: false };
  return {
    configured: true, companyName: doc.companyName, shortName: text(doc.shortName), tagline: text(doc.tagline), websiteTitle: text(doc.websiteTitle), description: text(doc.description),
    phone: text(doc.phone), email: text(doc.email), address: address(doc.address), businessHours: hours(doc.businessHours), socialLinks: socials(doc.socialLinks),
    logo: publicAsset(doc.logo), favicon: publicAsset(doc.favicon), primaryCta: button(doc.primaryCta), footerText: text(doc.footerText), copyrightText: text(doc.copyrightText),
    canonicalBaseUrl: text(doc.canonicalBaseUrl), seo: seo(doc.defaultSEO), navbarAppearance: resolveNavbarAppearance(doc.navbarAppearance), themeAppearance: resolveThemeAppearance(doc.themeAppearance),
  };
}

export { seo as presentSeo };import { SECTION_APPEARANCE_CAPABILITIES, resolveSectionAppearance } from './sectionAppearance.js';
import { DEFAULT_THEME_APPEARANCE, isDefaultTheme, resolveThemeAppearance } from './themeAppearance.js';
import { DEFAULT_NAVBAR_APPEARANCE, isDefaultAppearance, resolveNavbarAppearance } from './navbarAppearance.js';

