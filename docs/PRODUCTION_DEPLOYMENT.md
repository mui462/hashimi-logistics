# Production deployment guide (Phase 13)

> **Deployment status: NOT DEPLOYED.** Nothing in this repository has been deployed, no DNS was changed, no paid service was created and no production database was touched. A passing local build is not evidence of production readiness. This guide matches the real scripts in `package.json`; hosting names are examples because the client has not chosen a target.

## 1. Architecture

```
Browser ──HTTPS──▶ Static host / CDN (React build, frontend/dist)
Browser ──HTTPS + HttpOnly cookie──▶ Reverse proxy / platform TLS ──▶ API (node backend/src/server.js, /api/v1) ──▶ MongoDB
                                                               Delivery worker (node backend/scripts/run-worker.js) ──▶ Resend / Twilio (optional)
Uploads/documents: Cloudinary
```

Three long-running things: the **static site**, the **API process**, the **notification delivery worker**. MongoDB and Cloudinary are managed services.

**Same-site requirement.** Authentication uses a `SameSite=Lax` cookie (`None` is deliberately refused). The site and the API must therefore be **same-site**: for example `https://www.example.com` (site) and `https://api.example.com` (API) share the registrable domain. Hosting the site and API on unrelated domains will make sign-in fail. Decide domains first (section 9).

## 2. Prerequisites

- Node.js ≥ 20.19 on the build machine and API/worker hosts.
- **Real MongoDB** (Atlas or self-hosted, 6.0+ recommended). FerretDB is *not* the verified target; see `PHASE13_FINAL_AUDIT.md` §4.
- Cloudinary account (production uploads); Resend account with a verified sending domain (email); Twilio only if SMS is approved.
- A secret manager or the host's encrypted environment variables.

## 3. Environment variables

Authoritative list with comments: `backend/.env.example`. Never commit `.env`.

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | port your platform routes to |
| `MONGO_URI` | `mongodb+srv://…` or `mongodb://…` with a least-privilege application user |
| `JWT_SECRET` | ≥ 32 random chars, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Start-up fails for placeholders/repeated characters. |
| `JWT_EXPIRES_IN`, `COOKIE_NAME`, `COOKIE_SAME_SITE` | defaults are fine (`7d`, `hashimi_token`, `lax`) |
| `CLIENT_URL` | exact site origin, **`https://`** (start-up fails on `http://`). Used for CORS, the Origin check and email links. |
| `TRUST_PROXY_HOPS` | number of proxies in front of the API (default 1). Wrong values break rate limiting and audit IPs. |
| `ENFORCE_HTTPS` | leave unset (on in production). Requests need `X-Forwarded-Proto: https` from your proxy. |
| `STORAGE_PROVIDER` / `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | `cloudinary` + credentials (`local` is refused in production) |
| `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | only once the sender identity is approved and verified (`mock` is refused in production) |
| `SMS_PROVIDER` and `TWILIO_*` | leave **unset** until SMS consent requirements are met and the client authorises it |
| `DELIVERY_*`, `*_RATE_LIMIT_MAX`, `RESET_EMAIL_LIMIT_MAX`, `UPLOAD_RATE_LIMIT_MAX`, `QUOTE_IP_LIMIT_MAX` | defaults unless load requires otherwise |
| `DEV_LOG_AUTH_LINKS` | must be `false` (refused if `true`) |
| `SUPER_ADMIN_*` | only for the one-time seed command; remove afterwards |

Frontend (build time, `frontend/.env.production` or the host's build env): `VITE_API_URL=https://api.example.com/api/v1`, optional `VITE_SITE_URL`, `VITE_OG_IMAGE`. These are public values; never put secrets in `VITE_*`.

## 4. Database

1. Create a dedicated database and an application user with read/write on that database only.
2. Verify the server first, using a throw-away database whose name ends in `_verify`:
   ```bash
   cd backend && MONGO_URI="mongodb+srv://…/hashimi_verify" npm run db:verify
   ```
   Expect `"server": "MongoDB"`, `"realMongoDb": true`, no `indexFailures`, `"verdict": "PASS"`. Note `topology` and `transactionsAvailable`: transactions exist only on replica sets/sharded clusters. The application does not require them (per-record lock + ledger recomputation); see the audit.
3. Initialise the production database: `cd backend && npm run db:init` (creates indexes and the two CMS singleton documents; deletes nothing, inserts no business data). It must finish with **no** index errors on real MongoDB, including the `User` partial unique index that enforces one Super Admin.
4. Create the single Super Admin once: set `SUPER_ADMIN_FIRST_NAME`, `SUPER_ADMIN_LAST_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` in a temporary environment, run `npm run seed:super-admin`, then remove those variables.
5. Configure backups before launch (`DATABASE_BACKUP_AND_RESTORE.md`).

## 5. Build and run

```bash
# Frontend
cd frontend && npm ci && VITE_API_URL=https://api.example.com/api/v1 npm run build   # output: frontend/dist

# Backend (API)
cd backend && npm ci --omit=dev && npm start            # node src/server.js

# Notification worker: separate process, same environment variables
cd backend && npm run worker                            # node scripts/run-worker.js
```

- Run **one API instance** until a shared rate-limit store exists (counters are per process). Run **one worker** unless you have read the claim/lock design in `NOTIFICATIONS_AND_MESSAGING.md`.
- Use a process manager/platform restart policy (systemd, PM2, container restart) for both processes. The API exits on unhandled rejections/exceptions by design so the manager restarts it; it shuts down gracefully on SIGTERM.
- Static site: serve `frontend/dist` with an SPA fallback (all unknown paths → `index.html`) and the headers in section 7.

## 6. HTTPS, cookies, CORS

- Terminate TLS at the proxy/platform. Forward `X-Forwarded-Proto` and set `TRUST_PROXY_HOPS` accordingly.
- Cookies are `HttpOnly; Secure; SameSite=Lax; Path=/` in production (tested).
- CORS allows exactly `CLIENT_URL`. Do not add wildcard or extra origins.
- Check from outside: `curl -i http://api.example.com/api/v1/auth/me` → 426 (or redirected by your edge); `https://…` → 401 without a cookie.

## 7. Recommended static-site security headers (set by the static host)

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://res.cloudinary.com; connect-src 'self' https://api.example.com; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

Adjust `connect-src`/`img-src` to the real API and media hosts and test in a browser; the CSP above is a starting point and has **not** been exercised against a deployed site. Add `includeSubDomains`/preload only after confirming every subdomain serves HTTPS.

## 8. Health, logs, monitoring

- Liveness: `GET /api/v1/health` (always 200 while the process is up). Readiness: `GET /api/v1/health/ready` (200 only with a connected database, else 503). Neither reveals the environment name. Both are exempt from HTTPS enforcement for platform probes.
- Logs: in production the API and worker write **one JSON object per line** (`time`, `level`, `message`) to stdout/stderr; ship them with your platform's log drain. Logs contain no tokens, passwords or payment details by design; review a sample after the first real traffic.
- Alert on: readiness 503, process restarts, 5xx rate, notification deliveries stuck in `failed`/`pending` (Super Admin delivery log), reconciliation mismatches (`GET /finance/reconciliation` non-empty), disk/DB usage, backup job failures.
- Error monitoring (e.g. Sentry) is **not integrated**; add one only with client approval of the vendor. Not built.
- The worker has no HTTP health endpoint; monitor the process and the age of the oldest pending delivery.

## 9. Domain and DNS (not done; needs client decisions)

Pick the site and API hostnames (same registrable domain), create the DNS records your hosts specify (A/CNAME for site and API; Resend's SPF/DKIM/DMARC records for the sending domain), and wait for TLS certificates to issue. Lower TTLs before cutover and keep the old records for rollback. Nothing has been changed.

## 10. Cutover order

1. Provision MongoDB → `db:verify` → `db:init` → seed Super Admin → backup job.
2. Configure secrets → start API → check `/health/ready`.
3. Start the worker with `EMAIL_PROVIDER` **unset** first; confirm it idles. Then enable Resend with a test recipient you own and verify one delivery before real users.
4. Build and publish the frontend with the final `VITE_API_URL`.
5. Point DNS; run the smoke tests (section 12).
6. Only then announce.

## 11. Rollback

- **Frontend:** redeploy the previous `dist` (keep the last two builds). Instant.
- **API/worker:** redeploy the previous release/commit; keep the previous `node_modules`/image. Stop the worker first, then the API, then start the old versions. The Phase 13 release adds no schema changes, so no data rollback is needed from Phase 12.
- **Data:** only restore a backup if a deployment changed data (`DATABASE_BACKUP_AND_RESTORE.md`). Take a fresh backup before every deployment.
- **Config:** keep the previous environment values; secret rotation (JWT) signs everyone out, which is acceptable in an incident.

## 12. Post-deployment smoke tests

Run against production with test accounts you control (never real customer data):

1. `GET /api/v1/health` 200; `/health/ready` 200; `http://` API URL refused/redirected.
2. Public pages load, no console errors, no mixed content; unknown route shows the 404 page.
3. Register a customer; verification and reset emails arrive from the approved sender and the links work once, then fail on reuse.
4. Sign in as customer/carrier/Super Admin; each lands in the right portal; a customer cannot open `/admin`, an API call to `/api/v1/finance/invoices` returns 403, another customer's invoice id returns 404.
5. Upload a document/POD; open it via the expiring link; confirm the link stops working after ~5 minutes.
6. Super Admin: create a draft invoice, issue it, download the PDF, record a *test* manual payment, reverse it; reconciliation shows no mismatch. Payment page still says online payment is unavailable.
7. Confirm a notification email reaches a test inbox and the delivery log shows `sent`.
8. Confirm backups ran and a restore rehearsal was done.

## 13. What this guide does not cover

Real payment gateway (not configured, not tested; needs a client-chosen provider), SMS (disabled), error-monitoring vendor, WAF/DDoS tooling, multi-instance scaling (needs a shared rate-limit store), and any hosting-vendor-specific click-paths.
