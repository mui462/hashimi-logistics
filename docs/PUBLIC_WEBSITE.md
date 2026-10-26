# Public website (Phase 4)

## Where things live

| Concern | Location |
| --- | --- |
| Client-controlled business details (phone, email, address, MC, DOT, hours, social links) | `frontend/src/config/brand.js` (empty = not shown) |
| Hero video / poster / image overrides | `frontend/src/config/media.js` |
| SEO defaults (`VITE_SITE_URL`, `VITE_OG_IMAGE`) | `frontend/src/config/seo.js` |
| Navigation | `frontend/src/config/navigation.js` |
| Marketing content (services, industries, FAQs, steps, stats, testimonials, legal placeholders) | `frontend/src/content/` |
| Reusable sections (Hero, ServiceGrid, IndustryGrid, FAQ, Stats, Testimonials, CTA...) | `frontend/src/components/sections/` |
| API services | `frontend/src/services/` (`quoteService`, `carrierApplicationService`, `contactService`, `trackingService`, `blogService`, `cmsService`) |
| Pages | `frontend/src/pages/public/`, routes in `routes/definitions/publicRoutes.jsx` (code-split) |

## Hero video

Leave `heroMedia.videoSrc` empty and the hero shows the poster or an original illustrated scene; nothing is downloaded. When a video URL is set it is muted, looped, inline, `preload="metadata"`, painted over the poster only once it can play, and dropped silently on error. Visitors who prefer reduced motion get the poster only.

## Honesty rules enforced in code

- No figures, years, awards, certifications, testimonials, MC/DOT numbers, phones, emails, addresses or social links are invented. Stats default to neutral labels plus the three markets named in the service areas; the section can be disabled with `enabled: false`. Testimonials render nothing until real entries exist.
- Forms only show success after the server answers 2xx, and success messages say that no e-mail confirmation is sent. If the API is missing or down (404/405/501/502/503) the user sees a plain "not available right now" message and keeps their input.
- Tracking never shows a result unless the API returned one; 404 is "No shipment found". Domestic shipments never show border statuses.
- Resources treat a 404 from the content API as "nothing published" (empty state); other failures show an error state with retry.
- Customs brokerage and legal services are not claimed. Legal pages are placeholders, not legal advice.

## Public form and tracking API (backend/src/public)

All four are under `/api/v1`, need no account, accept JSON only (no file uploads from anonymous visitors; bodies capped at 10kb), refuse posts from other websites (trusted-origin check), and have their own per-IP rate limit (`PUBLIC_FORM_LIMIT_MAX`, `TRACKING_LIMIT_MAX`). Request bodies are strict: an unknown key (status, customerId, carrierId, quotedRate, source...) is a `422` and nothing is stored. Nothing is e-mailed; the Super Admin gets an in-app notification.

| Endpoint | Stores | Answer |
| --- | --- | --- |
| `POST /quotes` | A `QuoteRequest` with `source: 'public'`, no `customerId`, `status: 'new'`, the guest's `contactInformation` (name, optional company, email, phone). Same body rules as the customer portal quote. | `201 { data: { quoteNumber } }` |
| `POST /carrier-applications` | A `CarrierApplication` with `status: 'pending'`. No carrier, login or approval is created. Equipment uses the stored list (Dry Van, Reefer...); regions are `us_domestic`, `us_canada`, `us_mexico`. | `201`, the same answer whether or not an open application already existed |
| `POST /contact` | A `ContactMessage` (`status: 'new'`), read in the admin inbox | `201` |
| `GET /tracking/:trackingNumber` | Nothing | `{ data: { trackingNumber, status, isCrossBorder, events: [{ status, timestamp, location }] } }`; location is city/state/country only. Unknown or archived numbers are `404 SHIPMENT_NOT_FOUND`. No customer, carrier, rate, note or event description is ever returned. |

A repeat of the same quote or contact message within 10 minutes returns the first record instead of a duplicate; a second carrier application while one is open (same MC, DOT or e-mail) is not stored.

Super Admin side: guest quotes appear in **Quotes** (filter Source = Website guest) and can be reviewed, priced and cancelled, but **cannot be sent through the portal or converted to a load** (`409 QUOTE_HAS_NO_CUSTOMER`) because there is no customer account. Applications appear in **Carrier applications** (applicant notes are shown apart from internal notes). Contact messages appear in **Communication -> Contact messages** (`GET /admin/contact-messages`, `GET /admin/contact-messages/:id`, `POST .../handled`, `POST .../reopen`).
- `GET /content/articles?page&search&category` -> `{ data: { items, page, totalPages, total } }`; `GET /content/articles/:slug`
- `GET /content/site` (CMS, Phase 9)

## Navigation and auth compatibility

The public navbar follows the Phase 4 brief and has no sign-in item; the footer keeps a **Sign in** link to `/login`. `/login`, `/register`, `/admin/login`, `/customer`, `/carrier` and `/admin` are unchanged and still guarded by the Phase 3 route guards (which are a UX convenience only; the backend enforces authorization). Sign-in screens and all portal layouts emit `noindex,nofollow` and clear any canonical tag. The generated `robots.txt` blocks `/admin/`, `/customer/`, `/carrier/`, `/login` and `/register` only, so `/carrier-resources` stays crawlable.

## Content rules (QA lock)

- Business strings come from `config/brand.js` (`name`, `shortName`, `tagline`, `supportingStatement`, CTA labels, `contactDetails`, `socialLinks`). Pages build SEO descriptions and CTAs from it; copy that is page content lives in `content/`.
- Statistics ship as neutral labels only. An item can carry a `value` once the client confirms a real figure; `StatsSection` renders it, and `enabled: false` hides the section.
- Navbar, Footer and every section component accept their data as props and fall back to the config/content defaults.

## Deferred to later phases

- File uploads from the public forms (documents are requested after review instead); linking a guest quote to a customer account; an approve/reject workflow for carrier applications; e-mail confirmations to visitors.
- `cmsService.getSiteContent()` is written but intentionally not called by any page yet.

## Testing

`npm test` in `frontend/` runs the Phase 1-3 suite and `tests/public-site.test.mjs` (jsdom, mocked API inside the tests only). jsdom has no layout engine, so responsive and overflow checks were run separately in headless Chromium against the production build (see the Phase 4 report).

## Search engines: sitemap, robots, structured data, prerendered heads

- **/sitemap.xml and /robots.txt** are generated by the backend (`backend/src/cms/sitemap.routes.js`) and reached at the site root through the `vercel.json` rewrites. The site address is the CMS canonical base URL if set, otherwise `CLIENT_URL`, so moving to a new domain needs no code change. Only visible, indexable content is listed; `noIndex` records, portals and sign-in are never listed. While a CMS collection (services, industries) is empty the built-in slugs are listed.
- **Structured data (JSON-LD):** `components/seo/JsonLd.jsx` adds Organization and WebSite to every public page and BlogPosting to articles. Phone, e-mail, address, logo and social links appear only if the Super Admin entered them; nothing is emitted without a site address.
- **Prerendered heads:** `npm run build` also runs `frontend/scripts/prerender.mjs`, which writes a per-route HTML file (own title, description, Open Graph, canonical when `VITE_SITE_URL` is set, and a noscript link list) for the built-in public pages, so crawlers and link previews that skip JavaScript see real information. Set `VITE_SITE_URL` (and optionally `VITE_OG_IMAGE`) in the Vercel build environment before the final production build. CMS-only pages rely on the normal app (Googlebot renders JavaScript) and the sitemap.
