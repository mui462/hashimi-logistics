import { createHash } from 'node:crypto';
import { Faq } from '../models/Faq.js';
import { Homepage } from '../models/Homepage.js';
import { Industry } from '../models/Industry.js';
import { Media } from '../models/Media.js';
import { Page } from '../models/Page.js';
import { Service } from '../models/Service.js';
import { ServiceArea } from '../models/ServiceArea.js';
import { SiteSettings } from '../models/SiteSettings.js';
import { Testimonial } from '../models/Testimonial.js';
import { BlogPost } from '../models/BlogPost.js';
import { HOMEPAGE_SECTION_KEYS, PAGE_KEYS } from '../models/enums.js';
import { recordActivity } from '../services/activity.service.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex, pagination, skipFor } from '../operations/common.js';
import * as P from './cms.presenters.js';
import { getStorageDriver, getStorageStatus, removeQuietly, storage } from '../storage/index.js';
import { inspectFile } from '../storage/fileValidation.js';
import { mediaTypeOf } from '../storage/fileTypes.js';
import { logger } from '../utils/logger.js';
import { User } from '../models/User.js';

/**
 * Super Admin CMS writes. The router mounts this behind authenticate + requireSuperAdmin. Handlers never read an actor,
 * role, status, owner or timestamp from the request body: status changes are named actions (publish, archive ...), the
 * acting user comes from the session, and every body is a strict allow-list (see cms.validator.js).
 */

const NOT_FOUND = (label) => ApiError.notFound(`That ${label} was not found.`, 'CMS_NOT_FOUND');
const actorId = (actor) => actor.userId;

/* ---------- helpers ---------- */
async function log(actor, context, { action, module = 'cms', entityId, description, metadata }) {
  await recordActivity({ userId: actorId(actor), action, module, entityId, description, metadata, context });
}

/** Fields the request changed (names only, never values), for the audit trail. */
const changedFields = (body) => Object.keys(body).filter((key) => key !== 'confirmSlugChange');

/** Writes allowed fields onto a document: `null` clears a field, SEO merges into what is stored, everything else replaces. */
function assign(doc, data) {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value === null) doc.set(key, undefined);
    else if (key === 'SEO' || key === 'defaultSEO') doc.set(key, { ...(doc[key]?.toObject ? doc[key].toObject() : doc[key] ?? {}), ...value });
    else doc.set(key, value);
  }
}

/** A duplicate-key error says which index failed on MongoDB (keyPattern) but not on every compatible server, so look it up. */
async function duplicateField(doc, error) {
  const Model = doc.constructor;
  const named = Object.keys(error.keyPattern ?? {})[0];
  // Check the more specific key first: a second system page collides on both its key and its slug.
  for (const field of ['pageKey', 'slug', 'storageKey']) {
    if (named === field && field !== 'slug') return field;
    if (doc.get(field) && (await Model.exists({ [field]: doc.get(field), _id: { $ne: doc._id } }))) return field;
  }
  return named ?? null;
}

async function saveDoc(doc, label) {
  try {
    await doc.save();
  } catch (error) {
    if (error?.code === 11000 || /duplicate key/i.test(error?.message ?? '')) {
      const field = await duplicateField(doc, error);
      if (field === 'slug') throw ApiError.conflict('Another record already uses that slug. Choose a different one.', 'SLUG_TAKEN', [{ field: 'slug', message: 'This slug is already in use.' }]);
      if (field === 'pageKey') throw ApiError.conflict('That system page already exists.', 'PAGE_KEY_TAKEN');
      if (field === 'storageKey') throw ApiError.conflict('That file has already been added to the media library.', 'MEDIA_EXISTS');
      throw ApiError.conflict(`That ${label} already exists.`);
    }
    throw error;
  }
}

const findById = async (Model, id, label) => {
  const doc = await Model.findById(id);
  if (!doc) throw NOT_FOUND(label);
  return doc;
};

function searchFilter(q, fields) {
  if (!q) return {};
  const pattern = new RegExp(escapeRegex(q), 'i');
  return { $or: fields.map((field) => ({ [field]: pattern })) };
}

async function listDocs(Model, { filter, sort, page, limit }) {
  const [items, total] = await Promise.all([
    Model.find(filter).sort(sort).skip(skipFor(page, limit)).limit(limit).lean(),
    Model.countDocuments(filter),
  ]);
  return { items, pagination: pagination(page, limit, total) };
}

/** `archived=true` shows only archived, `archived=false` only active, absent shows everything. */
function archiveFilter(query) {
  if (query.archived === 'true') return { archivedAt: { $ne: null } };
  if (query.archived === 'false') return { archivedAt: null };
  return {};
}
const visibleFilter = (query) => (query.visible ? { isActive: query.visible === 'true' } : {});
const flagFilter = (query, key = 'featured', field = 'isFeatured') => (query[key] ? { [field]: query[key] === 'true' } : {});

/** Changing the slug of a record visitors can already reach breaks its URL, so the admin must confirm it. */
function guardSlugChange(doc, nextSlug, confirm, live) {
  if (nextSlug !== undefined && nextSlug !== doc.slug && live && confirm !== true) {
    throw ApiError.conflict('This changes the public address of live content, which breaks existing links. Confirm to continue.', 'SLUG_CHANGE_NEEDS_CONFIRMATION', [{ field: 'slug', message: 'Confirm the new address.' }]);
  }
}

/* ---------- overview ---------- */
export async function getOverview() {
  const now = new Date();
  const [pages, pagesPublished, services, servicesVisible, industries, industriesVisible, areas, areasVisible, faqs, faqsVisible, testimonials, testimonialsVisible, posts, postsLive, media, homepage, settings] = await Promise.all([
    Page.countDocuments({}), Page.countDocuments({ status: 'published' }),
    Service.countDocuments({ archivedAt: null }), Service.countDocuments({ archivedAt: null, isActive: true }),
    Industry.countDocuments({ archivedAt: null }), Industry.countDocuments({ archivedAt: null, isActive: true }),
    ServiceArea.countDocuments({ archivedAt: null }), ServiceArea.countDocuments({ archivedAt: null, isActive: true }),
    Faq.countDocuments({ archivedAt: null }), Faq.countDocuments({ archivedAt: null, isActive: true }),
    Testimonial.countDocuments({ archivedAt: null }), Testimonial.countDocuments({ archivedAt: null, isActive: true }),
    BlogPost.countDocuments({ status: { $ne: 'archived' } }), BlogPost.countDocuments({ status: { $in: ['published', 'scheduled'] }, publishedAt: { $lte: now } }),
    Media.countDocuments({}), Homepage.exists({}), SiteSettings.exists({}),
  ]);
  return {
    homepage: { configured: Boolean(homepage) }, settings: { configured: Boolean(settings) }, storage: getStorageStatus(),
    pages: { total: pages, published: pagesPublished }, services: { total: services, visible: servicesVisible }, industries: { total: industries, visible: industriesVisible },
    serviceAreas: { total: areas, visible: areasVisible }, faqs: { total: faqs, visible: faqsVisible }, testimonials: { total: testimonials, visible: testimonialsVisible },
    blog: { total: posts, live: postsLive }, media: { total: media },
  };
}

/* ---------- homepage ---------- */
export async function getHomepage() {
  return P.adminHomepage(await Homepage.findOne({ key: 'primary' }), { defaultOrder: HOMEPAGE_SECTION_KEYS });
}

export async function updateHomepage(body, actor, context) {
  const doc = await Homepage.getPrimary();
  for (const [key, value] of Object.entries(body)) {
    if (key === 'hero') {
      const current = doc.hero?.toObject ? doc.hero.toObject() : doc.hero ?? {};
      const next = { ...current };
      for (const [field, fieldValue] of Object.entries(value)) {
        if (fieldValue === null) delete next[field];
        else next[field] = field === 'overlay' ? { ...(current.overlay ?? {}), ...fieldValue } : fieldValue;
      }
      doc.set('hero', next);
    } else if (key === 'SEO') {
      assign(doc, { SEO: value });
    } else {
      // A section is replaced as a whole; items inside it are replaced too, so the editor always saves what it shows.
      const cleaned = value && !Array.isArray(value) && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null)) : value;
      doc.set(key, cleaned);
    }
  }
  await saveDoc(doc, 'homepage');
  await log(actor, context, { action: 'cms.homepage.updated', entityId: doc._id, description: 'The homepage content was updated.', metadata: { changedFields: changedFields(body) } });
  return getHomepage();
}

/* ---------- pages ---------- */
export async function listPages(query) {
  const filter = { ...(query.status ? { status: query.status } : {}), ...(query.system ? { pageKey: query.system === 'true' ? { $exists: true } : { $exists: false } } : {}), ...searchFilter(query.q, ['title', 'slug']) };
  const { items, pagination: meta } = await listDocs(Page, { filter, sort: { displayOrder: 1, title: 1 }, page: query.page, limit: query.limit });
  const existing = new Set((await Page.find({ pageKey: { $exists: true } }).select('pageKey').lean()).map((p) => p.pageKey));
  return { items: items.map(P.adminPageSummary), pagination: meta, availableSystemPages: PAGE_KEYS.filter((key) => !existing.has(key)) };
}
export const getPage = async (id) => P.adminPage(await findById(Page, id, 'page'));

export async function createPage(body, actor, context) {
  const data = { ...body };
  if (data.pageKey) {
    if (data.slug && data.slug !== data.pageKey) throw ApiError.validation([{ field: 'slug', message: `A system page always uses the address "${data.pageKey}".` }]);
    data.slug = data.pageKey;
  }
  const doc = new Page({ status: 'draft' });
  assign(doc, data);
  await saveDoc(doc, 'page');
  await log(actor, context, { action: 'cms.page.created', entityId: doc._id, description: `Page "${doc.title}" was created as a draft.`, metadata: { slug: doc.slug, pageKey: doc.pageKey ?? null } });
  return P.adminPage(doc);
}

export async function updatePage(id, body, actor, context) {
  const doc = await findById(Page, id, 'page');
  const { confirmSlugChange, ...data } = body;
  if (data.slug !== undefined && doc.pageKey && data.slug !== doc.slug) throw ApiError.conflict('The address of a system page cannot be changed.', 'SYSTEM_PAGE_LOCKED', [{ field: 'slug', message: 'This address is fixed.' }]);
  guardSlugChange(doc, data.slug, confirmSlugChange, doc.status === 'published');
  assign(doc, data);
  await saveDoc(doc, 'page');
  await log(actor, context, { action: 'cms.page.updated', entityId: doc._id, description: `Page "${doc.title}" was updated.`, metadata: { changedFields: changedFields(body), status: doc.status } });
  return P.adminPage(doc);
}

async function setPageStatus(id, status, action, actor, context) {
  const doc = await findById(Page, id, 'page');
  if (status === 'archived' && doc.pageKey) throw ApiError.conflict('A system page cannot be archived: the website needs it. Set it to draft to fall back to the built-in content.', 'SYSTEM_PAGE_LOCKED');
  if (doc.status === status) throw ApiError.conflict(`This page is already ${status}.`, 'ALREADY_IN_STATE');
  doc.status = status;
  await saveDoc(doc, 'page');
  await log(actor, context, { action: `cms.page.${action}`, entityId: doc._id, description: `Page "${doc.title}" was ${action}.`, metadata: { slug: doc.slug } });
  return P.adminPage(doc);
}
export const publishPage = (id, actor, context) => setPageStatus(id, 'published', 'published', actor, context);
export const unpublishPage = (id, actor, context) => setPageStatus(id, 'draft', 'unpublished', actor, context);
export const archivePage = (id, actor, context) => setPageStatus(id, 'archived', 'archived', actor, context);
export const restorePage = async (id, actor, context) => {
  const doc = await findById(Page, id, 'page');
  if (doc.status !== 'archived') throw ApiError.conflict('Only an archived page can be restored.', 'ALREADY_IN_STATE');
  return setPageStatus(id, 'draft', 'restored', actor, context);
};

/* ---------- soft-deletable collections: services, industries, service areas, faqs, testimonials ---------- */
const COLLECTIONS = {
  service: {
    Model: Service, label: 'service', plural: 'services', action: 'service', search: ['name', 'slug', 'shortDescription'], sort: { displayOrder: 1, name: 1 }, hasSlug: true,
    summary: P.adminServiceSummary, nameOf: (doc) => doc.name,
    extraFilter: (q) => flagFilter(q),
    async full(doc) {
      const areas = doc.serviceAreaIds?.length ? (await ServiceArea.find({ _id: { $in: doc.serviceAreaIds } }).select('title slug').lean()).map((a) => ({ id: String(a._id), name: a.title, slug: a.slug ?? null })) : [];
      return P.adminService(doc, { areas });
    },
    async beforeSave(data) {
      if (data.serviceAreaIds?.length) {
        const found = await ServiceArea.countDocuments({ _id: { $in: data.serviceAreaIds } });
        if (found !== data.serviceAreaIds.length) throw ApiError.validation([{ field: 'serviceAreaIds', message: 'One of the selected service areas does not exist.' }]);
      }
    },
  },
  industry: { Model: Industry, label: 'industry', plural: 'industries', action: 'industry', search: ['name', 'slug', 'shortDescription'], sort: { displayOrder: 1, name: 1 }, hasSlug: true, summary: P.adminIndustrySummary, full: async (doc) => P.adminIndustry(doc), nameOf: (doc) => doc.name, extraFilter: () => ({}) },
  serviceArea: {
    Model: ServiceArea, label: 'service area', plural: 'service areas', action: 'service_area', search: ['title', 'slug', 'stateProvince', 'cityRegion'], sort: { displayOrder: 1, title: 1 }, hasSlug: true, summary: P.adminAreaSummary, full: async (doc) => P.adminArea(doc),
    nameOf: (doc) => doc.title, extraFilter: (q) => (q.country ? { country: q.country } : {}), map: ({ name, ...rest }) => (name === undefined ? rest : { title: name, ...rest }),
  },
  faq: {
    Model: Faq, label: 'FAQ', plural: 'FAQs', action: 'faq', search: ['question', 'answer'], sort: { category: 1, displayOrder: 1 }, hasSlug: false, summary: P.adminFaq, full: async (doc) => P.adminFaq(doc),
    nameOf: (doc) => doc.question, extraFilter: (q) => (q.category ? { category: q.category } : {}),
  },
  testimonial: {
    Model: Testimonial, label: 'testimonial', plural: 'testimonials', action: 'testimonial', search: ['customerName', 'company', 'testimonial'], sort: { displayOrder: 1, createdAt: -1 }, hasSlug: false, summary: P.adminTestimonial, full: async (doc) => P.adminTestimonial(doc),
    nameOf: (doc) => doc.customerName, extraFilter: (q) => flagFilter(q),
  },
};
export const collectionKeys = Object.keys(COLLECTIONS);
const cfg = (key) => COLLECTIONS[key];
const liveItem = (doc) => doc.isActive !== false && !doc.archivedAt;

export async function listCollection(key, query) {
  const c = cfg(key);
  const filter = { ...archiveFilter(query), ...visibleFilter(query), ...c.extraFilter(query), ...searchFilter(query.q, c.search) };
  const { items, pagination: meta } = await listDocs(c.Model, { filter, sort: c.sort, page: query.page, limit: query.limit });
  return { items: items.map((doc) => c.summary(doc)), pagination: meta };
}
export async function getCollectionItem(key, id) {
  const c = cfg(key);
  return c.full(await findById(c.Model, id, c.label));
}

export async function createCollectionItem(key, body, actor, context) {
  const c = cfg(key);
  const data = c.map ? c.map({ ...body }) : { ...body };
  await c.beforeSave?.(data);
  const doc = new c.Model();
  assign(doc, data);
  await saveDoc(doc, c.label);
  await log(actor, context, { action: `cms.${c.action}.created`, entityId: doc._id, description: `${c.label[0].toUpperCase()}${c.label.slice(1)} "${c.nameOf(doc)}" was created.`, metadata: c.hasSlug ? { slug: doc.slug } : {} });
  return c.full(doc);
}

export async function updateCollectionItem(key, id, body, actor, context) {
  const c = cfg(key);
  const doc = await findById(c.Model, id, c.label);
  const { confirmSlugChange, ...rest } = body;
  const data = c.map ? c.map({ ...rest }) : { ...rest };
  if (c.hasSlug) guardSlugChange(doc, data.slug, confirmSlugChange, liveItem(doc));
  await c.beforeSave?.(data);
  assign(doc, data);
  await saveDoc(doc, c.label);
  const visibilityChanged = 'isActive' in body;
  await log(actor, context, {
    action: `cms.${c.action}.${visibilityChanged && Object.keys(rest).length === 1 ? (doc.isActive ? 'shown' : 'hidden') : 'updated'}`,
    entityId: doc._id, description: `${c.label[0].toUpperCase()}${c.label.slice(1)} "${c.nameOf(doc)}" was updated.`, metadata: { changedFields: changedFields(body) },
  });
  return c.full(doc);
}

export async function archiveCollectionItem(key, id, actor, context) {
  const c = cfg(key);
  const doc = await findById(c.Model, id, c.label);
  if (doc.archivedAt) throw ApiError.conflict(`This ${c.label} is already archived.`, 'ALREADY_IN_STATE');
  await doc.archive(actorId(actor));
  await log(actor, context, { action: `cms.${c.action}.archived`, entityId: doc._id, description: `${c.label[0].toUpperCase()}${c.label.slice(1)} "${c.nameOf(doc)}" was archived.` });
  return c.full(doc);
}
export async function restoreCollectionItem(key, id, actor, context) {
  const c = cfg(key);
  const doc = await findById(c.Model, id, c.label);
  if (!doc.archivedAt) throw ApiError.conflict(`Only an archived ${c.label} can be restored.`, 'ALREADY_IN_STATE');
  await doc.restore();
  await log(actor, context, { action: `cms.${c.action}.restored`, entityId: doc._id, description: `${c.label[0].toUpperCase()}${c.label.slice(1)} "${c.nameOf(doc)}" was restored.` });
  return c.full(doc);
}

/** Display order is set from the order of the ids the editor sends (10, 20, 30 ...). Unknown or archived ids are refused. */
export async function reorderCollection(key, ids, actor, context) {
  const c = cfg(key);
  const found = await c.Model.countDocuments({ _id: { $in: ids }, archivedAt: null });
  if (found !== ids.length) throw ApiError.validation([{ field: 'ids', message: 'One of the items does not exist or is archived.' }]);
  await Promise.all(ids.map((id, index) => c.Model.updateOne({ _id: id }, { $set: { displayOrder: (index + 1) * 10 } })));
  await log(actor, context, { action: `cms.${c.action}.reordered`, description: `${c.plural[0].toUpperCase()}${c.plural.slice(1)} were reordered.`, metadata: { count: ids.length } });
  return listCollection(key, { page: 1, limit: 100, archived: 'false' });
}

/* ---------- blog ---------- */
const sinceNow = () => new Date();
const BLOG_LIVE_STATUSES = ['published', 'scheduled'];

export async function listBlog(query) {
  const filter = {
    ...(query.status ? { status: query.status } : {}), ...(query.category ? { category: query.category } : {}), ...flagFilter(query),
    ...searchFilter(query.q, ['title', 'slug', 'excerpt', 'category', 'tags']),
  };
  const sort = { [query.sort]: query.order === 'asc' ? 1 : -1 };
  const { items, pagination: meta } = await listDocs(BlogPost, { filter, sort, page: query.page, limit: query.limit });
  const now = sinceNow();
  return { items: items.map((doc) => P.adminBlogSummary(doc, now)), pagination: meta };
}
export const getBlog = async (id) => P.adminBlog(await findById(BlogPost, id, 'blog post'));

export async function createBlog(body, actor, context) {
  const doc = new BlogPost({ status: 'draft', author: actorId(actor) });
  assign(doc, body);
  await saveDoc(doc, 'blog post');
  await log(actor, context, { action: 'cms.blog.drafted', entityId: doc._id, description: `Blog post "${doc.title}" was saved as a draft.`, metadata: { slug: doc.slug } });
  return P.adminBlog(doc);
}

export async function updateBlog(id, body, actor, context) {
  const doc = await findById(BlogPost, id, 'blog post');
  const { confirmSlugChange, ...data } = body;
  guardSlugChange(doc, data.slug, confirmSlugChange, BLOG_LIVE_STATUSES.includes(doc.status));
  assign(doc, data);
  await saveDoc(doc, 'blog post');
  await log(actor, context, { action: 'cms.blog.updated', entityId: doc._id, description: `Blog post "${doc.title}" was updated.`, metadata: { changedFields: changedFields(body), status: doc.status } });
  return P.adminBlog(doc);
}

function assertBlogReady(doc) {
  const problems = [];
  if (!doc.content?.trim()) problems.push({ field: 'content', message: 'Write the post content before publishing.' });
  if (!doc.excerpt?.trim()) problems.push({ field: 'excerpt', message: 'Add a short excerpt before publishing.' });
  if (problems.length) throw ApiError.conflict('This post is not ready to publish.', 'BLOG_NOT_READY', problems);
}

export async function publishBlog(id, actor, context) {
  const doc = await findById(BlogPost, id, 'blog post');
  if (doc.status === 'archived') throw ApiError.conflict('Restore this post before publishing it.', 'INVALID_STATE');
  if (doc.status === 'published') throw ApiError.conflict('This post is already published.', 'ALREADY_IN_STATE');
  assertBlogReady(doc);
  doc.status = 'published';
  doc.scheduledAt = undefined;
  if (!doc.publishedAt || doc.publishedAt > new Date()) doc.publishedAt = new Date();
  await saveDoc(doc, 'blog post');
  await log(actor, context, { action: 'cms.blog.published', entityId: doc._id, description: `Blog post "${doc.title}" was published.`, metadata: { slug: doc.slug } });
  return P.adminBlog(doc);
}

export async function scheduleBlog(id, { scheduledAt }, actor, context) {
  const doc = await findById(BlogPost, id, 'blog post');
  if (doc.status === 'archived') throw ApiError.conflict('Restore this post before scheduling it.', 'INVALID_STATE');
  const when = new Date(scheduledAt);
  if (when <= new Date()) throw ApiError.validation([{ field: 'scheduledAt', message: 'Choose a time in the future. To publish now, use Publish.' }]);
  assertBlogReady(doc);
  doc.status = 'scheduled';
  doc.scheduledAt = when;
  doc.publishedAt = when; // the public API shows a post once publishedAt has passed, so scheduling needs no background job
  await saveDoc(doc, 'blog post');
  await log(actor, context, { action: 'cms.blog.scheduled', entityId: doc._id, description: `Blog post "${doc.title}" was scheduled.`, metadata: { slug: doc.slug, scheduledAt: when.toISOString() } });
  return P.adminBlog(doc);
}

export async function unpublishBlog(id, actor, context) {
  const doc = await findById(BlogPost, id, 'blog post');
  if (!BLOG_LIVE_STATUSES.includes(doc.status)) throw ApiError.conflict('Only a published or scheduled post can be moved back to draft.', 'ALREADY_IN_STATE');
  doc.status = 'draft';
  doc.scheduledAt = undefined;
  if (doc.publishedAt > new Date()) doc.publishedAt = undefined;
  await saveDoc(doc, 'blog post');
  await log(actor, context, { action: 'cms.blog.unpublished', entityId: doc._id, description: `Blog post "${doc.title}" was moved back to draft.`, metadata: { slug: doc.slug } });
  return P.adminBlog(doc);
}

export async function archiveBlog(id, actor, context) {
  const doc = await findById(BlogPost, id, 'blog post');
  if (doc.status === 'archived') throw ApiError.conflict('This post is already archived.', 'ALREADY_IN_STATE');
  doc.status = 'archived';
  await saveDoc(doc, 'blog post');
  await log(actor, context, { action: 'cms.blog.archived', entityId: doc._id, description: `Blog post "${doc.title}" was archived.`, metadata: { slug: doc.slug } });
  return P.adminBlog(doc);
}

export async function restoreBlog(id, actor, context) {
  const doc = await findById(BlogPost, id, 'blog post');
  if (doc.status !== 'archived') throw ApiError.conflict('Only an archived post can be restored.', 'ALREADY_IN_STATE');
  doc.status = 'draft';
  doc.scheduledAt = undefined;
  await saveDoc(doc, 'blog post');
  await log(actor, context, { action: 'cms.blog.restored', entityId: doc._id, description: `Blog post "${doc.title}" was restored to draft.`, metadata: { slug: doc.slug } });
  return P.adminBlog(doc);
}

/* ---------- media ---------- */
export const getStorage = () => getStorageStatus();

export async function listMedia(query) {
  const filter = { ...(query.type ? { type: query.type } : {}), ...(query.folder ? { folder: query.folder } : {}), ...(query.archived === 'true' ? { archivedAt: { $ne: null } } : query.archived === 'false' ? { archivedAt: null } : {}), ...searchFilter(query.q, ['fileName', 'altText', 'caption']) };
  const { items, pagination: meta } = await listDocs(Media, { filter, sort: { createdAt: -1 }, page: query.page, limit: query.limit });
  const folders = await Media.distinct('folder', { archivedAt: null });
  const users = await User.find({ _id: { $in: [...new Set(items.map((item) => String(item.uploadedBy)).filter(Boolean))] } }).select('firstName lastName').lean();
  const names = new Map(users.map((user) => [String(user._id), `${user.firstName} ${user.lastName}`.trim()]));
  return { items: items.map((item) => P.adminMedia({ ...item, uploaderName: names.get(String(item.uploadedBy)) ?? null })), pagination: meta, folders: folders.sort(), storage: getStorageStatus() };
}
export const getMedia = async (id) => P.adminMedia(await findById(Media, id, 'media item'));

/** Registers a file that is already hosted online. Nothing is fetched or uploaded: the address is stored as a link. */
export async function registerExternalMedia(body, actor, context) {
  const doc = new Media({
    fileName: body.fileName, fileUrl: body.url, storageKey: `external:${createHash('sha256').update(body.url).digest('hex').slice(0, 40)}`, type: body.type,
    mimeType: body.mimeType, size: body.size, width: body.width, height: body.height, altText: body.altText, caption: body.caption, folder: body.folder ?? 'general',
    provider: 'external', uploadedBy: actorId(actor),
  });
  await saveDoc(doc, 'media item');
  await log(actor, context, { action: 'media.registered', module: 'media', entityId: doc._id, description: `Media "${doc.fileName}" was added by link.`, metadata: { type: doc.type, folder: doc.folder, provider: 'external' } });
  return P.adminMedia(doc);
}

export async function updateMedia(id, body, actor, context) {
  const doc = await findById(Media, id, 'media item');
  assign(doc, body);
  await saveDoc(doc, 'media item');
  await log(actor, context, { action: 'media.updated', module: 'media', entityId: doc._id, description: `Media "${doc.fileName}" details were updated.`, metadata: { changedFields: changedFields(body) } });
  return P.adminMedia(doc);
}
/**
 * Permanently deletes a media item: the stored file (and any earlier versions kept by "replace") is removed from storage, then the
 * library record is removed from the database. Linked files (provider "external") live elsewhere, so only the record goes. A storage
 * clean-up failure is logged and never blocks the delete. Pages that already use the address will no longer show the file.
 */
export async function deleteMedia(id, actor, context) {
  const doc = await Media.findOne({ _id: id }).select('+previousVersions');
  if (!doc) throw NOT_FOUND('media item');
  const stored = [{ storageKey: doc.storageKey, provider: doc.provider }, ...(doc.previousVersions ?? [])].filter((file) => file.storageKey && (file.provider ?? 'external') !== 'external');
  if (stored.length > 0 && storage.isConfigured()) {
    for (const file of stored) await removeQuietly(file.storageKey, logger);
  } else if (stored.length > 0) {
    logger.warn('Media storage is not configured, so the stored file of a deleted media item could not be removed and needs manual cleanup.');
  }
  await Media.deleteOne({ _id: doc._id }, { allowHardDelete: true });
  await log(actor, context, { action: 'media.deleted', module: 'media', entityId: doc._id, description: `Media "${doc.fileName}" was permanently deleted.`, metadata: { type: doc.type, folder: doc.folder, provider: doc.provider } });
  return { id: String(doc._id), deleted: true };
}
/**
 * Validates the file (declared type, extension and real file signature), stores it as public website media, then creates the
 * library record. If the record cannot be created the stored file is removed again. Media is public by design: private
 * operational documents never go through here (see documents/document.service.js).
 */
export async function uploadMedia(file, query, actor, context) {
  const inspected = inspectFile(file.buffer, { declaredType: file.declaredType, fileName: query.fileName, purpose: 'media' });
  const folder = query.folder ?? 'general';
  const uploaded = await storage.upload({ buffer: file.buffer, mimeType: inspected.mimeType, fileName: inspected.fileName, folder, access: 'public' });
  const doc = new Media({
    fileName: inspected.fileName, originalFileName: inspected.fileName, fileUrl: uploaded.url, storageKey: uploaded.storageKey, type: mediaTypeOf(inspected.mimeType),
    mimeType: inspected.mimeType, size: uploaded.bytes ?? file.size, width: uploaded.width ?? inspected.width, height: uploaded.height ?? inspected.height,
    duration: uploaded.duration ?? inspected.duration, altText: query.altText, caption: query.caption, folder, provider: getStorageDriver().name, uploadedBy: actorId(actor),
  });
  try {
    await saveDoc(doc, 'media item');
  } catch (error) {
    await removeQuietly(uploaded.storageKey, logger);
    throw error;
  }
  await log(actor, context, { action: 'media.uploaded', module: 'media', entityId: doc._id, description: `Media "${doc.fileName}" was uploaded.`, metadata: { type: doc.type, folder, provider: doc.provider, mimeType: doc.mimeType, size: doc.size } });
  return P.adminMedia(doc);
}

/**
 * Replaces the file behind a media item. The new file is stored first; only when that succeeded is the record updated, and the
 * previous stored object is kept (listed in previousVersions), so a failed upload never breaks the existing item and nothing is
 * deleted. Pages that already copied the old address keep working; to show the new file in a page, pick it again there.
 */
export async function replaceMedia(id, file, query, actor, context) {
  const doc = await Media.findOne({ _id: id }).select('+previousVersions');
  if (!doc) throw NOT_FOUND('media item');
  if (doc.archivedAt) throw ApiError.conflict('Restore this media item before replacing its file.', 'MEDIA_ARCHIVED');
  const inspected = inspectFile(file.buffer, { declaredType: file.declaredType, fileName: query.fileName, purpose: 'media' });
  if (mediaTypeOf(inspected.mimeType) !== doc.type) throw ApiError.validation([{ field: 'file', message: `Replace this ${doc.type} with another ${doc.type}.` }]);
  const uploaded = await storage.upload({ buffer: file.buffer, mimeType: inspected.mimeType, fileName: inspected.fileName, folder: doc.folder ?? 'general', access: 'public' });
  const previous = { fileUrl: doc.fileUrl, storageKey: doc.storageKey, provider: doc.provider, size: doc.size, replacedAt: new Date() };
  try {
    doc.previousVersions = [...(doc.previousVersions ?? []), previous].slice(-10);
    Object.assign(doc, {
      fileName: inspected.fileName, originalFileName: inspected.fileName, fileUrl: uploaded.url, storageKey: uploaded.storageKey, mimeType: inspected.mimeType,
      size: uploaded.bytes ?? file.size, width: uploaded.width ?? inspected.width, height: uploaded.height ?? inspected.height, duration: uploaded.duration ?? inspected.duration,
      provider: getStorageDriver().name,
    });
    await saveDoc(doc, 'media item');
  } catch (error) {
    await removeQuietly(uploaded.storageKey, logger);
    throw error;
  }
  await log(actor, context, { action: 'media.replaced', module: 'media', entityId: doc._id, description: `The file for media "${doc.fileName}" was replaced.`, metadata: { type: doc.type, provider: doc.provider, mimeType: doc.mimeType, size: doc.size } });
  return P.adminMedia(doc);
}

/* ---------- SEO ---------- */
const SEO_KINDS = {
  page: { Model: Page, title: (d) => d.title, path: (d) => (d.pageKey ? `/${d.pageKey === 'privacy' || d.pageKey === 'terms' ? d.pageKey : d.pageKey}` : `/pages/${d.slug}`), status: (d) => d.status },
  blog: { Model: BlogPost, title: (d) => d.title, path: (d) => `/resources/${d.slug}`, status: (d) => d.status },
  service: { Model: Service, title: (d) => d.name, path: (d) => `/services/${d.slug}`, status: (d) => (d.archivedAt ? 'archived' : d.isActive ? 'visible' : 'hidden') },
  industry: { Model: Industry, title: (d) => d.name, path: (d) => `/industries/${d.slug}`, status: (d) => (d.archivedAt ? 'archived' : d.isActive ? 'visible' : 'hidden') },
  'service-area': { Model: ServiceArea, title: (d) => d.title, path: (d) => `/service-areas#${d.slug ?? ''}`, status: (d) => (d.archivedAt ? 'archived' : d.isActive ? 'visible' : 'hidden') },
};

const seoIssues = (seo) => {
  const issues = [];
  if (!seo.title) issues.push('No SEO title');
  if (!seo.description) issues.push('No SEO description');
  else if (seo.description.length < 50) issues.push('SEO description is short');
  return issues;
};

export async function getSeo() {
  const settings = await SiteSettings.findOne({ key: 'primary' });
  const homepage = await Homepage.findOne({ key: 'primary' }).select('SEO');
  const entries = [{ kind: 'homepage', id: null, title: 'Homepage', path: '/', status: 'published', seo: P.presentSeo(homepage?.SEO), issues: seoIssues(P.presentSeo(homepage?.SEO)) }];
  for (const [kind, c] of Object.entries(SEO_KINDS)) {
    const docs = await c.Model.find({}).select('title name slug SEO status isActive archivedAt pageKey').sort({ updatedAt: -1 }).limit(200).lean();
    for (const doc of docs) {
      const seo = P.presentSeo(doc.SEO);
      entries.push({ kind, id: String(doc._id), title: c.title(doc), path: c.path(doc), status: c.status(doc), seo, issues: seoIssues(seo) });
    }
  }
  return { global: P.adminGlobalSeo(settings), entries };
}

export async function updateGlobalSeo(body, actor, context) {
  const doc = await SiteSettings.getPrimary();
  assign(doc, body);
  await saveDoc(doc, 'settings');
  await log(actor, context, { action: 'seo.global.updated', module: 'seo', entityId: doc._id, description: 'Global SEO settings were updated.', metadata: { changedFields: changedFields(body) } });
  return P.adminGlobalSeo(doc);
}

export async function updateHomepageSeo(body, actor, context) {
  const doc = await Homepage.getPrimary();
  assign(doc, { SEO: body.SEO });
  await saveDoc(doc, 'homepage');
  await log(actor, context, { action: 'seo.homepage.updated', module: 'seo', entityId: doc._id, description: 'Homepage SEO was updated.' });
  return { kind: 'homepage', seo: P.presentSeo(doc.SEO) };
}

export async function updateEntrySeo(kind, id, body, actor, context) {
  const c = SEO_KINDS[kind];
  const doc = await findById(c.Model, id, kind.replace('-', ' '));
  assign(doc, { SEO: body.SEO });
  await saveDoc(doc, kind);
  await log(actor, context, { action: `seo.${kind.replace('-', '_')}.updated`, module: 'seo', entityId: doc._id, description: `SEO for "${c.title(doc)}" was updated.` });
  return { kind, id: String(doc._id), seo: P.presentSeo(doc.SEO) };
}

/* ---------- website settings ---------- */
export async function getSettings() {
  return P.adminSettings(await SiteSettings.findOne({ key: 'primary' }));
}
export async function getThemeAppearance() {
  return P.adminThemeAppearance(await SiteSettings.findOne({ key: 'primary' }).lean());
}
export async function saveThemeAppearance(theme, actor, context) {
  const doc = await SiteSettings.getPrimary();
  doc.themeAppearance = theme;
  await saveDoc(doc, 'settings');
  await log(actor, context, { action: 'settings.theme_appearance.updated', module: 'settings', entityId: doc._id, description: 'The website theme was updated.' });
  return P.adminThemeAppearance(doc.toObject());
}
/** Back to the default palette and presets by removing the saved theme. Every other website setting stays as it is. */
export async function resetThemeAppearance(actor, context) {
  const doc = await SiteSettings.getPrimary();
  doc.themeAppearance = undefined;
  await saveDoc(doc, 'settings');
  await log(actor, context, { action: 'settings.theme_appearance.reset', module: 'settings', entityId: doc._id, description: 'The website theme was reset to the defaults.' });
  return P.adminThemeAppearance(doc.toObject());
}
export async function getNavbarAppearance() {
  return P.adminNavbarAppearance(await SiteSettings.findOne({ key: 'primary' }).lean());
}
export async function saveNavbarAppearance(appearance, actor, context) {
  const doc = await SiteSettings.getPrimary();
  doc.navbarAppearance = appearance;
  await saveDoc(doc, 'settings');
  await log(actor, context, { action: 'settings.navbar_appearance.updated', module: 'settings', entityId: doc._id, description: 'The website navbar appearance was updated.' });
  return P.adminNavbarAppearance(doc.toObject());
}
/** Back to the approved defaults by removing the saved appearance. Every other website setting stays as it is. */
export async function resetNavbarAppearance(actor, context) {
  const doc = await SiteSettings.getPrimary();
  doc.navbarAppearance = undefined;
  await saveDoc(doc, 'settings');
  await log(actor, context, { action: 'settings.navbar_appearance.reset', module: 'settings', entityId: doc._id, description: 'The website navbar appearance was reset to the defaults.' });
  return P.adminNavbarAppearance(doc.toObject());
}
export async function updateSettings(body, actor, context) {
  const doc = await SiteSettings.getPrimary();
  const data = { ...body };
  if (data.address) data.address = Object.fromEntries(Object.entries(data.address).filter(([, v]) => v !== ''));
  for (const key of ['phone', 'email', 'shortName', 'tagline', 'footerText', 'copyrightText', 'timezone']) if (data[key] === '') data[key] = null;
  if (data.businessHours) data.businessHours = data.businessHours.map((row) => ({ day: row.day, isClosed: row.isClosed, ...(row.opensAt ? { opensAt: row.opensAt } : {}), ...(row.closesAt ? { closesAt: row.closesAt } : {}) }));
  assign(doc, data);
  await saveDoc(doc, 'settings');
  await log(actor, context, { action: 'settings.site.updated', module: 'settings', entityId: doc._id, description: 'Website settings were updated.', metadata: { changedFields: changedFields(body) } });
  return P.adminSettings(doc);
}

