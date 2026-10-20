import { BlogPost } from '../models/BlogPost.js';
import { Faq } from '../models/Faq.js';
import { Homepage } from '../models/Homepage.js';
import { Industry } from '../models/Industry.js';
import { Page } from '../models/Page.js';
import { Service } from '../models/Service.js';
import { ServiceArea } from '../models/ServiceArea.js';
import { SiteSettings } from '../models/SiteSettings.js';
import { Testimonial } from '../models/Testimonial.js';
import { HOMEPAGE_SECTION_KEYS } from '../models/enums.js';
import { escapeRegex, pagination, skipFor } from '../operations/common.js';
import { ApiError } from '../utils/ApiError.js';
import * as P from './cms.presenters.js';

/**
 * Public CMS read API. Every query here repeats the visibility rule in its filter, so a draft, hidden, archived or not-yet-
 * scheduled record can never be returned, and every response goes through an allow-list presenter in cms.presenters.js.
 *
 * `configured` tells the website whether the Super Admin has started using a collection. While a collection has never been
 * used (no record at all) the website keeps its built-in Phase 4 content; once any record exists the CMS is authoritative,
 * even if everything is hidden. Testimonials and blog posts have no built-in content and never fall back.
 */
const notFound = (label) => ApiError.notFound(`That ${label} was not found.`, 'CONTENT_NOT_FOUND');
const VISIBLE = { isActive: true, archivedAt: null };
const ordered = { displayOrder: 1 };

const liveBlogFilter = (now = new Date()) => ({ status: { $in: ['published', 'scheduled'] }, publishedAt: { $lte: now } });

export async function getSiteSettings() {
  return P.publicSettings(await SiteSettings.findOne({ key: 'primary' }));
}

export async function listPages() {
  const docs = await Page.find({ status: 'published' }).sort({ displayOrder: 1, title: 1 }).lean();
  return { items: docs.map(P.publicPage) };
}
export async function getPage(slug) {
  const doc = await Page.findOne({ slug, status: 'published' }).lean();
  if (!doc) throw notFound('page');
  return P.publicPage(doc);
}

export async function listServices() {
  const [docs, any] = await Promise.all([Service.find(VISIBLE).sort({ ...ordered, name: 1 }).lean(), Service.exists({})]);
  return { configured: Boolean(any), items: docs.map(P.publicServiceCard) };
}
export async function getService(slug) {
  const doc = await Service.findOne({ slug, ...VISIBLE }).lean();
  if (!doc) throw notFound('service');
  const areas = doc.serviceAreaIds?.length ? await ServiceArea.find({ _id: { $in: doc.serviceAreaIds }, ...VISIBLE }).sort({ ...ordered, title: 1 }).lean() : [];
  return P.publicServiceDetail(doc, areas);
}

export async function listIndustries() {
  const [docs, any] = await Promise.all([Industry.find(VISIBLE).sort({ ...ordered, name: 1 }).lean(), Industry.exists({})]);
  return { configured: Boolean(any), items: docs.map(P.publicIndustryCard) };
}
export async function getIndustry(slug) {
  const doc = await Industry.findOne({ slug, ...VISIBLE }).lean();
  if (!doc) throw notFound('industry');
  return P.publicIndustryDetail(doc);
}

export async function listServiceAreas() {
  const [docs, any] = await Promise.all([ServiceArea.find(VISIBLE).sort({ ...ordered, title: 1 }).lean(), ServiceArea.exists({})]);
  return { configured: Boolean(any), items: docs.map(P.publicAreaCard) };
}

export async function listFaqs({ category } = {}) {
  const [docs, any] = await Promise.all([Faq.find({ ...VISIBLE, ...(category ? { category } : {}) }).sort({ category: 1, ...ordered }).lean(), Faq.exists({})]);
  return { configured: Boolean(any), items: docs.map(P.publicFaq) };
}

export async function listTestimonials() {
  const docs = await Testimonial.find(VISIBLE).sort({ ...ordered, createdAt: -1 }).limit(50).lean();
  return { items: docs.map(P.publicTestimonial) };
}

export async function listBlog({ page, limit, q, category, tag, featured }) {
  const filter = {
    ...liveBlogFilter(),
    ...(category ? { category } : {}),
    ...(tag ? { tags: tag } : {}),
    ...(featured ? { isFeatured: featured === 'true' } : {}),
    ...(q ? { $or: ['title', 'excerpt', 'category'].map((field) => ({ [field]: new RegExp(escapeRegex(q), 'i') })) } : {}),
  };
  const [docs, total, categories] = await Promise.all([
    BlogPost.find(filter).select('-content').sort({ publishedAt: -1 }).skip(skipFor(page, limit)).limit(limit).lean(),
    BlogPost.countDocuments(filter),
    BlogPost.distinct('category', liveBlogFilter()),
  ]);
  return { items: docs.map(P.publicBlogCard), ...pagination(page, limit, total), categories: categories.filter(Boolean).sort() };
}
export async function getBlogPost(slug) {
  const doc = await BlogPost.findOne({ slug, ...liveBlogFilter() }).lean();
  if (!doc) throw notFound('article');
  return P.publicBlogDetail(doc);
}

/** One grouped call for the whole homepage so the page does not fan out into a dozen requests. */
export async function getHomepage() {
  const [homepage, services, industries, areas, faqs, testimonials] = await Promise.all([
    Homepage.findOne({ key: 'primary' }).lean(),
    listServices(), listIndustries(), listServiceAreas(), listFaqs(), listTestimonials(),
  ]);
  return {
    ...P.publicHomepage(homepage, { defaultOrder: HOMEPAGE_SECTION_KEYS }),
    collections: {
      services, industries, serviceAreas: areas,
      faqs: { configured: faqs.configured, items: faqs.items.slice(0, 6) },
      testimonials,
    },
  };
}

/** Global SEO plus the SEO of every published page, for the website's head manager. */
export async function getSeo() {
  const [settings, homepage, pages] = await Promise.all([
    SiteSettings.findOne({ key: 'primary' }).lean(),
    Homepage.findOne({ key: 'primary' }).select('SEO').lean(),
    Page.find({ status: 'published' }).select('slug pageKey SEO').lean(),
  ]);
  const site = P.publicSettings(settings);
  return {
    global: { siteName: site.companyName ?? null, websiteTitle: site.websiteTitle ?? null, description: site.description ?? null, canonicalBaseUrl: site.canonicalBaseUrl ?? null, ...(site.seo ?? {}) },
    homepage: P.presentSeo(homepage?.SEO),
    pages: pages.map((page) => ({ slug: page.slug, pageKey: page.pageKey ?? null, seo: P.presentSeo(page.SEO) })),
  };
}
