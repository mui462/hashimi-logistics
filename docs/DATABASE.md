# Database architecture (Phase 2)

MongoDB through Mongoose. All models live in `backend/src/models/` and are exported from `backend/src/models/index.js`.

Conventions (carried over from Phase 1): one PascalCase file per model, `export const Name = mongoose.model(...)`, ES modules, explicit collection names.

## Model map

| Model | Collection | Purpose |
| --- | --- | --- |
| `User` (Phase 1) | `users` | Login identity. Roles: `super_admin`, `customer`, `carrier` |
| `Customer` | `customers` | Business profile for a customer user |
| `Carrier` | `carriers` | Business, authority, insurance, and compliance profile for a carrier user |
| `CarrierApplication` | `carrier_applications` | Public "Become a Carrier" submission and its review result |
| `QuoteRequest` | `quote_requests` | A customer's request for a freight quote |
| `Load` | `loads` | A booked unit of freight (customer, carrier, rates, schedule) |
| `Shipment` | `shipments` | Live tracking for a load, including border events |
| `Document` | `documents` | Metadata for stored files (no file bytes in MongoDB) |
| `Payment` | `payments` | Legacy Phase 2 payment status ledger (no gateway); still used by the original customer Invoices / carrier Payments pages |
| `Invoice` (Phase 12) | `invoices` | Customer invoice: line items, integer-cent totals, `amountPaid`, status, unique `invoiceNumber`. Issued invoices are immutable |
| `CarrierPayable` (Phase 12) | `carrier_payables` | Amount owed to the assigned carrier for a load; one live payable per load (`activeLoadKey`) |
| `PaymentTransaction` (Phase 12) | `payment_transactions` | Append-only ledger of manual customer receipts and carrier payouts, with linked reversals and a unique `idempotencyKey` |
| `FinancialLock` (Phase 12) | `financial_locks` | Short-lived per-record lock rows (primary-key insert) that serialize financial updates |
| `Notification` | `notifications` | In-app notifications for a user |
| `NotificationDelivery` (Phase 11) | `notification_deliveries` | Delivery outbox: one row per event, recipient and channel (IN_APP/EMAIL/SMS), with status, attempts and a unique `idempotencyKey` |
| `NotificationDeliveryClaim` (Phase 11) | `notification_delivery_claims` | One row per worker attempt; its unique `_id` decides which worker may send. Purged after 7 days |
| `ActivityLog` | `activity_logs` | Append-only audit trail |
| `SiteSettings` | `site_settings` | Global site configuration (singleton) |
| `Homepage` | `homepage` | Homepage CMS content (singleton) |
| `Page`, `Service`, `Industry`, `ServiceArea`, `BlogPost`, `Faq`, `Testimonial` | `pages`, `services`, `industries`, `service_areas`, `blog_posts`, `faqs`, `testimonials` | CMS content |
| `Media` | `media` | Media library records |
| `Counter` | `counters` | Atomic sequences for quote, load, shipment, invoice and payable numbers (infrastructure) |

## Relationships

```
User ─┬─ Customer ─┬─ QuoteRequest ── Load ── Shipment (tracking + border events)
      │            ├─ Load / Shipment / Payment / Document
      │            └─ (customerId on each, set by the server)
      ├─ Carrier ──┬─ Load / Shipment / Payment / Document
      │            └─ CarrierApplication (carrierId, set on approval)
      ├─ Notification (recipientId)
      └─ ActivityLog (userId)
```

- One `User` has at most one `Customer` or one `Carrier` profile (`userId` is unique and immutable).
- `QuoteRequest` 1 : N `Load` (`Load.quoteId`), `Load` 1 : 1 `Shipment` (`Shipment.loadId` is unique).
- `Document.relatedEntityId` is polymorphic. Its target model is chosen by `relatedEntityType` (`quote`, `load`, `shipment`, `customer`, `carrier`, `payment`, `carrier_application`), so `populate()` works for each type.
- `Carrier.documents`, `CarrierApplication.submittedDocuments`, `Load.documents`, and `QuoteRequest.attachments` are optional convenience lists of `Document` ids. `Document.relatedEntity*` plus its visibility is the source of truth for access.
- Tracking events and border events are **embedded** in `Shipment` because they are small, always read with the shipment, and never queried on their own.

## Security fields on `User` (Phase 3)

`tokenVersion` (session revocation), `passwordChangedAt`, and the SHA-256 hashes and expiry dates of the email-verification and password-reset tokens are all `select: false`, so they are never returned or serialized. `User` now uses the same `createSchema` factory as the other models, so its `toJSON()` strips every hidden field automatically. See [AUTHENTICATION.md](AUTHENTICATION.md).

`User.notificationPreferences` (Phase 11) holds the email/SMS opt-ins; it is queryable but never serialized in user JSON. See `docs/NOTIFICATIONS_AND_MESSAGING.md`.

## Money

All amounts are stored as **integer minor units (cents)** in a `Number` field, with the currency in a sibling `currency` field (`USD`, `CAD`, or `MXN`; default `USD`).

- Integers add and subtract exactly, so there is no floating-point drift (`0.1 + 0.2` cannot occur).
- Mongoose rejects any non-integer value and any negative value (except `brokerMargin`, which may be negative).
- `Load.brokerMargin = rate - carrierRate` is computed automatically on validation, so it cannot drift from the two rates.
- `backend/src/utils/money.js` converts between decimal text and cents (`toMinorUnits("19.99") -> 1999`) by working on the text, never by multiplying floats, and rejects more than two decimals.
- Money is never summed across currencies. Totals and reports will group by currency.

Why not `Decimal128`: it needs special handling in JSON, in arithmetic, and in every driver call, and the business needs only cent precision.

## Cross-border freight

There is no separate international system. A cross-border shipment uses the same records:

| Where | Fields |
| --- | --- |
| `QuoteRequest` | `isCrossBorder`, `originCountry`, `destinationCountry`, `borderCrossing`, `customsStatus` |
| `Load` | origin/destination countries; `isCrossBorder` is a computed virtual |
| `Shipment` | `borderStatus` (`not_applicable`, `pending`, `at_border`, `cleared`, `delayed`) and `borderEvents` |

Rules enforced by validation:

- Supported lanes are US -> CA, CA -> US, US -> MX, and MX -> US. Canada <-> Mexico is rejected.
- `isCrossBorder` must agree with the countries on the addresses.
- Domestic quotes always end up with `customsStatus = "not_applicable"`. Cross-border quotes default to `not_started`.
- A domestic shipment (`borderStatus = "not_applicable"`) cannot hold border events or use the `at_border` / `border_cleared` statuses.
- Border events cover **At Border**, **Customs Processing**, **Border Cleared**, and **Border Delayed**.

## Privacy by default (internal brokerage data)

Every internal field is declared `select: false`, so a normal query never returns it:

| Model | Hidden fields |
| --- | --- |
| `Load` | `rate`, `carrierRate`, `brokerMargin`, `assignedBy` |
| `QuoteRequest` | `internalNotes`, `estimatedRate`, `assignedTo` |
| `Customer`, `Carrier`, `CarrierApplication`, `Payment` | `notes` |
| `Carrier` | `rating` |
| `Document` | `storageKey` |
| soft-delete models | `archivedBy` |

Two more layers:

1. **`toJSON()` strips every `select: false` field**, including on a document that was just created in memory. `res.json(document)` therefore cannot leak a margin. `toInternalJSON()` is the explicit Super-Admin-only way to serialize everything.
2. **`backend/src/models/accessProjections.js`** defines, per model and role, exactly which hidden fields to opt in to. A customer gets `rate` but never `carrierRate`, `brokerMargin`, or carrier identity. A carrier gets `carrierRate` but never `rate`, `brokerMargin`, or customer identity. Controllers call `.select(selectionFor("Load", req.user.role))`. A `null` result means "no access to this model".

Ownership (which records) is separate from projection. Future controllers must filter by the authenticated user's own `customerId` or `carrierId`, resolved from the session, and must never read an owner id from a request body. `customerId` and `carrierId` are `immutable`, so an update cannot reassign a record.

Document `visibility`: `private` (uploader and Super Admin), `customer` (the owning customer), `carrier` (the owning carrier), `admin` (Super Admin only). `Document.customerId` / `carrierId` are denormalized owners set by the server, so ownership checks are one indexed query.

## Deletion and audit

- Operational records (customers, carriers, applications, quotes, loads, shipments, payments, documents) are **archived, not deleted**: `archivedAt`, `archive(userId)`, `restore()`, and the `.active()` query helper. Archived records still appear in queries unless `.active()` is added, so nothing disappears implicitly.
- Mongoose hard deletes (`deleteOne`, `deleteMany`, `findOneAndDelete`, document `deleteOne()`) on those models **throw** unless `{ allowHardDelete: true }` is passed for an audited maintenance task. This guards Mongoose calls only; direct driver access and `bulkWrite` bypass it.
- `ActivityLog` is append-only: it cannot be updated, and deletion needs `allowHardDelete` (for a future retention job). Its `metadata` is rejected if any key at any depth looks like a password, token, secret, cookie, authorization header, API key, or hash.
- No cascade deletes exist anywhere.

## Indexes

Only indexes that match expected queries are defined. `backend/scripts/init-database.js` creates any that are missing; it never drops one.

| Model | Indexes |
| --- | --- |
| User | `email` unique; `{role, createdAt}`; partial unique on `role = super_admin` (`single_super_admin`) |
| Customer | `userId` unique; `companyName`; `email`; `{status, createdAt}` |
| Carrier | `userId` unique; `MCNumber` and `DOTNumber` unique + sparse; `companyName`; `{status, complianceStatus}`; `equipmentTypes` |
| CarrierApplication | `{status, createdAt}`; `email`; `MCNumber`; `DOTNumber` (not unique, so a rejected applicant can reapply) |
| QuoteRequest | `quoteNumber` unique; `{customerId, createdAt}`; `{status, createdAt}`; `createdAt` |
| Load | `loadNumber` unique; `{customerId, createdAt}`; `{carrierId, status}`; `{status, createdAt}`; `quoteId` |
| Shipment | `trackingNumber` unique; `loadId` unique; `{customerId, createdAt}`; `{carrierId, status}`; `{status, createdAt}` |
| Document | `{relatedEntityType, relatedEntityId}`; `{customerId, visibility}`; `{carrierId, visibility}`; `{uploadedBy, createdAt}` |
| Payment | `loadId`; `{carrierId, status}`; `{customerId, status}`; `{status, createdAt}` |
| Notification | `{recipientId, isRead, createdAt}` |
| ActivityLog | `{userId, createdAt}`; `{module, createdAt}`; `{entityId, createdAt}`; `createdAt` |
| Page, Service, Industry, BlogPost | `slug` unique, plus `{status or isActive, displayOrder or publishedAt}`; blog also `{category, status}` and `tags` |
| ServiceArea, Faq, Testimonial | `{isActive, displayOrder}` (service areas also `{country, stateProvince}`; FAQs `{isActive, category, displayOrder}`) |
| Media | `storageKey` unique; `{folder, createdAt}`; `{type, createdAt}` |
| SiteSettings, Homepage | `key` unique (singleton) |

## Singletons

`SiteSettings` and `Homepage` have a `key` field whose only allowed value is `"primary"`, with a unique index. The database therefore rejects a second document. Always use `SiteSettings.getPrimary()` / `Homepage.getPrimary()`, which create the document on first use. Contact details, hero copy, statistics, and testimonials are never pre-filled.

## Numbering

`backend/src/services/numbering.service.js`:

- `nextQuoteNumber()` -> `QT-2026-000001`, `nextLoadNumber()` -> `LD-2026-000001`. Atomic per type and per year, using the `Counter` collection.
- `generateTrackingNumber()` -> `HL-` + 10 random characters. Tracking numbers will be used on a public page, so they are random, not sequential, to prevent enumeration of other customers' shipments. The unique index is the final guard.

## Seed architecture

- `npm run seed:super-admin` (Phase 1) is unchanged.
- `npm run db:init` creates missing indexes and the two singleton documents. It inserts **no** customers, carriers, quotes, loads, shipments, payments, statistics, or testimonials.
- No development fixtures are created. Test data exists only inside `backend/tests/fixtures.js`.

## Tests

```bash
cd backend
npm test                                                     # static tests; database tests are skipped
MONGO_TEST_URI=mongodb://127.0.0.1:27017/hashimi_test npm run test:db
```

- `tests/models.static.test.js` needs no database: required fields, enums, ranges, cross-border rules, shipment and border rules, money, hooks, index definitions, reference wiring, privacy projections.
- `tests/models.database.test.js` needs a live server: unique indexes, relationships and `populate`, timestamps, persisted tracking and border events, immutability, append-only logs, soft delete, singletons, sequential numbering.
- The database name **must end in `_test`**; the suite drops the database afterwards and refuses to run otherwise.
- Without `MONGO_TEST_URI` the database suite is reported as skipped with its reason. It is never reported as passed.

## Decisions to review

- **Nested address.** `address` is one nested object (`street`, `city`, `state`, `zipCode`, `country`) rather than five top-level fields. Countries are limited to `US`, `CA`, `MX`.
- **Additions beyond the brief:** `Counter` (number generation), `CarrierApplication.carrierId`, `Document.customerId` / `carrierId` (ownership), `currency` on money-bearing models, `archivedAt` / `archivedBy`, and `key` on the two singletons.
- **Assumed enum values** (the brief gave none): `shipmentType` = `FTL`, `LTL`, `Partial`, `Expedited`, `Other`; `customsStatus` = `not_applicable`, `not_started`, `documents_pending`, `in_progress`, `cleared`, `held`; shipment exception reasons = `delay`, `damage`, `breakdown`, `refused`, `weather`, `documentation`, `other`.
- **Phase 1 change:** the plain `{role}` index on `User` became `{role, createdAt}`, so it no longer shares a key pattern with the partial unique `single_super_admin` index.
- **Files.** `Document.fileUrl` is stored as given. If the storage provider serves files from public URLs, anyone with the link can open them regardless of `visibility`. Prefer private/authenticated delivery with short-lived signed URLs when uploads are built.


## Phase 12 finance models

See **[PAYMENTS_AND_INVOICING.md](PAYMENTS_AND_INVOICING.md)** for fields, statuses, indexes and the concurrency design. FerretDB 1.24 note: a `$group` with several accumulators returns 0 for all but the first, so the finance summary issues one aggregation per measure (correct on MongoDB too).
