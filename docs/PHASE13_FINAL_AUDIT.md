# Phase 13 — Final production-readiness audit

**Date:** 2026-10-10 · **Overall classification: YELLOW** · **Deployment status: NOT DEPLOYED** · **Real MongoDB: BLOCKED / NOT VERIFIED** · **Real payment gateway: NOT CONFIGURED / NOT LIVE TESTED**

GREEN is not assigned because mandatory checks could not be verified with evidence: no real MongoDB was available, no live Cloudinary/Resend/Twilio credentials were available, and the client decisions in §9 are open. The software itself passed every automated test that could be run (§7).

## 1. Method and scope

Inspected the whole repository as delivered (not the earlier reports): `backend/src` (models, middleware, services, routes, finance, documents, storage, notifications), `backend/scripts`, `backend/tests`, `frontend/src`, `frontend/tests`, `docs/`, `.env.example`. Versions in use: Node ≥ 20.19 (ran on 22.22), Express 5.2, Mongoose 9.11 (MongoDB driver bundled), zod 4, React 19, Vite 8, Tailwind 4. Authentication: JWT in an HttpOnly cookie. API prefix `/api/v1`; routers mounted per role in `backend/src/routes/index.js`.

An **independent read-only security review** was also run by a separate agent that had not seen my reasoning; each finding below was re-checked against the code before being fixed.

## 2. Initial audit — issues found, by priority (before fixes)

No critical or high *code* vulnerabilities were confirmed.

| # | Priority | Issue | Status |
| --- | --- | --- | --- |
| A1 | **High (launch blocker, process)** | All database tests, including financial uniqueness/locking, ran on FerretDB; real MongoDB behaviour is unverified. | **Open — BLOCKED** (§4) |
| A2 | Medium | Forgot-password and resend-verification had only per-IP limits: a victim's mailbox could be flooded from many IPs, and each request overwrote their pending reset link. | Fixed |
| A3 | Medium | Production start-up accepted an `http://` `CLIENT_URL`, a placeholder JWT secret, and plain-HTTP API traffic. | Fixed |
| A4 | Medium | Open self-registration + per-user-only quote limit let throw-away accounts flood the Super Admin with quote notifications. | Mitigated (per-IP quote limit); verified-email gating left as a client decision |
| A5 | Medium | Registration reveals whether an email is registered (409). | Accepted, documented |
| A6 | Low | A password change did not revoke an outstanding reset link (valid up to 30 min). | Fixed |
| A7 | Low | A carrier could archive/replace a POD uploaded by the Super Admin (`replace=true`). | Fixed |
| A8 | Low | No upload rate limit (25 MB buffered per request). | Fixed |
| A9 | Low | `/health` exposed the environment name; no readiness endpoint; plain-text logs; no `uncaughtException` handler. | Fixed |
| A10 | Low | Cross-site state-changing requests without an `Origin` header were not refused. | Fixed (`Sec-Fetch-Site`) |
| A11 | Low | Reverse-proxy depth hard-coded to 1 (wrong depth breaks rate limits/audit IPs). | Fixed (`TRUST_PROXY_HOPS`) |
| A12 | Low | Forgot-password response time differs slightly for known vs unknown emails. | Accepted, documented |
| A13 | Low | Rate-limit counters are per process. | Documented (run one instance) |
| A14 | Info | README still described the project as "Phase 4". No DB verification tool, backup/restore or deployment docs existed. | Fixed |
| A15 | Info | The project's own 40 px target-size check flagged 12 checkboxes (20 px on `/admin/settings`, 24 px on `/admin/notifications`; reported as 14 findings across widths). | **Fixed in the final cleanup**: the checkboxes are now 40 px (`NotificationPreferencesPanel`, `CmsToggle`); layout checked at 375 and 1280 px |

## 3. Code changes made in Phase 13

Backend: `src/app.js` (HTTPS enforcement, configurable proxy depth), `src/config/env.js` (production rules; new variables), `src/middleware/rateLimiters.js` (reset-email, resend-verification, upload, quote-IP limiters), `src/middleware/trustedOrigin.js` (fetch-metadata), `src/routes/auth.routes.js`, `src/carrier/carrier.routes.js`, `src/customer/customer.routes.js` (limiters wired), `src/services/passwordChange.service.js` (revoke reset token), `src/documents/document.service.js` (POD replace rule), `src/controllers/health.controller.js` + `src/routes/index.js` (readiness), `src/utils/logger.js` (JSON logs in production), `src/server.js` (uncaughtException), `scripts/verify-mongodb.js` + `package.json` (`npm run db:verify`), `.env.example`.
Tests: new `tests/security.phase13.test.js` (13 tests); added POD-replacement test to `tests/storage.documents.test.js`; `tests/auth.static.test.js` production-environment helper now supplies valid production values (stricter rules, no assertion weakened); new limits raised in other suites' test environments so unrelated tests do not hit them.
Docs: this file, `PRODUCTION_DEPLOYMENT.md`, `SECURITY_CHECKLIST.md`, `DATABASE_BACKUP_AND_RESTORE.md`, README updates. No Phase 12 finance logic or schema was changed.

## 4. Real MongoDB verification — BLOCKED / NOT VERIFIED

What was attempted: checked for `mongod`/`mongosh`, Docker (no daemon), apt (`mongodb-org` not in the configured repositories), the MongoDB download host, MongoDB's apt repository, conda-forge and container registries. All are blocked by the sandbox network allow-list (HTTP 403 / no route). A real MongoDB instance therefore could not be started, and no credentials/URI for an approved test MongoDB were provided.

Consequences, stated plainly:
- Every database test in this report ran on **FerretDB 1.24 over PostgreSQL**, which reports itself as MongoDB 7.0 but is a different server.
- `npm run db:init` still shows the known `User` error: `Index option "partialFilterExpression" is not implemented yet`. This is a **FerretDB limitation**; the index (one Super Admin, enforced by a partial unique index on `role`) is supported by real MongoDB, but that has **not been verified here**. Until it is, the "exactly one Super Admin" guarantee must be treated as application-level only.
- Not verified on real MongoDB: unique-index behaviour for invoice numbers, `one_live_payable_per_load`, `transaction_idempotency_unique`; the `FinancialLock` insert-as-mutex under concurrency; fencing; ledger repair after a simulated crash; concurrent payments/reversals; any time-based expiry behaviour.
- Transactions were **not** added. The design does not depend on them (per-record lock + ledger recomputed on every write + unique keys). They are only available on replica sets/sharded clusters, which could not be tested, and adding untested transactional code would risk the financial integrity it is meant to protect. `npm run db:verify` reports whether the target supports them.
- **What was delivered to close the gap:** `backend/scripts/verify-mongodb.js` (`npm run db:verify`) — refuses databases not ending in `_verify`/`_test`, reports server product (flags FerretDB), version, topology and transaction availability, builds every declared index and exits non-zero on any failure. It was run against FerretDB and correctly returned `FAIL` ("FerretDB (NOT real MongoDB)", the `User` index error). The whole backend suite is runnable on real MongoDB with `MONGO_TEST_URI=…_test npm test`.

**Required before launch:** run `npm run db:verify` and the full backend suite (including `finance.test.js` and the new concurrency tests) against a real MongoDB 6/7/8 `_test` database, standalone and, if production will be a replica set, on a replica set; confirm `db:init` has zero errors; then rehearse backup/restore.

## 5. Finance review (Phase 12) against the code

Verified by the 69 finance tests and by inspection: invoice lifecycle (issued invoices immutable; void only without payments); due-date rule (request → customer terms → 422, no invented default) and overdue derived at read time; integer-cent amounts, one currency per record (USD/CAD/MXN), mismatch refused, no conversion; payments are ledger entries labeled administratively recorded / not bank-verified, reversals are linked entries, idempotency keys 8–64 chars with full request matching; carrier payables (approve/hold/release/adjust, one live per load, payout re-checks the load's carrier, held-then-reversed status recomputed); PDF generated per request from stored data, authenticated, `no-store`, validated with `qpdf --check`; Super Admin-only financial writes, finance rate limit, audit entries; dashboard sections per currency, no profit figure. The Customer Portal still says "Online payment is not currently available." because **no gateway is configured**. No tax, fees, refunds, credit notes or payment terms were invented. Finance behaviour under real-MongoDB concurrency: see §4.

## 6. Integrations

| Integration | What was verified | Live status |
| --- | --- | --- |
| Cloudinary (private/public separation, upload/replace/archive, expiring links) | Behaviour through the storage abstraction using the in-memory and local drivers: validation, ownership, signed expiring links, archive-not-delete, POD rules; production refuses the local driver; Cloudinary private files use authenticated delivery (code inspection) | **NOT LIVE TESTED** (no credentials). No malware scanning; no automated retention/cleanup of archived files |
| Email (Resend) | Queue → worker → provider with mock provider: outbox rows, retry/backoff, idempotency, sanitized errors, status wording "Sent to provider" (never "delivered"), reset/verification links sealed and not logged; E2E with a real worker process and the mock provider | **NOT LIVE TESTED** with Resend |
| SMS (Twilio) | Disabled unless `SMS_PROVIDER` is set and the user consented; configuration validation and mock tests only | **NOT TESTED**; no SMS sent |
| Payment gateway | Does not exist | **NOT CONFIGURED / NOT LIVE TESTED** |

## 7. Test results on the final code

See §10 for exact totals (filled from the final runs). Accessibility: axe-core (WCAG 2.0/2.1 A/AA, plus best-practice in the CMS sweep) is not a project dependency; the project's earlier QA used axe-core from a scratch directory outside the repo and this phase reused those scripts unchanged. Responsive checks cover 375/768/1280 (and more) with a horizontal-scroll check.

## 8. Not done, by design

No deployment, DNS change, paid service, real email/SMS, or production database access. No new features, no Phase 14.

## 9. Client decisions and business configuration

**Confirmed requirements (already built):** exactly three roles and one Super Admin; lanes US↔Canada and US↔Mexico only (no Canada↔Mexico, ocean or air); integer cents, single currency per record; manual payments labeled as administrative records; no card/bank credentials stored; no invented MC/DOT numbers, testimonials, tax rates, payment terms or contact details.

**Pending client decisions (each blocks only the function noted):**

| Decision | Blocks |
| --- | --- |
| Company billing details and invoice legal wording | Printing company identity/legal text on invoice PDFs (currently omitted, nothing invented) |
| Tax rules and fees | Any tax/fee line on invoices (none calculated) |
| Default payment terms | Issuing invoices without an explicit due date for customers lacking terms |
| Payment instructions (bank/remit-to) | Showing "how to pay" on invoices (none shown) |
| Payment gateway provider/countries/fees | Online payment (not built) |
| Overdue reminder policy | Automatic reminders (none sent) |
| Refund and credit-note policy | Refunds/credit notes (reverse-and-rerecord only) |
| Final company contact details | Public contact page/footer (placeholders in `config/brand.js`, hidden when empty) |
| Deployment target, domain/DNS | Everything in `PRODUCTION_DEPLOYMENT.md` §9–10 |
| Provider credentials and approved sender identities (Cloudinary, Resend sender domain, Twilio if wanted) | Live uploads, live email, SMS |
| Real MongoDB hosting choice (Atlas/replica set) | Final database verification |
| Registration enumeration / verified-email-for-quotes policy | Optional hardening (§2 A4, A5) |
| Upload retention policy and malware scanning | Optional |

**Optional features (not required for launch):** payment gateway, SMS, two-factor authentication, CAPTCHA on public forms, error-monitoring vendor, shared rate-limit store for multi-instance scaling.

## 10. Final test results

All runs below were made **after the last code change** of this phase, against FerretDB 1.24 (not real MongoDB) unless stated.

| Suite | Command | Result |
| --- | --- | --- |
| Backend, all | `MONGO_TEST_URI=mongodb://127.0.0.1:27018/hl_test npm test` | **661 tests: 658 passed, 0 failed, 3 skipped, 0 cancelled** |
| — of which Phase 12 finance | `tests/finance.test.js` | 69 / 69 passed (re-run in the full suite) |
| — of which Phase 13 security | `tests/security.phase13.test.js` | 13 / 13 passed |
| — Phase 10 documents/media/POD | `tests/storage.documents.test.js` | included in the 658, including the new office-POD test |
| — Phase 11 notifications/auth | `tests/notifications.delivery.test.js`, `auth.*` | included in the 658 |
| Frontend, all | `npm test` (jsdom, mocked API) | **456 tests: 456 passed, 0 failed, 0 skipped** |
| Frontend production build | `npm run build` | succeeds |
| Backend "build" | none — plain Node ES modules, `node --check` on changed files, start-up exercised by tests and E2E | n/a |
| E2E Phase 10 documents/media/POD (Chromium, 7 widths, axe) | `qa10.mjs` | **30 / 30 passed** (needs local storage provider) |
| E2E Phase 11 notifications (real worker process, mock provider, axe, 375/768/1280) | `qa11.mjs` | **14 / 14 passed, including when run straight after Phase 10 on the same database** (assertions are now scoped to the rows created by the run) |
| E2E Phase 12 finance (PDF, permissions, axe, 375/768/1280) | `qa12.mjs` | **28 / 28 passed** |
| E2E brokerage workflow: auth, role guards, quote → load → carrier → shipment | `e2e.mjs` | **21 / 21 passed** |
| E2E Admin + CMS + public site sweep (93 axe runs at 1440/390/320, responsive, console errors) | `qa9.mjs` | **12 / 12 steps passed, 0 axe problems, 0 page errors** (the first attempt used a 280 s timeout that killed the browser mid-sweep and, in a separate attempt, storage was configured when the script expects it unconfigured; both were harness mistakes, re-run correctly) |
| Admin panel responsive/axe sweep (7 widths incl. 375/768/1280) | `qa8.mjs` | axe runs 63, **0 problems** (target-size findings fixed) |
| `npm audit` backend (production deps) / frontend | | 0 / 0 vulnerabilities |

Skipped backend tests (all three are FerretDB limitations, **not** passes):
1. `models.database` — "the database allows exactly one Super Admin" (server has no partial indexes).
2. `models.database` — "User: email is unique, and only one Super Admin can exist" (same).
3. "document numbering stays unique under concurrent requests" — this server *loses concurrent `$inc` updates*, so the concurrency cannot be verified. This is the same atomic-counter mechanism used for invoice and payable numbers, so those are also **unverified under concurrency until run on real MongoDB**; the finance tests that do run assert uniqueness through the unique indexes and retry-on-duplicate logic.

Not run: any test against real MongoDB, any live Cloudinary/Resend/Twilio/gateway call, any test against a deployed environment, cross-browser tests (Chromium only), a third-party penetration test.


## 11. Final cleanup pass (after the first Phase 13 zip)

- **Target size:** the 14 findings were all native checkboxes (no buttons or links). The checkboxes are now 40x40 px, label text aligned, hint text indent adjusted; screenshots at 375 and 1280 px show no layout damage. The check itself (`qa8.mjs`) was not changed.
- **Phase 11 isolation:** `qa11.mjs` asserted absolute row counts in `notification_deliveries`, but Phase 10 uploads queue emails first. It now records the ids present before the run and asserts only on rows created by the run. Valid rows were not deleted and no assertion was loosened (still exactly 2 queued rows for a quote, exactly 2 sent by the worker, exactly 1 admin-only row with email off, exactly 1 security row).
- **Phase 12 test race:** `qa12.mjs` read the Load dropdown before the loads had arrived; it now waits for the option. It failed on some fresh runs and passed on others, so it was a harness race, not an application defect.
- **Harness hazard found:** earlier QA runs could leave an old API process holding port 5056, so a later suite could silently talk to a stale server (this caused two spurious failures, including the CMS media step). The final runs killed all API processes before each suite and verified exactly one was running.
- Final totals: see the table in section 10 (updated).
