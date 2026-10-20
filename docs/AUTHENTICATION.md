# Authentication and authorization (Phase 3)

## Account types

There are exactly three: `super_admin`, `customer`, `carrier`. There is exactly one Super Admin, created only with `npm run seed:super-admin` (the database also enforces this with a unique partial index). There is no role or permission system.

| Account | Created by | Signs in at | Lands on |
| --- | --- | --- | --- |
| Customer | `POST /auth/register/customer` | `/login` | `/customer` |
| Carrier | `POST /auth/register/carrier` | `/login` | `/carrier` |
| Super Admin | seed command only | `/admin/login` | `/admin` |

The role is decided by the server, from which endpoint was called. A request body can never carry `role`, `accountType`, `isActive`, `isEmailVerified`, `permissions`, `tokenVersion`, an owner id, or any other field that is not in the schema: all registration, login, and reset bodies use strict validation, so extra fields are **rejected with 422**, not silently ignored.

## Endpoints

All are under `/api/v1/auth`. Responses use `{ success, data, message }` or `{ success: false, message, errors }`. Auth responses are sent with `Cache-Control: no-store`.

| Method and path | Access | Purpose |
| --- | --- | --- |
| `POST /register/customer` | public | Creates a user, a linked `Customer` profile, and a session |
| `POST /register/carrier` | public | Creates a user and a linked `Carrier` profile (all statuses `pending`) |
| `POST /login` | public | Customer or carrier sign-in |
| `POST /admin/login` | public | Super Admin sign-in. Customers and carriers are refused here, and the Super Admin is refused at `/login` |
| `POST /logout` | public | Clears the cookie **and** revokes the session on the server |
| `GET /me` | signed in | Safe user plus the linked profile |
| `POST /forgot-password` | public | Requests a reset link. Always answers the same way |
| `POST /reset-password` | public | Sets a new password with a one-time token |
| `POST /verify-email` | public | Confirms an email address with a one-time token |
| `POST /resend-verification` | signed in | Issues a fresh confirmation link |

Registration needs `firstName`, `lastName`, `companyName`, `email`, `password`, `passwordConfirmation`, and optionally `phone`. A company name is required because the linked `Customer` / `Carrier` profile requires one and ownership checks depend on that profile existing. Carrier details such as MC/DOT numbers and equipment are completed later through the profile and application workflow; nothing about authority or compliance is approved automatically.

## Passwords

- bcrypt (`bcryptjs`), cost 12. Hashes are never returned, logged, or placed in activity metadata. The hash only changes when the password changes.
- Policy: at least 10 characters; at most 72 **bytes** (bcrypt ignores anything past that, so longer passwords are refused instead of silently truncated); no single repeated character; not only spaces; not in a short list of very common passwords (punctuation and case do not hide them); must not contain the part of the email before the `@` or equal the person's name. There are no forced symbol/number rules, so passphrases work.
- `passwordConfirmation` must match on registration and reset, and is discarded before the service layer sees it.

## Sessions: JWT in an HTTP-only cookie

- One cookie (default name `hashimi_token`, set with `COOKIE_NAME`): `HttpOnly`, `Path=/`, `SameSite` from `COOKIE_SAME_SITE` (default `lax`), `Secure` whenever `NODE_ENV=production`, and an `Expires` matching the token. Development works over plain `http://localhost`.
- The token is HS256 and contains only `sub` (user id), `role`, `tv` (token version), `iss`, `iat`, `exp`. It never contains an email, profile data, financial data, margins, or permissions. Lifetime: `JWT_EXPIRES_IN` (default `7d`).
- Tokens are never placed in `localStorage` or `sessionStorage`, are not returned in response bodies, and the frontend never reads them.
- **Every protected request re-reads the user from the database.** It must exist, be active, have the same role as the token, and the same `tokenVersion`. Any failure is the same generic 401 and never says why. So deactivation, role changes, logout, and password resets take effect immediately.
- **Session revocation:** `User.tokenVersion` is increased on logout and on password reset, which kills every token issued before. Because it is a single counter, **logging out signs the person out on every device.** That is a deliberate simplicity trade-off. Per-device sessions would need a session collection and can be added later.

## Cookie settings and CSRF

The design relies on `SameSite=Lax` cookies and a CORS policy locked to `CLIENT_URL` (never `*` with credentials). As defense in depth, state-changing requests (anything except GET/HEAD/OPTIONS) are refused with 403 when they carry an `Origin` header that is not `CLIENT_URL`. This also covers sibling subdomains, which `SameSite` does not stop. Requests with no `Origin` (non-browser clients) are unaffected. **This is not a full CSRF-token system.**

**`SameSite=None` is blocked.** If the site and API ever need to be on different registrable domains, cookies would need `SameSite=None`, and CSRF token protection must be built first. Until then the server refuses to start with `COOKIE_SAME_SITE=none`, so the setting cannot be weakened by accident.

Security headers (Helmet): the API sends `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; ...`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, HSTS, and no `X-Powered-By`. That CSP is right for a JSON-only API and is deliberately **not** applied to the React app, whose CSP belongs to whatever hosts the frontend. The frontend's `index.html` sets `referrer: no-referrer` so one-time links cannot leak through a `Referer` header.

## Brute-force protection

Limits are per client IP and configurable (`AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MINUTES`, `GLOBAL_RATE_LIMIT_MAX`). Each endpoint has its own counter: register (both), login, admin login, forgot-password, reset-password, verify-email, resend-verification. In addition, **failed sign-ins are counted per email address** (`LOGIN_ACCOUNT_LIMIT_MAX` per window, any IP, separate counters for `/login` and `/admin/login`). The trade-off: someone can deliberately lock a known email out of signing in for the rest of the window. That slows guessing, and the window is short.

Behind a proxy, `NODE_ENV=production` sets `trust proxy` to one hop so the real client IP is used.

## Credential responses reveal nothing extra

Unknown email, wrong password, and wrong portal all return the identical `401 "Invalid email or password."`, and a password is always compared (against a dummy hash when the account does not exist). Account deactivation (403) is only revealed to someone who supplied the correct password.

Known limits: registration returns 409 for an email that is already registered (the usual trade-off for clear sign-up errors), and forgot-password does slightly more work for real accounts, so a precise timing attack could in theory tell them apart.

## Email verification and password reset

Both use the same design:

1. A random 256-bit token is generated. **Only its SHA-256 hash is stored** (`select: false`), together with an expiry. The raw token exists only in the email.
2. The token is **single use**: consuming it is a conditional update that includes the token hash, so two simultaneous requests cannot both succeed. It is cleared on use, and requesting a new one replaces the old.
3. Invalid, used, and expired tokens give the same response.

| | Lifetime | Environment variable | On success |
| --- | --- | --- | --- |
| Password reset | 30 minutes | `PASSWORD_RESET_TTL_MINUTES` | Password changed, **every session ended** (`tokenVersion + 1`), cookie cleared |
| Email verification | 24 hours | `EMAIL_VERIFICATION_TTL_HOURS` | `isEmailVerified = true` |

Forgot-password answers identically for registered, unregistered, and deactivated emails.

**Email delivery (Phase 11).** `services/email.service.js` hands one-time links to the delivery queue (`notifications/delivery.service.js`); the worker (`npm run worker`) sends them through the configured provider. With no provider configured nothing is queued or sent and the API says so (`emailDeliveryAvailable: false`, `verificationEmailSent: false`, "No email was sent"); the wording depends only on server configuration, never on whether an account exists. With a provider the messages say "queued for sending". Queued links are encrypted at rest and removed once sent; see `docs/NOTIFICATIONS_AND_MESSAGING.md`.

For local development without email, set `DEV_LOG_AUTH_LINKS=true` to print the reset and verification links in the **server log**. The server refuses to start with this flag in production.

The frontend link targets are `${CLIENT_URL}/reset-password?token=...` and `${CLIENT_URL}/verify-email?token=...`. The verification page requires a click to confirm, so a mail scanner that opens the link cannot use up the token.

Verification is **not yet required** for anything; it is recorded so later phases can require it for actions that need a confirmed address.

## Ownership authorization

Role checks answer "what kind of account is this?" Ownership answers "whose records are these?" Both are enforced on the server.

- `middleware/authenticate.js` loads the user. `middleware/authorize.js` provides `requireRole(...)`, `requireSuperAdmin`, `requireCustomer`, `requireCarrier` (unknown role names throw when the route is defined).
- `middleware/ownerContext.js` (`requireOwnerContext`) sets `req.owner = { role, userId, customerId? | carrierId? }`. The ids come from the profile linked to the signed-in user, read from the database. A customer or carrier **with no profile, an archived profile, or a `suspended` / `inactive` profile is refused (403)**. A `pending` carrier is allowed so it can finish onboarding; later phases decide what pending carriers may do with loads.
- `services/ownership.service.js`:
  - `ownershipFilter(req.owner)` returns `{ customerId }`, `{ carrierId }`, or `{}` for the Super Admin. Every list or lookup query must include it.
  - `assertOwnsRecord(owner, record)` reports another party's record as **404, not 403**, so one customer cannot learn that another customer's record exists.
- New records take `customerId` / `carrierId` from `req.owner`, never from `req.body`, query, or URL. The schemas are strict, so a body that includes an owner id is rejected, and the owner fields on every model are `immutable`.
- Identifier parameters are validated with `validators/common.validator.js` (`idParamSchema`); a malformed id is a clean 400.
- Combine with `selectionFor(model, role)` from `models/accessProjections.js` and `.lean()` for role-appropriate responses. Customers receive `rate`; carriers receive `carrierRate`; only the Super Admin receives `brokerMargin`, internal notes, and counterparty ids. (Note: `doc.toJSON()` strips every internal field *including* `rate`/`carrierRate`; use a projection with `.lean()` when a customer or carrier legitimately needs their own price.)
- The existing placeholder modules `loads`, `shipments`, `documents`, `payments`, `notifications` now require sign-in **and** an owner context. `users`, `customers`, `carriers`, and `media` are Super Admin only. Public website modules stay public.

## Activity log

Written through the append-only `ActivityLog` (module `auth`), never failing the request if logging itself fails: `auth.register`, `auth.login.success`, `auth.login.failed` (with a reason: `unknown_account`, `wrong_password`, `wrong_portal`, `account_deactivated`), `auth.logout`, `auth.password_reset.requested`, `auth.password_reset.completed`, `auth.email_verification.requested`, `auth.email.verified`. The client IP and user agent are recorded. Never logged: passwords, hashes, tokens, and the email typed into a failed sign-in for an unknown account.

## Environment variables added in Phase 3

| Variable | Default | Purpose |
| --- | --- | --- |
| `GLOBAL_RATE_LIMIT_MAX` | 300 | Requests per 15 minutes per IP, all endpoints |
| `AUTH_RATE_LIMIT_MAX` | 20 | Attempts per window per IP, per auth endpoint |
| `AUTH_RATE_LIMIT_WINDOW_MINUTES` | 15 | The window for the two limits above |
| `LOGIN_ACCOUNT_LIMIT_MAX` | 10 | Failed sign-ins per email per window |
| `PASSWORD_RESET_TTL_MINUTES` | 30 | Reset link lifetime (5 to 120) |
| `EMAIL_VERIFICATION_TTL_HOURS` | 24 | Verification link lifetime (1 to 168) |
| `DEV_LOG_AUTH_LINKS` | false | Development only: print one-time links in the log |
| `COOKIE_SAME_SITE` | lax | `lax` or `strict`; `none` is refused at startup |

## Tests

```bash
cd backend
npm test                                                        # no database needed; database suites report as skipped
MONGO_TEST_URI=mongodb://127.0.0.1:27017/hashimi_test npm run test:db   # needs a live MongoDB; name must end in _test

cd ../frontend
npm test                                                        # routing, guards, and auth flows in jsdom (mocked API)
```

- `auth.static.test.js`: validators, privilege-escalation and injection payloads, password policy, token randomness, JWT contents and forgery (tampered, `alg: none`, wrong secret, expired, wrong issuer, malformed claims), middleware, role matrix, ownership helpers, headers, CORS, cookie settings, environment guards.
- `auth.ratelimit.test.js`: per-endpoint limits.
- `auth.api.test.js` (database): registration, sign-in portals, logout revocation, deactivation, suspended and missing profiles, reset and verification lifecycles (expired, reused, replaced, concurrent), account throttling, ownership scoping and role-based price visibility, activity log contents, and a scan of every response and the stored data for leaked secrets.
