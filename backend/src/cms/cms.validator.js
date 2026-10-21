import { z } from 'zod';
import { COUNTRIES, COVERAGE_TYPES, FAQ_CATEGORIES, HOMEPAGE_SECTION_KEYS, MEDIA_TYPES, PAGE_KEYS, SOCIAL_PLATFORMS, WEEKDAYS } from '../models/enums.js';
import { objectIdSchema } from '../validators/common.validator.js';
import { HEX_COLOR, NAVBAR_APPEARANCE_SPEC } from './navbarAppearance.js';
import { SECTION_ANIMATIONS, SECTION_APPEARANCE_CAPABILITIES, SECTION_CARD_STYLES, SECTION_SPACINGS } from './sectionAppearance.js';
import { THEME_APPEARANCE_SPEC } from './themeAppearance.js';

/** A section's appearance: only the presets that section supports; any other key or value is a 422. */
const appearanceFor = (sectionKey) => {
  const caps = SECTION_APPEARANCE_CAPABILITIES[sectionKey];
  const shape = {};
  if (caps.backgrounds) shape.background = z.enum(caps.backgrounds, { error: 'Choose one of the listed backgrounds.' }).optional();
  if (caps.spacing) shape.spacing = z.enum(SECTION_SPACINGS).optional();
  if (caps.animation) shape.animation = z.enum(SECTION_ANIMATIONS).optional();
  if (caps.cardStyle) shape.cardStyle = z.enum(SECTION_CARD_STYLES).optional();
  return z.object(shape).strict().optional();
};
import {
  businessCopy, button, canonicalUrl, createBody, displayOrder, httpUrl, idList, idOnly, list, mediaRef, optionalHttpUrl, pageQuery, plain,
  required, searchTerm, seo, slug, withBody,
} from './cms.rules.js';

export { idParamSchema } from '../validators/common.validator.js';
export { idOnly };

const nullable = (schema) => schema.nullable();
const boolString = z.enum(['true', 'false']);
const sortOrder = z.enum(['asc', 'desc']).default('asc');
const listQuery = (extra = {}) => z.object({ query: z.object({ ...pageQuery, q: searchTerm.optional(), ...extra }).strict() });
const archivedFilter = { archived: boolString.optional(), visible: boolString.optional() };

/** Every field is optional on update; create adds the required ones. `confirmSlugChange` is read by the service and never stored. */
const confirm = { confirmSlugChange: z.boolean().optional() };
const make = (shape, requiredKeys) => {
  const createShape = Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, requiredKeys.includes(key) ? value : value.optional()]));
  const updateShape = Object.fromEntries(Object.entries({ ...shape, ...confirm }).map(([key, value]) => [key, value.optional()]));
  return { create: createBody(createShape), update: withBody(updateShape) };
};

/* ---------- homepage ---------- */
const sectionHeader = {
  title: plain(150).optional(),
  subtitle: plain(200).optional(),
  description: plain(1500).optional(),
  isActive: z.boolean().optional(),
  image: nullable(mediaRef).optional(),
  button: nullable(button).optional(),
};
const contentItem = z.object({ title: plain(150, { min: 1 }), description: plain(1000).optional(), icon: plain(60).optional(), displayOrder: displayOrder.optional(), isActive: z.boolean().optional() }).strict();
const trustItem = z.object({ title: plain(150, { min: 1 }), description: plain(1000).optional(), icon: plain(60).optional(), image: nullable(mediaRef).optional(), displayOrder: displayOrder.optional(), isActive: z.boolean().optional() }).strict();
const section = (extra = {}) => z.object({ ...sectionHeader, ...extra }).strict();
const hex = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i, 'Use a hex colour such as #000000.');

export const homepageSchema = z.object({
  body: z
    .object({
      hero: z
        .object({
          eyebrow: plain(100).optional(),
          title: plain(200).optional(),
          subtitle: plain(250).optional(),
          description: plain(1500).optional(),
          backgroundVideo: nullable(mediaRef).optional(),
          fallbackImage: nullable(mediaRef).optional(),
          poster: nullable(mediaRef).optional(),
          primaryButton: nullable(button).optional(),
          secondaryButton: nullable(button).optional(),
          overlay: z.object({ color: hex.optional(), opacity: z.number().min(0).max(1).optional(), isActive: z.boolean().optional() }).strict().optional(),
          autoplay: z.boolean().optional(),
          muted: z.boolean().optional(),
          loop: z.boolean().optional(),
          isActive: z.boolean().optional(),
        })
        .strict()
        .optional(),
      sectionOrder: z.array(z.enum(HOMEPAGE_SECTION_KEYS)).max(HOMEPAGE_SECTION_KEYS.length).refine((keys) => new Set(keys).size === keys.length, 'Each section may appear once.').optional(),
      trust: section({ items: list(trustItem, 8).optional(), appearance: appearanceFor('trust') }).optional(),
      servicesSection: section({ cardImages: list(z.object({ slug: plain(80, { min: 1 }), image: mediaRef }).strict(), 30).optional(), appearance: appearanceFor('servicesSection') }).optional(),
      whyChooseUs: section({ items: list(contentItem, 12).optional(), appearance: appearanceFor('whyChooseUs') }).optional(),
      howItWorks: section({ steps: list(contentItem, 12).optional(), appearance: appearanceFor('howItWorks') }).optional(),
      industries: section({ cardImages: list(z.object({ slug: plain(80, { min: 1 }), image: mediaRef }).strict(), 30).optional(), appearance: appearanceFor('industries') }).optional(),
      crossBorder: section({ highlights: list(businessCopy(200), 10).optional(), appearance: appearanceFor('crossBorder') }).optional(),
      serviceAreas: section({ cardImages: list(z.object({ slug: plain(80, { min: 1 }), image: mediaRef }).strict(), 30).optional(), appearance: appearanceFor('serviceAreas') }).optional(),
      statsSection: section({ appearance: appearanceFor('statsSection') }).optional(),
      stats: list(z.object({ label: required(80), value: required(40), description: plain(200).optional(), isActive: z.boolean().optional(), displayOrder: displayOrder.optional() }).strict(), 12).optional(),
      networkSection: section({ items: list(contentItem, 6).optional() }).optional(),
      quoteSection: section().optional(),
      testimonials: section({ appearance: appearanceFor('testimonials') }).optional(),
      faq: section({ appearance: appearanceFor('faq') }).optional(),
      finalCTA: section({ primaryButton: nullable(button).optional(), secondaryButton: nullable(button).optional(), appearance: appearanceFor('finalCTA') }).optional(),
      SEO: seo.optional(),
    })
    .strict(),
});

/* ---------- collections ---------- */
const mediaOrNull = nullable(mediaRef);
const benefits = list(businessCopy(200, { forbidGuarantees: true }), 20);

export const pageKeyParam = z.object({ params: z.object({ id: objectIdSchema }) });
export const pagesList = listQuery({ status: z.enum(['draft', 'published', 'archived']).optional(), system: boolString.optional() });
export const pageShape = {
  title: required(200),
  slug,
  pageKey: z.enum(PAGE_KEYS),
  excerpt: plain(500),
  content: plain(100000),
  heroHeading: plain(200),
  heroSubtitle: plain(300),
  heroImage: mediaOrNull,
  introImage: mediaOrNull,
  sections: list(z.object({ heading: plain(150), body: plain(20000), image: mediaOrNull.optional(), displayOrder: displayOrder.optional(), isActive: z.boolean().optional() }).strict(), 30),
  cta: nullable(button),
  displayOrder,
  SEO: seo,
};
export const pageCreate = createBody(Object.fromEntries(Object.entries(pageShape).map(([key, value]) => [key, key === 'title' ? value : value.optional()])));
const { pageKey: _pageKey, ...pageUpdatable } = pageShape;
void _pageKey;
export const pageUpdate = withBody(Object.fromEntries(Object.entries({ ...pageUpdatable, ...confirm }).map(([key, value]) => [key, value.optional()])));

const serviceShape = {
  name: required(150),
  slug,
  shortDescription: businessCopy(400),
  fullDescription: businessCopy(50000),
  icon: plain(60),
  image: mediaOrNull,
  heroImage: mediaOrNull,
  benefits,
  features: list(businessCopy(200, { forbidGuarantees: true }), 20),
  serviceAreaIds: idList(50),
  cta: nullable(button),
  isFeatured: z.boolean(),
  isActive: z.boolean(),
  displayOrder,
  SEO: seo,
};
export const servicesList = listQuery({ ...archivedFilter, featured: boolString.optional() });
export const serviceSchemas = make(serviceShape, ['name']);

const industryShape = {
  name: required(150),
  slug,
  shortDescription: businessCopy(400),
  description: businessCopy(50000),
  icon: plain(60),
  image: mediaOrNull,
  benefits,
  cta: nullable(button),
  isActive: z.boolean(),
  displayOrder,
  SEO: seo,
};
export const industriesList = listQuery(archivedFilter);
export const industrySchemas = make(industryShape, ['name']);

const areaShape = {
  name: required(150),
  slug,
  country: z.enum(COUNTRIES),
  stateProvince: plain(80),
  cityRegion: plain(120),
  description: businessCopy(3000),
  image: mediaOrNull,
  coverageType: z.enum(COVERAGE_TYPES),
  isActive: z.boolean(),
  displayOrder,
  SEO: seo,
};
export const areasList = listQuery({ ...archivedFilter, country: z.enum(COUNTRIES).optional() });
export const areaSchemas = make(areaShape, ['name', 'country']);

const faqShape = {
  question: required(300).pipe(businessCopy(300, { forbidGuarantees: true })),
  answer: required(5000).pipe(businessCopy(5000, { forbidGuarantees: true })),
  category: z.enum(FAQ_CATEGORIES),
  isActive: z.boolean(),
  displayOrder,
};
export const faqsList = listQuery({ ...archivedFilter, category: z.enum(FAQ_CATEGORIES).optional() });
export const faqSchemas = make(faqShape, ['question', 'answer']);

const testimonialShape = {
  customerName: required(120),
  company: plain(150),
  position: plain(120),
  testimonial: required(2000),
  photo: mediaOrNull,
  rating: nullable(z.number().int().min(1).max(5)),
  isFeatured: z.boolean(),
  isActive: z.boolean(),
  displayOrder,
};
export const testimonialsList = listQuery({ ...archivedFilter, featured: boolString.optional() });
export const testimonialSchemas = make(testimonialShape, ['customerName', 'testimonial']);

export const reorderSchema = z.object({ body: z.object({ ids: idList(500).refine((ids) => ids.length > 0, 'Provide at least one item.') }).strict() });

/* ---------- blog ---------- */
const tag = plain(50, { min: 1 }).transform((value) => value.toLowerCase());
const blogShape = {
  title: required(200),
  slug,
  excerpt: plain(500),
  content: plain(100000),
  featuredImage: mediaOrNull,
  category: plain(80),
  tags: list(tag, 20),
  authorName: plain(120),
  isFeatured: z.boolean(),
  SEO: seo,
};
export const blogList = listQuery({ status: z.enum(['draft', 'scheduled', 'published', 'archived']).optional(), category: plain(80, { min: 1 }).optional(), featured: boolString.optional(), sort: z.enum(['updatedAt', 'publishedAt', 'title']).default('updatedAt'), order: z.enum(['asc', 'desc']).default('desc') });
export const blogSchemas = make(blogShape, ['title']);
export const blogSchedule = withBody({ scheduledAt: z.string().datetime({ offset: true }) });

/* ---------- media ---------- */
export const mediaList = listQuery({ type: z.enum(MEDIA_TYPES).optional(), folder: plain(120, { min: 1 }).optional(), archived: boolString.optional() });
export const mediaExternal = createBody({
  url: httpUrl,
  fileName: required(255),
  type: z.enum(MEDIA_TYPES),
  mimeType: plain(120).optional(),
  size: z.number().int().min(0).max(5_000_000_000).optional(),
  width: z.number().int().min(1).max(20000).optional(),
  height: z.number().int().min(1).max(20000).optional(),
  altText: plain(200).optional(),
  caption: plain(500).optional(),
  folder: plain(120, { min: 1 }).optional(),
});
const folderName = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{0,59}$/, 'Use lowercase letters, numbers, hyphens or underscores.');
const fileNameQuery = z.string().trim().min(1).max(255).refine((value) => !/[<>\u0000-\u001f]/.test(value), 'Use plain text without markup.');
/** The file itself is the raw request body; its details travel in a strict query string. */
export const mediaUpload = z.object({
  query: z.object({ fileName: fileNameQuery, folder: folderName.optional(), altText: plain(200).optional(), caption: plain(500).optional() }).strict(),
});
export const mediaReplace = z.object({
  params: z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier.') }),
  query: z.object({ fileName: fileNameQuery }).strict(),
});
export const mediaUpdate = withBody({
  fileName: required(255).optional(),
  altText: plain(200).optional(),
  caption: plain(500).optional(),
  folder: plain(120, { min: 1 }).optional(),
  width: z.number().int().min(1).max(20000).nullable().optional(),
  height: z.number().int().min(1).max(20000).nullable().optional(),
});

/* ---------- seo ---------- */
export const seoGlobal = z.object({
  body: z
    .object({
      websiteTitle: plain(120).optional(),
      description: plain(500).optional(),
      canonicalBaseUrl: optionalHttpUrl.optional(),
      defaultSEO: seo.optional(),
    })
    .strict(),
});
export const seoKinds = ['page', 'blog', 'service', 'industry', 'service-area'];
export const seoEntry = z.object({ params: z.object({ kind: z.enum(seoKinds), id: objectIdSchema }), body: z.object({ SEO: seo }).strict() });
export const seoHomepage = z.object({ body: z.object({ SEO: seo }).strict() });
export const emptyQuery = z.object({ query: z.object({}).strict() });

/* ---------- settings ---------- */
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm.');
const phone = z.union([z.literal(''), z.string().trim().regex(/^[+()\-.\s\d]{7,30}$/, 'Enter a valid phone number.')]);
const email = z.union([z.literal(''), z.string().trim().max(254).email('Enter a valid email address.')]);
export const settingsSchema = z.object({
  body: z
    .object({
      companyName: required(150),
      shortName: plain(60),
      tagline: plain(200),
      phone,
      email,
      address: z.object({ street: plain(200), city: plain(100), state: plain(50), zipCode: plain(20), country: z.union([z.literal(''), z.enum(COUNTRIES)]) }).strict(),
      businessHours: z
        .array(z.object({ day: z.enum(WEEKDAYS), isClosed: z.boolean(), opensAt: z.union([z.literal(''), time]), closesAt: z.union([z.literal(''), time]) }).strict())
        .max(7)
        .refine((rows) => new Set(rows.map((row) => row.day)).size === rows.length, 'Each weekday may appear once.'),
      socialLinks: z.array(z.object({ platform: z.enum(SOCIAL_PLATFORMS), url: httpUrl }).strict()).max(6),
      logo: mediaOrNull,
      favicon: mediaOrNull,
      primaryCta: nullable(button),
      footerText: plain(500),
      copyrightText: plain(200),
      timezone: plain(60),
    })
    .partial()
    .strict(),
});
export { canonicalUrl };

/* ---------- navbar appearance (Website CMS -> Navbar appearance) ---------- */

// Built from the one spec in navbarAppearance.js. Every group and field is required and nothing else is accepted, so a save is
// always a complete, known-safe configuration: #RRGGBB colours, whole numbers within range, true/false switches. No CSS strings.
const appearanceField = (field) => {
  if (field.type === 'color') return z.string().regex(HEX_COLOR, 'Use a hex colour such as #D8AD54.');
  if (field.type === 'number') return z.number({ error: 'Enter a whole number.' }).int('Enter a whole number.').min(field.min, `Use ${field.min} or more.`).max(field.max, `Use ${field.max} or less.`);
  return z.boolean();
};
export const navbarAppearanceSchema = z.object({
  body: z
    .object(Object.fromEntries(Object.entries(NAVBAR_APPEARANCE_SPEC).map(([group, fields]) => [group, z.object(Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, appearanceField(field)]))).strict()])))
    .strict(),
});

/* ---------- website theme (Website CMS -> Website theme) ---------- */

// The complete set, built from the one spec: #RRGGBB colours, named presets and whole numbers within range. No CSS strings.
const themeField = (field) => {
  if (field.type === 'color') return z.string().regex(HEX_COLOR, 'Use a hex colour such as #D8AD54.');
  if (field.type === 'enum') return z.enum(field.options, { error: 'Choose one of the listed options.' });
  return z.number({ error: 'Enter a whole number.' }).int('Enter a whole number.').min(field.min, `Use ${field.min} or more.`).max(field.max, `Use ${field.max} or less.`);
};
export const themeAppearanceSchema = z.object({
  body: z
    .object(Object.fromEntries(Object.entries(THEME_APPEARANCE_SPEC).map(([group, fields]) => [group, z.object(Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, themeField(field)]))).strict()])))
    .strict(),
});
