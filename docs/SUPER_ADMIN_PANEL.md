# Super Admin Panel (Phase 8)

The Super Admin interface for the brokerage engine built in Phase 7. It is a thin client: **the backend is the only
authority** for eligibility, pricing, margin, state transitions and ownership. The panel shows what the server returns and
offers only the actions the server lists in `nextStatuses`. There is exactly one Super Admin and no new roles. The panel
uses the existing `/admin/login` and the existing cookie session; there is no second auth mechanism.

## 1. Routes

All routes are lazy-loaded (one chunk per page) and live under `/admin`. A guest is redirected to `/admin/login`; a
customer or carrier is turned away; a server `401` ends the session and returns to `/admin/login`.

| Route | Page |
| --- | --- |
| `/admin`, `/admin/dashboard` | Dashboard |
| `/admin/quotes`, `/admin/quotes/:id` | Quote list, quote detail |
| `/admin/loads`, `/admin/loads/:id`, `/admin/loads/:id/edit`, `/admin/loads/:id/matching` | Load list, detail, edit, carrier matching |
| `/admin/shipments`, `/admin/shipments/:id` | Shipment list, detail |
| `/admin/customers`, `/admin/customers/:id` | Customers |
| `/admin/carriers`, `/admin/carriers/:id` | Carriers |
| `/admin/carrier-applications`, `/admin/carrier-applications/:id` | Applications (read only) |
| `/admin/documents`, `/admin/documents/:id` | Documents (upload, secure preview/download, edit, archive; Phase 10) |
| `/admin/payments`, `/admin/payments/:id` | Payments (existing record fields only) |
| `/admin/notifications`, `/admin/activity-logs`, `/admin/security`, `/admin/settings` | System pages |
| `/admin/*` | Admin "not found" page |

There is **no `/admin/loads/new`**: the backend creates loads only by converting an accepted quote, so a creation form
would have nothing to call. The CMS routes (`/admin/cms/*`) are live as of Phase 9 and appear in a "Website CMS" nav group (see `CMS.md`). `/admin/cms/settings` and `/admin/seo` redirect to `/admin/settings` and `/admin/cms/seo`.

## 2. Navigation

Desktop: fixed sidebar, header with the signed-in admin and Sign out, breadcrumbs, one `h1` per page and a page-actions
area. Mobile and tablet: a hamburger opens a drawer with a backdrop, closes on Escape or backdrop click, traps focus,
returns focus to the hamburger and locks body scroll. Groups: **Overview** (Dashboard), **Operations** (Quotes, Loads,
Shipments), **Partners** (Customers, Carriers, Carrier applications), **Finance** (Payments), **Documents**,
**Communication** (Notifications), **System** (Activity logs, Security, Settings). Icons are inline SVG (lucide).

## 3. Dashboard

Every number comes from `GET /operations/dashboard` and `GET /admin/overview`; the frontend does no arithmetic on
them (declined and expired are separate cards, delivered and completed are separate cards). Sections: quotes,
loads, shipments, financials by currency, plus four small queues (oldest loads waiting for a carrier, latest quotes,
live shipments, shipments with exceptions) and recent activity. Each queue loads and fails independently with Retry.
A global search box calls `GET /admin/search`.

## 4. Quotes

List: server-side search, status, equipment, country and date filters; sort and pagination; all state in the URL.
Detail: summary, route, customer, cargo, pricing, internal notes, timeline, and an action bar built only from
`nextStatuses`: Start review, Start pricing, Send to customer (validity 1/3/7/14/30 days), Expire, Cancel (reason
required), Convert to load. Accept and decline are customer-only endpoints and are not offered to the admin.
Pricing: customer rate and optional carrier rate are typed in dollars and sent as integer cents; the **margin is
displayed from the server and cannot be edited**. If the server answers `409 NEGATIVE_MARGIN` the admin must explicitly
confirm in a dialog before the same request is resent with `allowNegativeMargin: true`.

## 5. Loads

List and detail with the same URL-driven filters. Actions come from `nextStatuses`: Open for carriers, Start carrier
search, Cancel (reason required), Create shipment (needs an assigned carrier). Opening a draft requires a pickup window
with time zone, equipment and a carrier rate; if missing, the server's reason is shown. Edit page: details, schedule
(wall-clock times with a North American IANA zone) and carrier rate, each a separate form with its own errors.

## 6. Carrier matching

`/admin/loads/:id/matching` shows the server's evaluation: **Eligible** carriers (ranked by the server) and **Not
eligible** carriers with every reason. The panel never recomputes eligibility. **Assign** (unassigned open load),
**Reassign** (reason required) and **Unassign** (reason required) each open a confirmation dialog stating the load,
the carrier and the consequence. A `409` from the server (for example the carrier stopped being eligible) is shown in
the dialog, which stays open.

## 7. Shipments

List with live / exception / cross-border filters. Detail shows tracking number, status, tracking history, border events
and exceptions. **Current location is shown only if the server has recorded one**; otherwise the page says "No location
has been recorded yet." Workflow actions (Dispatch, Record pickup, Mark in transit, Out for delivery, Record delivery,
Complete) appear only when listed in `nextStatuses`. Border steps appear only for cross-border shipments. An open
exception is left with Resolve (not a status button). Raise exception and Cancel shipment use dialogs.

## 8. Customers

Read-only list and detail: company, contact, account status, billing, counts and recent quotes. Internal notes are
visible to the Super Admin only.

## 9. Carriers

Read-only list and detail: authority and compliance status, equipment, regions, cross-border capability, insurance
(with expiry), rating, recent loads. Passwords and tokens are never returned.

## 10. Carrier applications

Read-only list and detail. The backend has no application review workflow and no account-creation step, so the panel
offers **no approve/reject buttons** and says so on the page rather than pretending.

## 11. Documents (Phase 10)

The Super Admin manages private business documents here; the full design is in `STORAGE_AND_DOCUMENTS.md`.

* **List**: search, type, status (active/archived), visibility, related record type, customer, carrier and upload-date
  filters (all in the URL). Each row links to the related shipment/load/customer/carrier.
* **Upload**: choose the file, type and visibility, then **search for the record** the document belongs to. Only that
  record's id is sent: the server derives the customer and carrier from it, rejects forged owner or storage fields (400)
  and refuses a visibility that does not fit the record (422).
* **Detail**: metadata, Preview and Download buttons (each click asks the server for a fresh link that expires in about
  five minutes; the link is shown only inside the preview and is never stored), Edit (name, type, visibility, move to a
  different record) and Archive/Restore with a confirmation dialog. Archiving hides the document from customers and
  carriers; **the stored file is kept**.
* **Shipment and load pages** have a Documents panel with the proof-of-delivery state and an upload button.
* Without storage the page says "File storage is not configured yet." and upload, preview and download are not offered.
  `fileUrl` and `storageKey` are never exposed.

## 12. Payments

Lists and shows the fields the Payment model really has (type, status, amount, reference, dates, linked load, customer,
carrier, internal notes). There is no payment processing: nothing can be charged, refunded or paid from this panel.

## 13. Activity logs

Append-only audit trail from `GET /admin/activity-logs`: time, actor, action, entity, entity id and result, with action,
module, actor-type, result and date filters sent to the server. Metadata is shown as a safe key/value list; keys that
look like secrets (password, token, secret, authorization, cookie, key) are redacted by the server and filtered again
in the UI.

## 14. Security

Derived from real authentication events in the activity log (recent sign-ins, failures, lockouts, session facts). It
lists what is **unavailable** (for example IP reputation or device management) instead of inventing it. No secrets.

## 15. Settings

Since Phase 9, `/admin/settings` is **editable** (it was read-only in Phase 8): company name, contact details, business
hours, footer text, social links and branding, saved through `PATCH /api/v1/admin/cms/settings`. Nothing is pre-filled
and no contact details are invented; opening the page never creates a document. See `CMS.md`.

## 16. API dependencies

All calls go through `src/services/adminService.js` (shared `apiClient`, cookie credentials, no raw `fetch`).

- `/operations/dashboard`; `/operations/quotes` (+ `/:id`, `review`, `start-pricing`, `pricing`, `send`, `expire`,
  `cancel`, `convert`, `internal-notes`)
- `/operations/loads` (+ `/:id`, `open`, `carrier-search`, `carrier-matches`, `assign`, `reassign`, `unassign`,
  `schedule`, `carrier-rate`, `cancel`, `shipment`)
- `/operations/shipments` (+ `/:id`, `dispatch`, `pickup`, `in-transit`, `at-border`, `border-cleared`,
  `out-for-delivery`, `deliver`, `complete`, `tracking-updates`, `border-events`, `exceptions`,
  `exceptions/:exceptionId/resolve`, `cancel`)
- `/admin/overview`, `/admin/search`, `/admin/customers`, `/admin/carriers`, `/admin/carrier-applications`,
  `/admin/documents` (+ `POST` upload, `GET /:id/download`, `PATCH /:id`, `POST /:id/{archive,restore}`), `/admin/payments`, `/admin/notifications` (+ `POST /:id/read`), `/admin/activity-logs`,
  `/admin/security`, `/admin/settings` — all `GET` except marking a notification read and the document writes above. Every `/admin/*` route requires
  `authenticate` + `requireSuperAdmin`, has `Cache-Control: no-store`, strict zod query schemas and operator-key rejection.

Error handling in the UI: 401 → admin login; 403 → "You do not have permission to access this area."; 404 → "not
found"; 409 → the server's business message (inline in dialogs); 400/422 → field errors; 429 → "too many requests, wait
and retry"; 5xx/network → a generic message with **Retry** (server internals are never displayed).

## 17. Known limitations

- Tested on FerretDB 1.24, **not a real MongoDB**. Three backend tests are skipped for that reason (two partial indexes,
  one atomic `$inc`), and `db:init` reports the same partial-index error on `User`. Real MongoDB verification is open.
- File storage exists since Phase 10 but needs credentials; without them uploads answer 501 and the UI says so (see `STORAGE_AND_DOCUMENTS.md`).
- No payment processing; payment pages are record viewers.
- Email/SMS (Phase 11): the Notifications page has email/text settings and **Delivery log** lists queued/sent/failed messages (`docs/NOTIFICATIONS_AND_MESSAGING.md`).
- Carrier applications cannot be approved or rejected (no backend workflow); no carrier account creation.
- No direct load creation; loads come from converted quotes. No archive action is exposed in the UI.
- Settings are editable only through the CMS settings endpoint (Phase 9).
- Quote accept/decline are customer actions by design.
- Activity-log actor-type filtering looks up at most 2000 users.

## 18. CMS integration

Phase 9 added the CMS pages under `pages/admin/cms/`, registered in `routes/definitions/adminRoutes.jsx`, reusing
`AdminListView`, `AdminConfirmDialog`, `AdminPage` and `adminService`. The public site still does not import any admin
code (enforced by a test). Architecture, routes and APIs: `docs/CMS.md`.


## Finance (Phase 12)

The Finance nav group adds Finance overview, Customer invoices, Carrier payables and Payment records (all Super Admin only, `/api/v1/finance`). The original read-only Payments page remains. See `docs/PAYMENTS_AND_INVOICING.md`.
