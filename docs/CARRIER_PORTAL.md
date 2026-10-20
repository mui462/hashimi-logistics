# Phase 6: Carrier Portal

Authenticated carrier workspace at `/carrier/*`, backed by `/api/v1/carrier/*`. Carriers only; customer and Super Admin
accounts receive 403 from the API and are redirected to their own portal by the app. Identity always comes from the
session (`req.owner = { role, userId, carrierId }`), never from a URL, query, body or header.

## Routes
| Path | Page |
|---|---|
| `/carrier`, `/carrier/dashboard` | Dashboard (one lazy page module, one nav item; `/dashboard` is an alias) |
| `/carrier/loads`, `/carrier/loads/:id` | Available loads (open, unassigned freight) and its limited detail |
| `/carrier/my-loads`, `/carrier/my-loads/:id` | Loads assigned to this carrier, with the full carrier view |
| `/carrier/shipments`, `/carrier/shipments/:id` | Shipments for this carrier's loads |
| `/carrier/tracking` | Tracking lookup (own shipments only) |
| `/carrier/documents`, `/:id`, `/:id/download` | Documents shared with this carrier |
| `/carrier/payments` | Carrier payment records |
| `/carrier/messages` | Honest placeholder |
| `/carrier/notifications` | Own notifications, unread filter, mark as read |
| `/carrier/profile` | Account, company, capacity, password |

Unknown paths under `/carrier` (including the retired `/carrier/pod` placeholder) show the portal's not-found page.
Guests go to `/login`; customers go to `/customer`; the Super Admin goes to `/admin`.

## Endpoints (all `noStore`, behind authenticate + requireCarrier + requireOwnerContext)
| Method | Path | Notes |
|---|---|---|
| GET | /carrier/dashboard | counts + recent records from this carrier's own data |
| GET | /carrier/loads, /carrier/loads/:id | open board (see "Available loads"); `?equipmentType=` |
| GET | /carrier/my-loads, /carrier/my-loads/:id | `carrierId = req.owner.carrierId`; `?status=`, pagination |
| GET | /carrier/shipments, /carrier/shipments/:id | Shipment joined to its Load; `?status=` |
| GET | /carrier/tracking/:trackingNumber | own numbers only; 404 `SHIPMENT_NOT_FOUND` otherwise |
| GET | /carrier/documents, /:id, /:id/download | visibility `carrier` + owner; download is 501 `DOWNLOAD_UNAVAILABLE` |
| GET | /carrier/payments | `carrier_payment` records for this carrier; `?status=` |
| GET | /carrier/messages | always `{ items: [], capabilities: { messaging: false } }` |
| GET, PATCH | /carrier/notifications, /:id/read | scoped by recipient |
| GET, PATCH | /carrier/profile | allow-listed fields only (strict schema) |
| POST | /carrier/profile/password | shared implementation with the customer portal |

## Authorization and ownership
- Every query is built from `ownershipFilter(req.owner)` or `req.owner.userId`. List queries use strict zod schemas, so
  `carrierId`, `userId`, `ownerId` or `select=`/`populate=` in a query string is a 400. Body schemas are strict, so the
  same keys in a body are a 422. Headers are never read.
- A record that belongs to someone else returns exactly the 404 a missing record returns. Malformed ids return 400.
- Load, Shipment and Payment are read through `accessProjections` for the carrier role (customer identity and quote link
  removed; `carrierRate` opted in). Document and Notification are read with the role's selection too.
- Second layer: explicit allow-list presenters (`carrier.presenters.js`). A field appears only if it is named there.
- `backend/tests/carrier.static.test.js` guards that carrier code never reads identity from request input, that
  presenters never name an internal field, and that the router is mounted behind the role guard.

## Financial rule
The only money a carrier sees on a load is their own pay (`carrierRate`, presented as `pay`). The customer price
(`rate`), `brokerMargin` and internal rates are never selected or named, including in nested shipment, payment,
dashboard and document data. Customer-side payments (`customer_payment`) are never returned.

## Feature notes
- **Available loads.** The data model has no marketplace, bidding or per-carrier offer. "Available" means exactly: status
  `open`, no carrier assigned, not archived. Only a carrier whose account is `active`, whose authority is `active` and
  whose compliance is `approved` sees them; anyone else (including every newly registered carrier) gets an empty list and
  an explanation. Before assignment a load shows city/state/country only: no street, facility, contacts, customer or
  special instructions. Assigned loads (to anyone else) are 404. There is no book, accept or bid action.
- **My loads / shipments.** Full stops (facility, street) are shown once a load is assigned to the carrier. Customer
  facility contact fields are never presented. Tracking events and border events show status/event, time and place only;
  free-text descriptions and exception descriptions are left out because staff write them for operations.
- **Documents.** Only `visibility: carrier` documents owned by this carrier. No storage key or URL is ever returned.
  Detail views and download attempts are written to the audit log. Downloads verify ownership and then report that
  secure download is unavailable. Proof-of-delivery **upload is not built**: no storage layer exists, and the page says so.
- **Payments.** Reference, load, amount, currency, status, paid date. No invoice numbers, due dates or line items (none exist).
- **Notifications.** Own notifications only; `carrier_application` notifications (staff-facing) are excluded.
- **Profile.** Editable: first and last name, phone, company name, contact person, business email, address, equipment
  types, operating regions, cross-border capability. Read-only: MC and DOT numbers, authority, compliance and account
  status. Not accepted at all (422): MCNumber, DOTNumber, authorityStatus, complianceStatus, status, rating, notes,
  insurance, userId, role, login email, tokenVersion. The login email is not editable because the re-verification flow
  does not exist.
- **Password.** `services/passwordChange.service.js` is shared with the customer portal (the customer service now calls
  it). Current password required, existing policy, new hash, other sessions ended via `tokenVersion`, fresh cookie for
  this browser, per-user failed-attempt rate limit. Audit actions `carrier.password.changed` / `.change_failed`.
- **Audit actions** (append-only ActivityLog, field names only, never values): `carrier.profile.updated`,
  `carrier.notification.read`, `carrier.document.viewed`, `carrier.document.download_requested`, `carrier.password.*`.

## Not built / dependencies for later phases
- Load booking, bidding or dispatch: needs a staff assignment workflow and rules for which carriers may take a load.
- Document download and POD upload: need a storage layer with authorized, short-lived links and upload validation.
- Messaging: no Message model.
- Payment processing, invoices, remittance advice: out of scope; Payment is a ledger record.
- Login email change: needs a re-verification flow. Insurance and compliance document management: staff workflow.
- Distance: the Load model has no distance field, so none is shown.
- Email/SMS (Phase 11): carriers get email/SMS settings on the Notifications page; see `docs/NOTIFICATIONS_AND_MESSAGING.md`.

## Verification notes
- Database tests ran against FerretDB 1.24 (SQLite), **not real MongoDB**. Three tests skip there (2 partial-index, 1 atomic `$inc`).
- Known FerretDB artefact: the Phase 3 test "two simultaneous uses of one token cannot both succeed" fails intermittently
  because FerretDB does not apply concurrent conditional updates atomically. It fails the same way on untouched Phase 4 code.
- The document download page requests `/download` on load, so the browser console shows one expected 501 there.


## Payables (Phase 12)

`/carrier/payables` shows only the carrier's own approved payables and payments recorded against them (read only; no customer data, margins or hold reasons; carriers cannot edit amounts or mark themselves paid). The original Payments page remains. See `docs/PAYMENTS_AND_INVOICING.md`.
