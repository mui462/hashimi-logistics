import { z } from 'zod';
import { objectIdSchema } from '../validators/common.validator.js';

/**
 * Shared CMS input rules. Everything the Super Admin types is PLAIN TEXT: no HTML is accepted, stored or rendered, so a
 * script or markup can never reach a visitor. URLs are limited to http(s), site paths, mailto and tel.
 */

const HTML_LIKE = /<\s*\/?\s*[a-z!?][^>]*>?/i;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Slugs that would collide with an application route if they were ever mounted at the site root. */
export const RESERVED_SLUGS = Object.freeze(['admin', 'api', 'login', 'register', 'customer', 'carrier', 'new', 'edit', 'preview']);

const noHtml = (value) => !HTML_LIKE.test(value) && !CONTROL_CHARS.test(value.replace(/[\r\n\t]/g, ''));
const NO_HTML_MESSAGE = 'HTML and markup are not allowed. Use plain text.';

/** Plain text, trimmed, no markup. An empty string clears the field. */
export const plain = (max, { min = 0 } = {}) => z.string().trim().min(min).max(max, `Use ${max} characters or fewer.`).refine(noHtml, NO_HTML_MESSAGE);
export const required = (max) => plain(max, { min: 1 }).refine((value) => value.length > 0, 'This field is required.');

export const slug = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens only.')
  .refine((value) => !RESERVED_SLUGS.includes(value), 'This slug is reserved.');

const SAFE_HTTP = /^https?:\/\/[^\s<>"'`]+$/i;
export const httpUrl = z.string().trim().max(2048).regex(SAFE_HTTP, 'Enter a full http(s) address.').refine((value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}, 'Enter a valid web address without credentials.');

const LINK = /^(https?:\/\/[^\s<>"'`]+|\/(?!\/)[^\s<>"'`]*|mailto:[^\s<>"'`]+|tel:[+\d().\-\s]{3,30})$/i;
export const linkUrl = z
  .string()
  .trim()
  .max(2048)
  .regex(LINK, 'Use a full http(s) address, a site path starting with /, a mailto: or a tel: link.')
  .refine((value) => {
    if (!/^https?:/i.test(value)) return true;
    try {
      const url = new URL(value);
      return !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Enter a valid web address without credentials.');

export const canonicalUrl = z.union([z.literal(''), z.string().trim().max(2048).regex(/^(https?:\/\/[^\s<>"'`]+|\/(?!\/)[^\s<>"'`]*)$/i, 'Use a full http(s) address or a path starting with /.')]);
export const optionalHttpUrl = z.union([z.literal(''), httpUrl]);

export const mediaRef = z
  .object({ url: httpUrl, altText: plain(200).optional(), mediaId: objectIdSchema.optional() })
  .strict();
export const button = z.object({ label: required(60), url: linkUrl }).strict();

export const seo = z
  .object({
    title: plain(120).optional(),
    description: plain(320).optional(),
    keywords: z.array(plain(60, { min: 1 })).max(30).optional(),
    canonicalUrl: canonicalUrl.optional(),
    ogImage: optionalHttpUrl.optional(),
    noIndex: z.boolean().optional(),
  })
  .strict();

export const displayOrder = z.number().int().min(0).max(100000);
export const list = (item, max) => z.array(item).max(max, `Use ${max} items or fewer.`);
export const idList = (max) => z.array(objectIdSchema).max(max).refine((ids) => new Set(ids).size === ids.length, 'Each item may appear once.');

/** Business-content policy (Phase 9 brief): no ocean/air freight, no direct Canada-Mexico lane, no guarantees in FAQs. */
const OFF_SCOPE = /\b(ocean|sea|air)\s+(freight|cargo|shipping)\b|\bpassenger\s+(transport|travel)|\bcustoms\s+broker(age)?\b/i;
const CANADA_MEXICO = /\bcanada\s*(↔|⇄|<->|<-->|->|-->|to|and back to)\s*mexico\b|\bmexico\s*(↔|⇄|<->|<-->|->|-->|to)\s*canada\b/i;
const GUARANTEE = /\bguarantee(d|s)?\b/i;

export const businessCopy = (max, { forbidGuarantees = false } = {}) =>
  plain(max)
    .refine((value) => !OFF_SCOPE.test(value), 'This business does not offer ocean freight, air freight, passenger transportation or customs brokerage.')
    .refine((value) => !CANADA_MEXICO.test(value), 'Cross-border service is U.S. to Canada and U.S. to Mexico only.')
    .refine((value) => !forbidGuarantees || !GUARANTEE.test(value), 'Do not make guarantees (delivery time, response time, pricing, savings or capacity).');

export const withBody = (shape) => z.object({ body: z.object(shape).strict(), params: z.object({ id: objectIdSchema }) });
export const createBody = (shape) => z.object({ body: z.object(shape).strict() });
export const idOnly = z.object({ params: z.object({ id: objectIdSchema }) });

export const pageQuery = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
export const searchTerm = z.string().trim().min(2, 'Search needs at least 2 characters.').max(60);
