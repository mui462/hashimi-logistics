# Security checklist (Phase 13)

Each row says what was verified, how, and what remains. "Test" names a file in `backend/tests/` or `frontend/tests/`. Anything not verified by code inspection **and** a test is marked as such. Nothing here claims the site has been penetration-tested by a third party; it has not.

## Verified by code inspection and automated tests

| Area | Control | Evidence |
| --- | --- | --- |
| Sessions | JWT in an HttpOnly cookie, HS256 pinned, issuer checked, `Secure` in production, `SameSite` lax/strict (`none` refused at start-up). Every request reloads the user and checks `isActive`, role and `tokenVersion`, so logout, deactivation, role change and password change end sessions immediately. | `auth.static`, `auth.api`, `security.phase13` (production cookie in a child process) |
| Browser storage | No token or personal data in `localStorage`/`sessionStorage`; no `dangerouslySetInnerHTML`/`innerHTML`/`eval` in the frontend. | grep of `frontend/src` (Phase 13 review) |
| HTTPS | Production refuses plain-HTTP API requests (HTTP 426) except `/health*`; Helmet sends HSTS. Requires the proxy to send `X-Forwarded-Proto` and `TRUST_PROXY_HOPS` to match the real number of proxies. | `security.phase13` |
| CORS | One allowed origin (`CLIENT_URL`), credentials on, never `*`, never reflected. Production requires `CLIENT_URL` to be `https://`. | `security.phase13`, `auth.static` |
| CSRF | SameSite cookie + JSON-only bodies + `Origin` check on unsafe methods + (Phase 13) refusal of `Sec-Fetch-Site: cross-site` requests. There is no CSRF token; this is defence in depth appropriate to a same-site SPA/API pair. `SameSite=None` is blocked. | `security.phase13`, `auth.static` |
| Authorization | `/customer`, `/carrier`, `/operations`, `/finance`, `/admin` are guarded when mounted; the Super Admin is the only role that can do financial or administrative writes. Exactly three roles, one Super Admin (partial unique index, see Database below). | `*.api.test`, `finance` (authorization), `models.static` |
| IDOR | Customer/carrier queries use `ownershipFilter`/`assertOwnsRecord`; foreign records return 404. Finance portals are scoped by customer/carrier. Documents and PODs are ownership-filtered. | `customer.api`, `carrier.api`, `finance`, `storage.documents` |
| Injection | Strict zod schemas (unknown keys refused), `rejectOperators` on admin/finance/CMS, regex input escaped, no string-built queries. | `*.api.test`, `finance` |
| Errors | Generic 500 body, no stack traces, malformed JSON → 400, oversized → 413. | `security.phase13`, `auth.api` |
| Rate limits | Global; per-IP on every auth endpoint; per-account failed logins; per-user password change; **per-address forgot-password and per-user resend-verification (Phase 13)**; **per-user uploads and per-IP quote creation (Phase 13)**; notifications and finance per user. | `auth.ratelimit`, `security.phase13` |
| Reset / verification tokens | 256-bit random, only SHA-256 stored, expiring, single-use (compare-and-set), generic responses, reset bumps `tokenVersion`; **a password change now also revokes an outstanding reset link (Phase 13)**. Raw tokens are not logged (the dev-only link log is refused in production). | `auth.api`, `security.phase13` |
| Uploads | MIME, last extension and magic bytes must agree; SVG/HTML/scripty content refused; size caps; storage keys are random, never from the file name; `Content-Disposition` escaped. | `storage.documents` |
| Private documents | Per-request access check, then a short-lived signed link (default 300 s); Cloudinary private files use authenticated delivery; local driver (development only) uses HMAC links and is refused in production. | `storage.documents` |
| POD rules | Carrier can upload only for its own shipment at delivery stage, replace only its **own** earlier POD (Phase 13 fix: it could previously archive an office-uploaded POD), old files are archived, never deleted. | `storage.documents` |
| Secrets | Environment-only; production refuses placeholder/short/repeated JWT secrets, `mock` providers and debug link logging. Secret scan of source, docs, tests and the built bundle found none (only fake strings used by redaction tests). `.env` files are excluded from the archive. | secret scan (Phase 13), `security.phase13` |
| Audit | Sensitive admin and financial actions are written to the activity log with actor and context, without secrets or card/bank data. | `finance` (audit), `*.api.test` |
| Leakage | Presenters are allow-lists; notification text carries no amounts, bank references or tokens; health no longer reveals the environment name. | `finance`, `notifications.delivery`, `security.phase13` |
| Dependencies | `npm audit` (backend, production deps) and `npm audit` (frontend): 0 known vulnerabilities on 2026-10-10. Re-run before each deployment. | command output |

## Accepted or open (not fixed in Phase 13, on purpose)

| Item | Why | Mitigation / owner |
| --- | --- | --- |
| Registration reveals whether an email is already registered (409). | Changing it changes the sign-up UX; the per-IP auth limiter bounds abuse. | Client decision: keep, or switch to a generic response plus email. |
| Open self-registration can create customer accounts without verified email; quote creation notifies the Super Admin. | Verified-email gating depends on real email delivery being configured. | Per-user and (new) per-IP quote limits. Consider requiring `isEmailVerified` for quotes once Resend is live. |
| Forgot-password has a small response-time difference between known and unknown addresses. | Body and status are identical; fixing needs a constant-time floor. | Low risk; per-address limiter (new) caps probing. |
| Rate-limit counters are in process memory. | With several API instances each has its own counters. | Run one instance, or add a shared store (Redis) before scaling out. Not built. |
| No malware scanning of uploads; no automated retention/cleanup of archived files. | Needs a scanning service and a client retention policy. | Documented in `STORAGE_AND_DOCUMENTS.md`. |
| No two-factor authentication, no CAPTCHA on public forms. | Not requested. | Optional feature. |
| Static-site security headers (CSP etc.) are set by the host serving the React build, not by this repo. | Deployment target not chosen. | Recommended headers in `PRODUCTION_DEPLOYMENT.md`. |
| Real-MongoDB behaviour of the financial lock, uniqueness and partial indexes. | **Could not be tested here** (see `PHASE13_FINAL_AUDIT.md`). | Run `npm run db:verify` and the full suite on real MongoDB before launch. |
