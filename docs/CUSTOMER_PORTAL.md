# Phase 5: Customer Portal

## Routes
`/customer` and `/customer/dashboard` render the same dashboard (one lazy page module, one nav item), then
`/customer/quotes`, `/quotes/new`, `/quotes/:id`, `/shipments`, `/shipments/:id`, `/tracking`, `/documents`, `/invoices`,
`/messages`, `/notifications`, `/profile`. Unknown paths under `/customer` show the portal's not-found page.
Guests go to `/login`; other roles go to their own portal.

Authenticated customer workspace at `/customer/*`, backed by `/api/v1/customer/*`. Customers only; staff and carrier
accounts receive 403. Identity always comes from the session (`req.owner`), never from a URL, query, body or header.

## Endpoints (all `noStore`, behind authenticate + requireCustomer + requireOwnerContext)
| Method | Path | Notes |
|---|---|---|
| GET | /customer/dashboard | counts + recent records, own data only |
| GET, POST | /customer/quotes | POST: strict body, server sets customer, number, status, cross-border flag |
| GET | /customer/quotes/:id | customer-safe projection |
| GET | /customer/shipments, /customer/shipments/:id | Shipment joined to its Load (route, equipment) |
| GET | /customer/tracking/:trackingNumber | own numbers only; 404 `SHIPMENT_NOT_FOUND` otherwise |
| GET | /customer/documents, /:id, /:id/download | visibility `customer` + owner; download is 501 `DOWNLOAD_UNAVAILABLE` |
| GET | /customer/invoices | adapter over Payment (`customer_payment`) |
| GET, PATCH | /customer/notifications, /:id/read | scoped by recipient |
| GET, PATCH | /customer/profile | allow-listed fields only (strict schema) |
| POST | /customer/profile/password | current + new + confirmation, same policy, other sessions ended |

## Security model
- Ownership filter on every query; foreign ids return the same 404 as missing ids; malformed ids return 400.
- Two layers keep internal data out: model `select:false` + `accessProjections`, then explicit allow-list presenters
  (`customer.presenters.js`). Never exposed: carrier id/rate/rating, broker margin, internal notes, estimated rate,
  storage keys, file URLs, uploader, security fields. Tracking events omit free-text descriptions.
- Strict zod bodies reject `customerId`, `role`, `status`, rates, etc. with 422.
- Audit entries: quote requested, profile updated (field names only), notification read, password changed/failed.

## Honest limitations / dependencies for later phases
- Quote accept/decline: no staff workflow or transition rules exist; the UI offers "contact our team".
- Documents: no storage layer, so no download and no upload (`capabilities` flag flips this on).
- Invoices: Payment has no invoice number, issue/due date or line items; none are shown. No payment processing.
- Messages: no Message model; the page says so.
- Login email change needs a re-verification flow; not offered. Profile fields cannot be cleared to blank.
- Quote request form is separate from the public form (needs structured addresses); the public intake is still unbuilt.
- Email (Phase 11): resend-verification queues an email when a provider is configured, otherwise it reports honestly that nothing was sent. Customers get email/SMS settings on the Notifications page.

## Verification notes
- Database tests ran against FerretDB 1.24 (SQLite), not real MongoDB. Three tests skip there (2 partial-index, 1 atomic `$inc`).
- Known FerretDB artefact: the Phase 3 test "two simultaneous uses of one token cannot both succeed" fails intermittently
  because FerretDB does not apply concurrent conditional updates atomically. It fails the same way on the untouched Phase 4 code.
- `backend/tests/customer.static.test.js` guards that customer code never reads identity from request input and that
  presenters never name internal fields.


## Billing (Phase 12)

`/customer/billing` lists the customer's own issued invoices with total, paid and outstanding amounts, payment history recorded by staff, and a private PDF download. Online payment is not available ("Online payment is not currently available"; no Pay Now). The original Invoices page remains. See `docs/PAYMENTS_AND_INVOICING.md`.
