# Website CMS (Phase 9)

The Super Admin manages the public website from `/admin/cms/*` without code edits. This document covers architecture,
routes, public APIs, data-model changes, publishing, media, SEO, security, fallback behaviour, environment requirements
and storage (see `STORAGE_AND_DOCUMENTS.md`).

What the CMS **does not** control: roles, authentication, pricing, margin, eligibility, workflow/status rules, quotes,
loads, payments or documents. Those stay in their own modules. The CMS also cannot invent facts: nothing is pre-filled
(no testimonials, customers, statistics, MC/DOT numbers, contact details), and the editors refuse text that makes risky
promises (see §8).

## 1. Architecture

```
Admin UI (React)                          Backend (Express)                         Public site (React)
/admin/cms/*  --adminService.js-->  /api/v1/admin/cms/*  (Super Admin only)
                                        cms.routes.js -> cms.validator.js (zod)
                                        -> cms.service.js -> Mongoose models
                                        -> recordActivity (audit, no secrets)
                                     /api/v1/content/*  (public, GET only)  <--contentService.js--  useContent()
                                        content.routes.js -> content.service.js -> cms.presenters.js
```

* `backend/src/cms/` — `cms.rules.js` (shared text/slug/URL rules), `cms.validator.js`, `cms.presenters.js` (what a
  public visitor may see), `storage.service.js` (media abstraction), `cms.service.js` (admin), `content.service.js` +
  `content.routes.js` (public).
* Existing models are reused (`Homepage`, `Page`, `Service`, `Industry`, `ServiceArea`, `BlogPost`, `Faq`,
  `Testimonial`, `Media`, `SiteSettings`). The existing `SiteSettings` is extended — there is no second Settings page.
* Admin pages are config-driven (`pages/admin/cms/collections.jsx` + `CollectionPages.jsx`) on top of the Phase 8 admin
  design system (`AdminPage`, `AdminListView`, `AdminConfirmDialog`).
* Public pages read content through `useContent(path, params, loader)`, which never throws; each field falls back to the
  built-in content individually (§9).

## 2. Admin routes

| Route | Purpose |
| --- | --- |
| `/admin/cms` | Overview: counts and what is live |
| `/admin/cms/homepage` | Hero, section order and visibility, section content |
| `/admin/cms/pages` , `/new`, `/:id` | System pages (About, Contact, legal …) and extra pages |
| `/admin/cms/services` , `/new`, `/:id` | Services |
| `/admin/cms/industries` , `/new`, `/:id` | Industries |
| `/admin/cms/service-areas` , `/new`, `/:id` | Service areas (US, CA, MX only) |
| `/admin/cms/blog` , `/new`, `/:id` | Blog: draft, scheduled, published, archived |
| `/admin/cms/faqs` , `/new`, `/:id` | FAQs |
| `/admin/cms/testimonials` , `/new`, `/:id` | Testimonials (real, attributed only) |
| `/admin/cms/media` | Media library |
| `/admin/cms/seo` | Global, homepage and per-page SEO |
| `/admin/settings` | Website settings (company name, contact, hours, footer, social, branding). `/admin/cms/settings` redirects here |

All are lazy-loaded, listed in the "Website CMS" navigation group and gated by the existing Super Admin guard.

## 3. Admin API (`/api/v1/admin/cms`, Super Admin only)

Auth chain: `authenticate` → `requireSuperAdmin`, cookie sessions, trusted-origin check. Responses are `no-store`.

* `GET /overview`
* `GET|PATCH /homepage`
* `GET|POST /pages`, `GET|PATCH /pages/:id`, `POST /pages/:id/{publish,unpublish,archive,restore}`
* For `services`, `industries`, `service-areas`, `faqs`, `testimonials`: `GET|POST /<c>`, `POST /<c>/reorder`,
  `GET|PATCH /<c>/:id`, `POST /<c>/:id/{archive,restore}`
* `GET|POST /blog`, `GET|PATCH /blog/:id`, `POST /blog/:id/{publish,schedule,unpublish,archive,restore}`
* `GET /media/storage`, `GET /media`, `POST /media/external`, `POST /media/upload` (Phase 10: real upload; 501 until
  storage is configured), `POST /media/:id/replace`, `GET|PATCH /media/:id`, `POST /media/:id/{archive,restore}`
* `GET /seo`, `PATCH /seo/global`, `PATCH /seo/homepage`, `PATCH /seo/:kind/:id`
* `GET|PATCH /settings`

There is no hard delete anywhere: content is archived and can be restored (the soft-delete plugin blocks hard deletes).

## 4. Public API (`/api/v1/content`, GET only, no auth)

`/site-settings`, `/homepage` (one grouped call: homepage, services, industries, areas, FAQs, testimonials),
`/seo`, `/pages`, `/pages/:slug`, `/services`, `/services/:slug`, `/industries`, `/industries/:slug`,
`/service-areas`, `/blog` (`page`, `limit`, `q`, `category`, `tag`, `featured`), `/blog/:slug`,
`/faqs` (`category`), `/testimonials`.

* Only published, visible, non-archived content is returned. Drafts, hidden, archived and not-yet-live scheduled posts
  are indistinguishable from "not found" (404 `CONTENT_NOT_FOUND`).
* Presenters whitelist fields; internal ids, audit fields, admin notes and author accounts are never serialised.
* Collections return `configured`. Once any record exists in a collection the CMS is authoritative (an admin who hides
  every service gets an empty list, not the built-in one). Testimonials and blog never fall back to built-in content.
* Caching: successful responses carry `Cache-Control: public, max-age=30, stale-while-revalidate=60` and an ETag, so a
  change can take up to about 30–90 seconds to appear for visitors. Error responses are `no-store` so a just-published
  page is never hidden by a cached 404.
* Unknown query keys, Mongo operators (`$`, `.` keys) and bad slugs are rejected with 400.

## 5. Models and schema changes (all additive)

No collection was renamed or removed and no field was made required for existing documents.

* `enums.js`: CMS statuses (`draft|published|archived`, blog adds `scheduled`), page keys, media providers, FAQ
  categories, audit entity names.
* `Page`: `pageKey` (system page marker; key and slug locked), `sections`, `status`, `publishedAt`, SEO, media.
* `Service`, `Industry`: `image`, `heroImage`, `cta`, `serviceAreaIds` (service), SEO and ordering fields.
* `ServiceArea`: `slug` (sparse unique), description, order; countries limited to US, CA, MX and no CA↔MX lane.
* `BlogPost`: `scheduledAt`, `status` incl. `scheduled`, featured image, category, tags, author name, SEO.
* `Faq`, `Testimonial`: order, visibility, archive flag, optional image.
* `Media`: `provider` (`external` today), alt text, dimensions, folder, archive flag.
* `Homepage`: per-section image and call to action. `SiteSettings`: social links, branding media, footer text,
  business hours, default SEO.

Run `npm run db:init` after upgrading to create the new indexes.

## 6. Publishing workflow

* Status changes are explicit action endpoints (`publish`, `schedule`, `unpublish`, `archive`, `restore`), not a field
  in a generic update, so a normal edit can never publish by accident.
* Publishing validates what visitors need (for example a blog post needs a summary and text).
* **Slugs**: generated from the title when empty. Changing the slug of live content returns 409
  `SLUG_CHANGE_NEEDS_CONFIRMATION`; the UI shows a confirmation and resends with `confirmSlugChange: true`.
  System pages cannot be archived and their slug cannot change.
* **Scheduling** (blog): `POST /blog/:id/schedule {scheduledAt}` sets `publishedAt = scheduledAt`. The public query is
  `status in [published, scheduled] AND publishedAt <= now`, so there is no background job: a post becomes visible by
  itself when the time passes, and stays private before that. The admin shows "Scheduled to go live …" until then.
* Editors warn about unsaved changes (route leave and tab close) and never show success unless the API resolved.

## 7. Media (Phase 10)

Media is **public website content**, stored separately from private business documents. The complete storage design,
limits and setup are in `STORAGE_AND_DOCUMENTS.md`; this is what matters for the CMS.

* The CMS only talks to the storage abstraction (`backend/src/storage`). With no credentials `POST /media/upload` and
  `POST /media/:id/replace` answer **501 `STORAGE_NOT_CONFIGURED`** ("File storage is not configured yet.") and the Media
  page keeps "Upload file" disabled. Once `CLOUDINARY_*` is set (or `STORAGE_PROVIDER=local` in development) uploads work
  with no code change.
* **Upload** (`/admin/cms/media`): JPEG, PNG, WebP, GIF images (10 MB) and MP4/WebM video (200 MB). The file is sent as the
  raw request body; the server checks the declared type, the extension and the file's real signature, rejects
  executables, scripts, HTML/PHP and unknown binaries, reads width/height/duration and stores it as public media.
* **Replace** keeps the item and uploads the new file first; the old stored file is **not deleted** and the previous
  version is recorded. Pages that already copied the old address keep showing the old file (the library and pickers use
  the new one) - the CMS does not rewrite content.
* **Archive** hides an item from the picker; the stored file is kept. Metadata (alt text, caption, folder, name) is
  editable. Safe fields only are returned: provider, size, dimensions, uploader name, status - never a storage key or
  credential.
* "Add by link" still registers an https file hosted elsewhere (`provider: external`).
* Hero video is always muted with a poster image; no autoplay audio.

## 8. SEO and content rules

* Each page/service/industry/post has SEO title, description, keywords, canonical URL, social image and `noIndex`.
  Global and homepage SEO live at `/admin/cms/seo`; per-entry SEO is also editable on each editor.
* `Seo.jsx` writes title, description, canonical, robots, Open Graph and Twitter tags from CMS values with the built-in
  values as fallback.
* Plain text only: HTML, script tags and markup are rejected by the API (422) and rendered as text nodes by the site
  (`PlainText`, `CmsPageContent`). There is no `dangerouslySetInnerHTML` anywhere.
* FAQ questions and answers are checked for guarantees ("guarantee", "guaranteed" …); the API refuses them with a field
  error. Business copy (services, industries, areas, pages, homepage) is checked for ocean/sea/air freight,
  passenger-transport and customs-brokerage claims and refused.
  Service areas are limited to US, Canada and Mexico with no Canada↔Mexico lane.

## 9. Fallback behaviour

The public site is never blank. Every public page starts with the built-in content and each field is replaced
individually when the CMS has a non-empty value (`resolveHome`, `resolvePage`). If the content API fails or is slow the
built-in site renders; a visitor may see built-in text briefly before CMS text replaces it. Testimonials and blog posts
have no built-in version: when none are published the section is simply hidden (homepage) or an honest "No articles
published yet" message is shown (Resources). Contact details come only from Settings; if empty they are not shown.

## 10. Security

* Super Admin only, cookie session, trusted origin; the CMS never accepts or changes roles.
* zod `.strict()` schemas on every body and query: unknown keys (mass assignment, `role`, `isAdmin`, `__proto__`,
  `constructor`) are rejected; `rejectOperators` blocks `$` and dotted keys; ids and slugs are validated before any
  query.
* Body limits: the global JSON limit is 10 kb; CMS admin routes accept up to 1 MB, and only after authentication.
* HTML/script injection refused server-side and never rendered as HTML client-side.
* Activity log entries (`cms.*`) never include secrets or content bodies.
* Public API exposes whitelisted fields only; unpublished content returns 404.

## 11. Environment requirements

`MONGO_URI`, `JWT_SECRET`, `CLIENT_URL` as before. The file-storage variables are optional (see `STORAGE_AND_DOCUMENTS.md`).
The frontend needs `VITE_API_URL`.

**MongoDB**: the code is written for real MongoDB. Automated tests ran on **FerretDB 1.24 (PostgreSQL backend)**, not
MongoDB. FerretDB-only limits observed: duplicate-key errors lack `keyPattern` (the code classifies by message), update
time duplicates do not carry code 11000, sparse unique indexes are accepted but not reported, and partial indexes on
`User` fail in `db:init`. Three backend tests are skipped for such limits. Real MongoDB has not been tested.

## 12. Tests

* Backend: `backend/tests/cms.api.test.js` (admin auth, validation, workflow, public no-leak, caching, security).
* Frontend: `frontend/tests/cms-admin.test.mjs`, `cms-public.test.mjs` (jsdom + mock adapter).
* A real-browser pass (Playwright + axe) was run against the actual stack on FerretDB for the end-to-end flow.

## 13. Known limitations

Media uploads need storage credentials (Phase 10), email/SMS arrived in Phase 11, no rich text or images in page bodies, no scheduled *unpublish*, the
`forms` admin route is still a placeholder, up to ~90 s public cache delay, no revision history.

## Navbar appearance (Website CMS -> Navbar appearance, `/admin/cms/navbar`)

The public navbar's colours and behaviour are stored on the single `SiteSettings` record as `navbarAppearance` (no other
collection). One spec, `backend/src/cms/navbarAppearance.js`, defines every field, its limits and the approved default;
`frontend/src/config/navbarAppearance.js` mirrors it and a test keeps the two identical.

- Groups: `hero` (transparent glass over the hero: on/off, glass colour and opacity, text, icon, border colour and opacity,
  blur 0-20px, shadow), `scrolled` (solid on scroll: on/off, background, text, icon, border, shadow, transition 0-1000ms,
  scroll threshold 0-400px), `links` (hover, current page, dropdown colours), `trackButton` and `quoteButton` (text,
  background and its opacity, border, hover text, hover background and its opacity).
- Colours are `#RRGGBB` only; numbers are whole and in range; switches are true/false. Nothing else (CSS strings, URLs, markup)
  is accepted. The model, the API validator and the browser all enforce this.
- API (Super Admin only, behind `requireSuperAdmin`): `GET /admin/cms/settings/navbar-appearance`,
  `PUT /admin/cms/settings/navbar-appearance` (the complete set), `POST /admin/cms/settings/navbar-appearance/reset`
  (removes the saved appearance; no other setting changes). Saves and resets are audited.
- Once a settings record exists, the public `GET /content/site-settings` includes a complete `navbarAppearance`: saved values
  that are valid, the default for anything missing or damaged. With no record (`{ configured: false }`) or a failed request, the
  website uses the built-in defaults.
- The admin page edits a local draft with a live preview of both states; nothing reaches the website until Save changes.

## Website theme (Website CMS -> Website theme, `/admin/cms/theme`)

Stored on the single `SiteSettings` record as `themeAppearance` (spec: `backend/src/cms/themeAppearance.js`, mirrored in
`frontend/src/config/themeAppearance.js`; a test keeps them identical). Unset means the default neutral charcoal palette.

- `colors`: gold accent and hover, text/dark sections, darkest sections, raised dark surfaces, dark borders, page background,
  muted section background, borders, secondary text. `#RRGGBB` only.
- `layout`: content width (`narrow` | `standard` | `wide`), corners (`sharp` | `soft` | `rounded`; `sharp` is the current look).
- `motion`: animation preset (`off` | `subtle` | `standard`), duration 200-1000 ms, card stagger 0-150 ms. Reduced-motion
  visitors never see animation.
- API (Super Admin only): `GET`, `PUT` (complete set) `/admin/cms/settings/theme-appearance`, `POST .../reset`.
- Applied on the public site only, as CSS custom properties on the public layout that override the design tokens the existing
  classes already use. Customer and carrier portals and the admin panel keep the default palette. The navbar (Navbar
  appearance) and the homepage hero's approved colours keep their own settings.

## Homepage section appearance (Website CMS -> Homepage, "Appearance" in each section)

Stored with each section on the `Homepage` record as `<section>.appearance` (spec: `backend/src/cms/sectionAppearance.js`,
mirrored in `frontend/src/config/sectionAppearance.js`). Presets only, and only those a section can render safely:

| Section | Background | Spacing | Animation | Cards |
| --- | --- | --- | --- | --- |
| Trust strip, Final call to action | - | - | yes | - |
| Services, How it works | built-in / light / muted / dark / glass | yes | yes | - |
| Why choose us, Industries, Service areas | built-in / light / muted / dark / glass | yes | yes | built-in / glass |
| Cross-border, Statistics | - | yes | yes | - (Testimonials: cards) |
| FAQ | built-in / light / muted (its text is dark) | yes | yes | - |

"Built-in" keeps the section's current look. A section is saved as a whole, so the editor always sends its appearance with its
content. Anything outside a section's list is refused with 422.
