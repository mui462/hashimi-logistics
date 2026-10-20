import { Router } from 'express';
import { noStore } from '../middleware/noStore.js';
import { rejectOperators } from '../middleware/rejectOperators.js';
import { validate } from '../middleware/validate.js';
import { requestContext } from '../services/activity.service.js';
import { readUpload, requireStorage } from '../storage/uploadBody.js';
import { sendSuccess } from '../utils/apiResponse.js';
import * as service from './cms.service.js';
import * as v from './cms.validator.js';

/**
 * Super Admin CMS API (Phase 9), mounted at /api/v1/admin/cms behind authenticate + requireSuperAdmin, so guests get 401 and
 * customers/carriers get 403 before any handler runs. It never reads an actor, role, status or owner from a body: the acting
 * user is the session, and status changes are named actions. Bodies are strict allow-lists; operator-looking keys get a 400.
 */
const router = Router();
router.use(noStore);
router.use(rejectOperators);

const actor = (req) => ({ userId: req.user._id });
const ctx = requestContext;
const handle = (fn, { message = 'OK', statusCode = 200 } = {}) => async (req, res) => sendSuccess(res, { data: await fn(req), message, statusCode });
const params = (req) => req.validated.params;
const body = (req) => req.validated.body;
const query = (req) => req.validated.query;

router.get('/overview', validate(v.emptyQuery), handle(() => service.getOverview()));

/* homepage */
router.get('/homepage', validate(v.emptyQuery), handle(() => service.getHomepage()));
router.patch('/homepage', validate(v.homepageSchema), handle((req) => service.updateHomepage(body(req), actor(req), ctx(req)), { message: 'Homepage saved.' }));

/* pages */
router.get('/pages', validate(v.pagesList), handle((req) => service.listPages(query(req))));
router.post('/pages', validate(v.pageCreate), handle((req) => service.createPage(body(req), actor(req), ctx(req)), { message: 'Page created.', statusCode: 201 }));
router.get('/pages/:id', validate(v.idOnly), handle((req) => service.getPage(params(req).id)));
router.patch('/pages/:id', validate(v.pageUpdate), handle((req) => service.updatePage(params(req).id, body(req), actor(req), ctx(req)), { message: 'Page saved.' }));
router.post('/pages/:id/publish', validate(v.idOnly), handle((req) => service.publishPage(params(req).id, actor(req), ctx(req)), { message: 'Page published.' }));
router.post('/pages/:id/unpublish', validate(v.idOnly), handle((req) => service.unpublishPage(params(req).id, actor(req), ctx(req)), { message: 'Page moved back to draft.' }));
router.post('/pages/:id/archive', validate(v.idOnly), handle((req) => service.archivePage(params(req).id, actor(req), ctx(req)), { message: 'Page archived.' }));
router.post('/pages/:id/restore', validate(v.idOnly), handle((req) => service.restorePage(params(req).id, actor(req), ctx(req)), { message: 'Page restored.' }));

/* services, industries, service areas, FAQs, testimonials share one shape */
const collections = [
  ['services', 'service', v.servicesList, v.serviceSchemas],
  ['industries', 'industry', v.industriesList, v.industrySchemas],
  ['service-areas', 'serviceArea', v.areasList, v.areaSchemas],
  ['faqs', 'faq', v.faqsList, v.faqSchemas],
  ['testimonials', 'testimonial', v.testimonialsList, v.testimonialSchemas],
];
for (const [path, key, listSchema, schemas] of collections) {
  router.get(`/${path}`, validate(listSchema), handle((req) => service.listCollection(key, query(req))));
  router.post(`/${path}`, validate(schemas.create), handle((req) => service.createCollectionItem(key, body(req), actor(req), ctx(req)), { message: 'Saved.', statusCode: 201 }));
  router.post(`/${path}/reorder`, validate(v.reorderSchema), handle((req) => service.reorderCollection(key, body(req).ids, actor(req), ctx(req)), { message: 'Order saved.' }));
  router.get(`/${path}/:id`, validate(v.idOnly), handle((req) => service.getCollectionItem(key, params(req).id)));
  router.patch(`/${path}/:id`, validate(schemas.update), handle((req) => service.updateCollectionItem(key, params(req).id, body(req), actor(req), ctx(req)), { message: 'Saved.' }));
  router.post(`/${path}/:id/archive`, validate(v.idOnly), handle((req) => service.archiveCollectionItem(key, params(req).id, actor(req), ctx(req)), { message: 'Archived.' }));
  router.post(`/${path}/:id/restore`, validate(v.idOnly), handle((req) => service.restoreCollectionItem(key, params(req).id, actor(req), ctx(req)), { message: 'Restored.' }));
}

/* blog */
router.get('/blog', validate(v.blogList), handle((req) => service.listBlog(query(req))));
router.post('/blog', validate(v.blogSchemas.create), handle((req) => service.createBlog(body(req), actor(req), ctx(req)), { message: 'Draft saved.', statusCode: 201 }));
router.get('/blog/:id', validate(v.idOnly), handle((req) => service.getBlog(params(req).id)));
router.patch('/blog/:id', validate(v.blogSchemas.update), handle((req) => service.updateBlog(params(req).id, body(req), actor(req), ctx(req)), { message: 'Post saved.' }));
router.post('/blog/:id/publish', validate(v.idOnly), handle((req) => service.publishBlog(params(req).id, actor(req), ctx(req)), { message: 'Post published.' }));
router.post('/blog/:id/schedule', validate(v.blogSchedule), handle((req) => service.scheduleBlog(params(req).id, body(req), actor(req), ctx(req)), { message: 'Post scheduled.' }));
router.post('/blog/:id/unpublish', validate(v.idOnly), handle((req) => service.unpublishBlog(params(req).id, actor(req), ctx(req)), { message: 'Post moved back to draft.' }));
router.post('/blog/:id/archive', validate(v.idOnly), handle((req) => service.archiveBlog(params(req).id, actor(req), ctx(req)), { message: 'Post archived.' }));
router.post('/blog/:id/restore', validate(v.idOnly), handle((req) => service.restoreBlog(params(req).id, actor(req), ctx(req)), { message: 'Post restored.' }));

/* media */
router.get('/media/storage', validate(v.emptyQuery), handle(() => service.getStorage()));
router.get('/media', validate(v.mediaList), handle((req) => service.listMedia(query(req))));
router.post('/media/external', validate(v.mediaExternal), handle((req) => service.registerExternalMedia(body(req), actor(req), ctx(req)), { message: 'Media added.', statusCode: 201 }));
// Phase 10: real uploads. No storage configured -> 501 STORAGE_NOT_CONFIGURED before the file is read.
router.post('/media/upload', requireStorage, validate(v.mediaUpload), readUpload('media'), handle((req) => service.uploadMedia(req.upload, query(req), actor(req), ctx(req)), { message: 'File uploaded.', statusCode: 201 }));
router.post('/media/:id/replace', requireStorage, validate(v.mediaReplace), readUpload('media'), handle((req) => service.replaceMedia(params(req).id, req.upload, query(req), actor(req), ctx(req)), { message: 'File replaced. The previous file was kept.' }));
router.get('/media/:id', validate(v.idOnly), handle((req) => service.getMedia(params(req).id)));
router.patch('/media/:id', validate(v.mediaUpdate), handle((req) => service.updateMedia(params(req).id, body(req), actor(req), ctx(req)), { message: 'Media saved.' }));
router.delete('/media/:id', validate(v.idOnly), handle((req) => service.deleteMedia(params(req).id, actor(req), ctx(req)), { message: 'Media deleted.' }));

/* SEO */
router.get('/seo', validate(v.emptyQuery), handle(() => service.getSeo()));
router.patch('/seo/global', validate(v.seoGlobal), handle((req) => service.updateGlobalSeo(body(req), actor(req), ctx(req)), { message: 'SEO settings saved.' }));
router.patch('/seo/homepage', validate(v.seoHomepage), handle((req) => service.updateHomepageSeo(body(req), actor(req), ctx(req)), { message: 'SEO saved.' }));
router.patch('/seo/:kind/:id', validate(v.seoEntry), handle((req) => service.updateEntrySeo(params(req).kind, params(req).id, body(req), actor(req), ctx(req)), { message: 'SEO saved.' }));

/* website settings */
router.get('/settings', validate(v.emptyQuery), handle(() => service.getSettings()));
router.patch('/settings', validate(v.settingsSchema), handle((req) => service.updateSettings(body(req), actor(req), ctx(req)), { message: 'Website settings saved.' }));
// Navbar appearance: read, save (the complete set) and reset to the approved defaults. Super Admin only (mounted behind requireSuperAdmin).
router.get('/settings/navbar-appearance', validate(v.emptyQuery), handle(() => service.getNavbarAppearance()));
// Website theme: read, save (the complete set) and reset to the default palette. Super Admin only, like everything here.
router.get('/settings/theme-appearance', validate(v.emptyQuery), handle(() => service.getThemeAppearance()));
router.put('/settings/theme-appearance', validate(v.themeAppearanceSchema), handle((req) => service.saveThemeAppearance(body(req), actor(req), ctx(req)), { message: 'Website theme saved.' }));
router.post('/settings/theme-appearance/reset', validate(v.emptyQuery), handle((req) => service.resetThemeAppearance(actor(req), ctx(req)), { message: 'Website theme reset to the defaults.' }));
router.put('/settings/navbar-appearance', validate(v.navbarAppearanceSchema), handle((req) => service.saveNavbarAppearance(body(req), actor(req), ctx(req)), { message: 'Navbar appearance saved.' }));
router.post('/settings/navbar-appearance/reset', validate(v.emptyQuery), handle((req) => service.resetNavbarAppearance(actor(req), ctx(req)), { message: 'Navbar appearance reset to the defaults.' }));

export default router;
