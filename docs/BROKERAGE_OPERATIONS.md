# Brokerage Operations (Phase 7)

Backend business logic that connects **Customer → Quote → Load → Carrier → Shipment → Delivery**. It is consumed by the
Super Admin panel in Phase 8. There is still exactly one Super Admin and only three roles. No payment, messaging, email,
storage or proof-of-delivery features exist, and none are simulated.

## API

Base: `/api/v1/operations`, **Super Admin only** (`authenticate` + `requireSuperAdmin`; customers and carriers get 403,
anonymous 401). Responses are never cacheable. Query strings and JSON bodies containing `$…`, dotted or bracketed keys are
refused with `400 OPERATOR_NOT_ALLOWED`; all bodies and queries are strict zod schemas (unknown keys → 422/400).
No endpoint accepts a status, margin, owner id or number from a client: state changes are named actions.

| Area | Endpoints |
| --- | --- |
| Dashboard | `GET /dashboard` |
| Quotes | `GET /quotes`, `GET /quotes/:id`, `POST /quotes/:id/review`, `/start-pricing`, `PUT /quotes/:id/pricing`, `POST /quotes/:id/send`, `/expire`, `/cancel`, `/convert`, `PATCH /quotes/:id/internal-notes`, `POST /quotes/expire-overdue` |
| Loads | `GET /loads`, `GET /loads/:id`, `PATCH /loads/:id`, `PUT /loads/:id/carrier-rate`, `PUT /loads/:id/schedule`, `POST /loads/:id/open`, `/carrier-search`, `GET /loads/:id/carrier-matches`, `POST /loads/:id/assign`, `/reassign`, `/unassign`, `/cancel`, `/archive`, `/shipment` |
| Shipments | `GET /shipments`, `GET /shipments/:id`, `POST /shipments/:id/dispatch`, `/pickup`, `/in-transit`, `/at-border`, `/border-cleared`, `/out-for-delivery`, `/deliver`, `/complete`, `/border-events`, `/tracking-updates`, `/exceptions`, `/exceptions/:exceptionId/resolve`, `/cancel` |

Customer additions (Phase 5 API): `POST /customer/quotes/:id/accept` and `/decline` (own quotes only; foreign id → 404).

## Lifecycles

Stored values differ from the brief's names in three places (kept for Phase 5/6 compatibility; every admin response carries
`operationsStatus` with the brief's name): quote `new`=submitted, `reviewing`=under_review, `declined`=customer_declined;
load `assigned`=carrier_assigned; shipment `booked`=scheduled.

- **Quote:** new → reviewing → pricing → quoted → customer_accepted → converted_to_load; quoted → declined / expired; cancelled from any non-final stage up to customer_accepted.
- **Load:** draft → open ⇄ carrier_search → assigned → dispatched → picked_up → in_transit → delivered → completed; cancelled only before pickup (draft … dispatched). Once assigned, status follows the shipment, so they cannot disagree.
- **Shipment:** booked → dispatched → picked_up → in_transit → (at_border → border_cleared, cross-border only) → out_for_delivery → delivered → completed; cancelled before pickup; `exception` is entered by raising an exception and left by resolving it (back to the status it interrupted).
- Invalid moves: `409 INVALID_STATUS_TRANSITION` listing the allowed next statuses (`operations/*Status.service.js`).

## Money and visibility

Integer cents only (floats, strings, ≤0 refused). `brokerMargin = customerRate − carrierRate` is computed in
`pricing.service.js`; a negative margin needs `allowNegativeMargin: true` (`409 NEGATIVE_MARGIN` otherwise). A converted
load's customer rate is locked (the customer accepted it); the carrier rate stays adjustable until pickup.
Customers never see carrier identity, carrier rate, margin, internal notes or assignment history, and see no quote rate
until the quote is sent. Carriers never see customer identity, customer rate, margin, internal notes or the quote link.
Admin, customer and carrier responses use separate explicit presenters; the leak tests scan responses for forbidden strings.

## Numbering

Server-side via `Counter`: `QT-YYYY-NNNNNN`, `LD-…`, `SH-…`. Tracking numbers are random (`HL-` + 10 characters from an
unambiguous alphabet) and unrelated to the shipment number; the unique index guards collisions (retry).

## Carrier eligibility and matching

`carrierEligibility.service.js` (pure rules) is used by matching, assignment and the carrier's own load board. A carrier is
eligible only if: login active, carrier record not archived, status `active`, authority `active`, compliance `approved`,
insurance not expired (if a date is recorded), equipment matches (when the load names one), pickup falls in a declared
operating region, cross-border capability when the load crosses a border, and it has not already been removed from the load.
Every failure is reported with a stable reason code (`CARRIER_NOT_ACTIVE`, `EQUIPMENT_MISMATCH`, `OUTSIDE_SERVICE_AREA`,
`CROSS_BORDER_NOT_PERMITTED`, `PREVIOUSLY_UNASSIGNED` …). `GET /loads/:id/carrier-matches` returns ranked `matches`,
`excluded` (with reasons, capped at 50), counts and criteria; archived carriers never appear.
Assign/reassign re-check eligibility server-side (`409 CARRIER_NOT_ELIGIBLE`), record who/when/why in `assignmentHistory`,
notify the carrier (and, without naming the carrier, the customer).

The Phase 6 board is still an assignment board (no bidding or booking). It now shows a load only to carriers eligible for
it (open or carrier_search, unassigned); an ineligible carrier gets a plain 404 for the detail.
A carrier with no equipment or regions saved sees a hint explaining the empty board.

## Time zones

Every pickup/delivery window, dock appointment and event time is stored as a UTC instant together with the facility's IANA
timezone. Input is either an absolute ISO instant (`…Z`/offset) or a wall-clock time (`2026-12-02T08:00`) **with** a
required `timezone`; nothing defaults to any zone (including Pakistan). Impossible times (Feb 30) and unknown zones are
422; times in a DST gap resolve forward. Admin responses add `earliestLocal`/`scheduledLocal`; carriers see the timezone.
Event times cannot be in the future. Quote pickup dates from customers are date-only and carry no timezone until staff set the schedule.

## Exceptions

Reasons: delay, damage, breakdown, refused, weather, documentation, vehicle_issue, appointment_issue, documentation_issue,
border_issue, delivery_issue, other. Notes are internal (admin only). Customers/carriers see reason, time and resolved flag.
History is kept in `exceptions[]` with resolver and note.

## Search and filters

Loads/quotes/shipments: strict allow-listed filters (status, ids, equipment, country, cross-border, dates, unassigned,
archived), `q` (2–60 chars, matched as escaped literal text), whitelisted sort keys, `limit` ≤ 100. Indexes added:
`Load {quoteId unique sparse}`, `{crossBorder,status}`, `{pickup.earliest}`, `{origin.country,destination.country}`;
`QuoteRequest {pickupDate}`, `{loadId unique sparse}`; `Shipment {customerId,status}`, `shipmentNumber unique sparse`.

## Dashboard

Counts come from aggregates over real records (an empty system reports zeros): quotes and loads by stage, loads needing a
carrier, overdue pickups/deliveries, quotes past expiry, live/cross-border shipments, open exceptions, per-currency
revenue/cost/margin of assigned-or-later loads (capped at 5,000 loads, flagged `truncated`), and the 10 latest operational log entries.

## Audit and notifications

Every mutation writes an `ActivityLog` entry (`operations.<entity>.<action>`, customer answers `customer.quote.*`) with
status transitions and ids; secret-looking keys are rejected by the model. In-app `Notification`s; since Phase 11 each can also be queued for email/SMS (`docs/NOTIFICATIONS_AND_MESSAGING.md`).
Messages contain numbers and city-level lanes, never foreign identity or money.

## Concurrency and idempotency

No multi-document transactions exist on a standalone database, so every write is a single guarded update (`status` must still
equal what was read; otherwise `409 STALE_STATE`). Quote→load uses unique sparse indexes on both sides (`Load.quoteId`,
`QuoteRequest.loadId`) so a double conversion yields one load; a half-finished earlier attempt is completed, not repeated.
Customer accept/decline are idempotent (repeat returns the current state, one log entry, one notification). Shipment
creation is once per load (`loadId` unique). Load+shipment moves update the load first and roll it back if the shipment write loses a race.

## Cancellation and archiving

Loads can be cancelled only before pickup; a live shipment is cancelled with its load (and cancelling a shipment cancels its
load). Reasons are stored internally. Only draft, cancelled or completed loads can be archived. Unassign is refused once a shipment exists (use reassign). Reassign is allowed until pickup.

## Known limitations

- Tested on **FerretDB 1.24 over PostgreSQL**, not real MongoDB (3 existing skips: two partial indexes, one atomic `$inc`). `db:init` reports the known unsupported partial index on `User` there.
- Concurrent writes are guarded, not transactional; FerretDB does not prove atomicity under true parallelism.
- Service-area matching is text based (`operatingRegions` is free text); state/province names and codes, cities, ZIP prefixes, countries and "Nationwide" are understood, nothing else.
- Equipment, region, insurance and cross-border are the only restrictions modelled (no hazmat, weight or customer-specific rules exist in the data).
- No proof of delivery (no storage), email/SMS arrived in Phase 11, no payments, no customer-facing load view, no admin UI (Phase 8).
- Matching evaluates up to 500 carriers; the carrier board considers the 500 newest eligible-candidate loads.
