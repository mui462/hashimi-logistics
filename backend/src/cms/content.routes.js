import { Router } from 'express';
import { z } from 'zod';
import { FAQ_CATEGORIES } from '../models/enums.js';
import { rejectOperators } from '../middleware/rejectOperators.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess } from '../utils/apiResponse.js';
import * as service from './content.service.js';
import { slug as slugRule } from './cms.rules.js';

/**
 * Public CMS API, mounted at /api/v1/content. GET only, no authentication, and nothing here can read a draft, a hidden or
 * archived record or a post scheduled for later. Responses may be cached briefly by browsers and proxies.
 */
const router = Router();
router.use(rejectOperators);
router.use((_req, res, next) => {
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  // Errors (a 404 for an article that is about to be published, say) must never be cached for the 30 seconds above.
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400) res.set('Cache-Control', 'no-store');
    return json(body);
  };
  next();
});

const read = (fn) => async (req, res) => sendSuccess(res, { data: await fn(req) });
const noQuery = z.object({ query: z.object({}).strict() });
const slugParam = z.object({ params: z.object({ slug: slugRule }), query: z.object({}).strict() });
const blogQuery = z.object({
  query: z
    .object({
      page: z.coerce.number().int().min(1).max(10000).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(9),
      q: z.string().trim().min(2).max(60).optional(),
      category: z.string().trim().min(1).max(80).optional(),
      tag: z.string().trim().min(1).max(50).toLowerCase().optional(),
      featured: z.enum(['true', 'false']).optional(),
    })
    .strict(),
});
const faqQuery = z.object({ query: z.object({ category: z.enum(FAQ_CATEGORIES).optional() }).strict() });

router.get('/site-settings', validate(noQuery), read(() => service.getSiteSettings()));
router.get('/homepage', validate(noQuery), read(() => service.getHomepage()));
router.get('/seo', validate(noQuery), read(() => service.getSeo()));
router.get('/pages', validate(noQuery), read(() => service.listPages()));
router.get('/pages/:slug', validate(slugParam), read((req) => service.getPage(req.validated.params.slug)));
router.get('/services', validate(noQuery), read(() => service.listServices()));
router.get('/services/:slug', validate(slugParam), read((req) => service.getService(req.validated.params.slug)));
router.get('/industries', validate(noQuery), read(() => service.listIndustries()));
router.get('/industries/:slug', validate(slugParam), read((req) => service.getIndustry(req.validated.params.slug)));
router.get('/service-areas', validate(noQuery), read(() => service.listServiceAreas()));
router.get('/blog', validate(blogQuery), read((req) => service.listBlog(req.validated.query)));
router.get('/blog/:slug', validate(slugParam), read((req) => service.getBlogPost(req.validated.params.slug)));
router.get('/faqs', validate(faqQuery), read((req) => service.listFaqs(req.validated.query)));
router.get('/testimonials', validate(noQuery), read(() => service.listTestimonials()));

export default router;
