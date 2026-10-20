# Payments, invoicing and financial management (Phase 12)

> **Real payment gateway: NOT CONFIGURED / NOT LIVE TESTED.** No payment processor is installed. Nothing in this system collects money, moves money or verifies a bank transfer. Every payment entry is an **administrative record made by the Super Admin** and is labeled *"Recorded by Super Admin (manual entry, not bank-verified)"* everywhere it appears.
>
> **Database note.** All automated tests ran on **FerretDB 1.24 (on PostgreSQL), not real MongoDB**. See "Known limitations" and "Production setup".

## What exists, and what each thing means

Five concepts are kept apart on purpose. Mixing them is how accounting mistakes happen.

| Concept | Model / collection | Meaning |
| --- | --- | --- |
| Customer invoice | `Invoice` / `invoices` | A request for payment. **Not proof of payment.** |
| Customer payment record | `PaymentTransaction` (`kind: customer_receipt`) | An administrative entry that a payment was received for an invoice. Only a `succeeded` entry reduces the balance. |
| Carrier payable | `CarrierPayable` / `carrier_payables` | An amount owed to the assigned carrier for a load. **An obligation, not proof the carrier was paid.** |
| Carrier payment record | `PaymentTransaction` (`kind: carrier_payout`) | An administrative entry that a payment was made to a carrier outside this system. This system does not transfer funds. |
| Reconciliation and audit | `GET /finance/reconciliation`, `ActivityLog` (module `payments`) | Read-only comparison of stored balances to the ledger, and the audit trail. |

The legacy Phase 2 `Payment` model (`payments`) and the customer "Invoices" / carrier "Payments" / admin "Payments" pages are **unchanged** and still work. They are a simple status ledger and are not connected to the new models. The new pages are *Billing* (customer), *Payables* (carrier) and the *Finance* group (Super Admin).

## Roles and authorization

Exactly three roles exist (Super Admin, Customer, Carrier); Phase 12 adds none.

- **Super Admin only** may create, edit (drafts), issue, void, record payments, reverse, approve, hold, release, adjust and view internal notes. The whole `/api/v1/finance` router is mounted behind `authenticate` + `requireSuperAdmin`: guests get 401, customers and carriers get 403 before any handler runs. Mongo operators in query strings are rejected (400 `OPERATOR_NOT_ALLOWED`).
- **Customers** see only their own *issued* invoices (drafts are invisible; a void invoice is visible only if it had been issued), confirmed payment history, and their own PDF. The customer id comes from the authenticated profile (`ownershipFilter(req.owner)`), never from a request. Another customer's id is a plain 404.
- **Carriers** see only their own *approved* payables (`approved`, `on_hold`, `partially_paid`, `paid`) with the load reference, approved amount, status, payment dates and references. They never see invoices, customer names or billing details, margins, hold reasons or internal notes, and they have **no write endpoint** (write verbs on `/carrier/payables` return 404/405).
- Every response uses an explicit allow-list presenter (`finance/presenters.js`). Request bodies are strict zod schemas: unknown keys (`customerId`, `status`, `total`, `amountPaid`, `currency`, `carrierId`, card fields…) are rejected with 422.

## Money

- Integer minor units (cents) everywhere; no floats. The browser converts decimal text to cents with exact string parsing; the API accepts only positive safe integers up to 1,000,000,000 (10,000,000.00).
- One currency per record (`USD`, `CAD`, `MXN`), taken from the load. There is **no currency conversion** and no cross-currency application: a payment whose currency differs from the record's is refused (409 `CURRENCY_MISMATCH`).
- Totals, line amounts, balances and payables are calculated **server-side**. The client never sends a total, a paid amount or a status.
- **No taxes, fees, late fees, interest or discounts are calculated**, because the client has not confirmed any rules. If a tax or fee is required today, enter it as an explicit line item. Invoices are **not** claimed to be tax-compliant.

## Invoice lifecycle

Statuses: `draft` → `issued` → `partially_paid` → `paid`, plus `void`.

- **Overdue is not a stored status.** It is derived at read time: `issued` or `partially_paid` with a due date before today (UTC). It is shown beside the real status (`isOverdue`) and is filterable (`?status=overdue`).
- Create (`POST /finance/invoices`): from a **load**. Customer, currency, shipment and quote references come from the load. Line items `{description, quantity, unitAmount}` (1–20). The invoice number is `INV-YYYY-000001` from an atomic counter (`Counter` `findOneAndUpdate $inc`) with a **unique index** and retry on a duplicate-key conflict. Several invoices per load are allowed (partial or staged billing).
- Edit (`PATCH`): drafts only.
- Issue (`POST …/issue`): `draft` → `issued`; sets issue date (today, UTC) and due date. Due date = the date supplied, else issue date + the customer's `billingInformation.paymentTermsDays`; if neither exists the request is refused (422). **No default terms are invented.**
- **Issued invoices are immutable.** Corrections: void it (only if no net payments are recorded) and create a new one; if payments exist, reverse them first. There is no credit-note type (known limitation). No hard delete exists for invoices or payments.
- Void (`POST …/void`, reason required): from `draft`, `issued` or `partially_paid` while `amountPaid` is 0. Repeating is idempotent. A void invoice cannot be issued, edited or paid.
- **Scheduled overdue processing: not implemented.** Because overdue is derived on read, no job is needed for correctness. No overdue notification is sent, because no mechanism exists to send one at the right time. If the client wants overdue reminders, add a worker job in a later phase.

## Customer payment records (receipts)

`POST /finance/invoices/:id/payments` body: `amount` (cents), `currency`, `method` (`bank_transfer` | `check` | `other_offline`), `reference` (**required for bank transfers and checks**), `paymentDate` (not in the future), `idempotencyKey` (8–64 chars), optional `outcome` (`succeeded` default | `failed`), `failureNote`, `internalNotes`.

- Source is always `manual` and confirmation is always `admin_recorded`. There is no `gateway` source, no "bank-verified" state and no `PENDING`/`REFUNDED` state, because nothing in this system can truthfully produce them.
- Only `succeeded` entries change the invoice. A `failed` entry is a recorded non-counting attempt (no balance or status change, no customer notification).
- Refused: overpayment (409 `OVERPAYMENT`), wrong currency (409), draft/void/paid invoice (409 `INVOICE_NOT_PAYABLE`), future date, an unknown field. The invoice, its customer, currency and load come from the stored record.
- **Duplicates:** the stored key is `customer_receipt:<invoiceId>:<key>` (unique index). The same key and request returns the first result (HTTP 200, `replayed: true`); the same key with a different amount or method is 409 `IDEMPOTENCY_KEY_REUSED`.
- **Reversal** (`POST /finance/payments/:id/reverse`, reason required): appends a new `reversal` entry linked with `reversalOf`/`reversedBy`, marks the original `reversed` and lowers the balance. Its idempotency key is derived from the original (`reversal:<id>`), so it can only happen once. Entries are immutable (the model marks amount, currency, targets and recorder `immutable`); mistakes are corrected only by reversal.
- Balance after a payment: `paid` when equal to the total, `partially_paid` when above zero, back to `issued` when reversed to zero.

## Carrier payables and payouts

Statuses: `draft` → `approved` → `partially_paid` → `paid`; `on_hold` (from approved/partially_paid, restored on release); `void`.

- Create (`POST /finance/payables`): from a load that has an **assigned carrier** and is not draft/cancelled. The carrier is the load's `carrierId`. The amount defaults to the load's `carrierRate` (read server-side; `amountSource: load_carrier_rate`) or is entered by the Super Admin (`admin_entered`). It is **never derived from the customer charge**, no margin is stored or exposed, and a load with no rate requires an explicit amount.
- One live payable per load (unique `activeLoadKey`; a voided payable frees the load).
- Approve (draft → approved, records who/when). Approval is **not** a payment and the notification says so. Approval is refused if the load was reassigned to another carrier (`CARRIER_MISMATCH`).
- Hold/release (reason required to hold; the reason is hidden from the carrier). No payout can be recorded while on hold.
- Adjust (reason required, history kept, never below what was already paid).
- Void: only with no recorded payments.
- Payouts use the same ledger endpoint shape (`POST /finance/payables/:id/payments`) with the same duplicate, overpayment, currency and reversal rules. **Only "recorded" exists.** Separate "initiated" and "confirmed" states are not offered because this system cannot observe a bank. Every payout is labeled as a manual record and the system never says funds were transferred.

## Dashboard and reconciliation

`GET /finance/summary` is computed from persisted records on every request. Sections are never merged: customer invoices (billed), customer receipts recorded, carrier payables (owed), carrier payouts recorded, per currency, plus the ten most recent entries. There is no profit, net or "cash received" figure. `GET /finance/reconciliation` compares each stored `amountPaid` with the sum of its succeeded payment entries and reports differences; it never repairs data.

## Invoice PDF

- Generated per request by a small dependency-free writer (`finance/pdfWriter.js`, `invoicePdf.js`; text only, Helvetica). Nothing is stored on disk or in cloud storage and no public URL exists; the PDF is served by an authenticated endpoint with `Cache-Control: no-store, private`, `X-Content-Type-Options: nosniff` and `Content-Disposition: attachment`. The browser downloads it through the cookie session as an in-memory blob.
- Contents come only from stored data: company name (`SiteSettings.companyName`) plus address/phone/email **only if the Super Admin has saved them**, invoice number, status, dates, load reference, customer name and any billing contact/address stored on the customer, line items, subtotal/total, recorded paid amount, outstanding, recorded payment history and the customer note. **No payment instructions, tax IDs, legal terms or late-fee text** are printed because none are configured.
- Untrusted text is reduced to printable Latin-1 and PDF-escaped (`\ ( )`), so a description such as `x) Tj /Evil (` cannot add operators. Characters outside Latin-1 become `?`.
- Endpoints: `GET /customer/billing/invoices/:id/pdf` (own issued invoices; draft → 404; other customers → 404), `GET /finance/invoices/:id/pdf` (Super Admin, any status). Carriers have no PDF.
- The Phase 10 storage layer was not needed. If the client later wants stored/archived PDFs, add them through the existing storage provider with the same ownership checks.

## API routes

Super Admin (`/api/v1/finance`, Super Admin only; write routes are rate limited per admin by `FINANCE_RATE_LIMIT_MAX`):

| Method and path | Purpose |
| --- | --- |
| `GET /summary`, `GET /reconciliation`, `GET /payment-gateway` | Dashboard, balance check, gateway status (`configured: false`) |
| `GET/POST /invoices`, `GET/PATCH /invoices/:id` | List (filters: status incl. `overdue`, customerId, loadId, q, dueFrom/dueTo, sort, order, page, limit), create, read, edit draft |
| `POST /invoices/:id/issue`, `/void`, `/payments` | Issue, void, record a payment |
| `GET /invoices/:id/pdf` | Invoice PDF |
| `GET /payments`, `POST /payments/:id/reverse` | Ledger list, reverse one entry |
| `GET/POST /payables`, `GET/PATCH /payables/:id` | List, create, read, edit draft |
| `POST /payables/:id/approve`, `/hold`, `/release`, `/adjust`, `/void`, `/payments` | Payable actions and payouts |

Customer (read only): `GET /customer/billing/invoices`, `/:id`, `/:id/pdf`. Carrier (read only): `GET /carrier/payables`, `/:id`. Lists are paginated with validated filters and sort keys; unknown query keys are rejected (400).

## Notifications

Reuses the Phase 11 outbox (`notifyUser` → in-app notification → queued email/SMS honoring the recipient's preferences and the delivery worker). Events: invoice issued, payment recorded, payment reversed (customer); payable approved, payout recorded, payout reversed (carrier). Wording is generic ("A payment was recorded on invoice INV-…"): it names the invoice/payable number only, never an amount, balance, method or reference. A failed manual attempt does not notify. If email is unavailable or fails, the financial result is unchanged and no delivery is marked sent. `payment` was already a notification type with no per-type opt-out, so the master email switch applies and SMS is not used. In-app links go to the new Billing / Payables pages.

## Audit history

Every sensitive transition writes an `ActivityLog` entry (module `payments`) with the acting Super Admin, entity id and non-secret metadata: `invoice.created/updated/issued/voided/payment_recorded/payment_attempt_failed/payment_reversed`, `payable.created/updated/approved/held/released/adjusted/voided`, `payable.payment_recorded/…`. Amounts and numbers are logged; internal notes, credentials and card data never are (the model also rejects secret-looking metadata keys). There is no API to edit or delete audit entries.

## Concurrency protections

1. **Per-record lock** (`FinancialLock`, `finance/lock.js`): every payment, reversal, issue, void, approve, hold, adjust is serialized per invoice/payable by inserting a row whose primary key is the lock key. Primary-key uniqueness gives mutual exclusion even where conditional updates are not strictly isolated (FerretDB). Expired locks (crashed holder, 30 s) are removed on contention; release is by token, and the holder calls `assertHeld` (fencing) before writing, so a holder whose lock expired cannot write.
2. **Ledger is the source of truth**: `amountPaid` and status are recomputed (`syncBalance`) from the sum of succeeded payment entries at the start and end of every write under the lock. A crash between the ledger write and the balance write is therefore repaired by the next operation on that record; reversal is idempotent and completes a half-finished reversal.
3. **Normalized identifiers**: ids are lower-cased by the validator, so case variants of an id or idempotency key cannot bypass the lock or the unique key. Idempotency keys are 8–64 characters; a replay must match the original request on amount, currency, method, reference, date and outcome, otherwise 409 `IDEMPOTENCY_KEY_REUSED`.
4. **Payout carrier check**: a payout re-checks the payable's carrier against the load's current carrier (409 `CARRIER_MISMATCH`). Releasing a hold recomputes the status from the amounts, so a payout reversed while on hold cannot restore a wrong status.
5. **Unique indexes**: `invoiceNumber`, `payableNumber`, `idempotencyKey`, and one live payable per load.
6. **Atomic counters** for numbering.
7. Tests exercise simultaneous payments, duplicate submissions (including upper-case id/key variants), reversals, payouts and payable creation, plus balance repair from the ledger.

Not used: multi-document transactions (FerretDB does not provide them). The reconciliation endpoint exists to detect any inconsistency between stored balances and the ledger.

## Data model summary

New collections: `invoices`, `carrier_payables`, `payment_transactions`, `financial_locks`. New enum entries: entity types `invoice` and `carrier_payable` (notifications, documents' related entity list). Unique indexes: `invoice_number_unique`, `payable_number_unique`, `one_live_payable_per_load`, `transaction_idempotency_unique`. Other indexes: invoices by (customer, status, createdAt), loadId, (status, dueDate); payables by (carrier, status, createdAt), (status, dueDate); transactions by (invoiceId, status), (payableId, status), customer/carrier + createdAt, (kind, status, paymentDate), reversalOf. `npm run db:init` creates them.

## Environment variables

Only one new optional variable: `FINANCE_RATE_LIMIT_MAX` (default 300 write requests per admin per 15 minutes). No gateway keys exist. See `backend/.env.example`.

## Payment gateway

Not configured, not live tested. There is no checkout, no webhook endpoint, no provider SDK and no stored credential, and the Customer Portal shows **"Online payment is not currently available."** with no Pay Now button. `finance/gateway.js` only reports that status. Before any gateway is added the client must confirm the provider, countries/currencies, fee handling and who holds the account, and the implementation must include: signature-verified webhooks over the raw body, idempotent event handling keyed by the provider event id, replay protection (timestamp tolerance + stored event ids), reconciliation of provider payouts, a new `source: gateway` with a gateway-confirmed state (only then may a payment be described as confirmed), and a live end-to-end test in the provider's sandbox. None of that is built.

## Production setup

1. Use a real **MongoDB** (replica set recommended). Re-run the financial concurrency tests against it; do not rely on the FerretDB results.
2. Run `npm run db:init` so the unique indexes exist before the first invoice is created.
3. Save the company's real billing details in Super Admin → Settings (address, phone, email); they print on invoices only if present.
4. Set payment terms on each customer (`billingInformation.paymentTermsDays`) or enter a due date when issuing.
5. Run the delivery worker (`npm run worker`) and configure an email provider if invoice notifications by email are wanted (Phase 11).
6. Nothing else is required; no new secrets.

## Known limitations and decisions still needed from the client

- Not tested on real MongoDB; gateway absent; no live email/SMS provider test.
- No credit notes or partial refunds (correct by reversal, void and reissue). No refund workflow.
- No taxes, fees, late fees, interest, discounts or payment terms text. The client must say which apply (sales tax / GST / VAT, fuel surcharges, accessorials, detention, late fees), how to display them and any legal wording required before invoices can be called compliant.
- No scheduled overdue processing or reminders. No dunning.
- Payment instructions (remit-to details) are not configurable; the PDF has none. The client must supply approved wording and whether to add a settings field.
- Company billing details (legal name, address, tax ID) depend on what is saved in Settings.
- Multi-currency totals are shown per currency; there is no FX and no combined total.
- Payables: no carrier invoice/remittance upload, no quick-pay, no factoring, no 1099/tax reporting. Hold/approval policy (for example "POD required") is the Super Admin's manual judgement.
- A load can have one live payable (no split payables); an invoice is created per load (no multi-load invoice).
- The PDF is plain text-only (no logo, no table borders).
- Legacy Phase 2 `payments` records are not migrated into the new models.
