# HASHIMI LOGISTICS INC.

**Freight Brokerage & Transportation Solutions**
Domestic & Cross-Border Freight Solutions Across North America

## Project overview

This repository is the foundation for the HASHIMI LOGISTICS INC. platform. When complete, it will contain:

- a professional public brokerage website
- a customer portal
- a carrier portal
- a Super Admin operations and CMS system

**Current status: Phase 13 (production-readiness audit) complete; overall classification YELLOW, not deployed.** Phases 1-12 delivered the architecture, data model, authentication, public site, customer/carrier portals, Super Admin panel, brokerage operations, CMS, storage/documents/POD, notifications and invoicing/payments. Phase 13 audited security, hardened production configuration and wrote the launch documentation. It could **not** verify behaviour on a real MongoDB (all tests ran on FerretDB) and nothing is deployed. Read **[docs/PHASE13_FINAL_AUDIT.md](docs/PHASE13_FINAL_AUDIT.md)** first, then **[docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md)**, **[docs/SECURITY_CHECKLIST.md](docs/SECURITY_CHECKLIST.md)** and **[docs/DATABASE_BACKUP_AND_RESTORE.md](docs/DATABASE_BACKUP_AND_RESTORE.md)**. Some older sections below describe the state at the time they were written; the per-phase documents in `docs/` are authoritative. See [Current scope](#current-scope).

### Account model

There are exactly three account types, stored in `User.role`:

| Value         | Description                                                 |
| ------------- | ----------------------------------------------------------- |
| `super_admin` | One account only. Full access to the whole platform.        |
| `customer`    | Restricted to its own data (enforced server-side later).    |
| `carrier`     | Restricted to its own data (enforced server-side later).    |

"Only one Super Admin" is enforced by the database: a partial unique index on `role` where `role = "super_admin"`. Public registration can only create `customer` or `carrier` accounts.

## Architecture

```
Browser (React SPA)  ──HTTPS + HTTP-only cookie──▶  Express API (/api/v1)  ──▶  MongoDB
```

- The frontend and backend are separate apps with separate `package.json` files.
- The API URL is read from `VITE_API_URL`. No API URL is hard-coded.
- Authentication uses a JWT stored in an **HTTP-only cookie**. Tokens are never placed in `localStorage` and are never readable by JavaScript. Every request re-checks the user in the database, so deactivation, logout, and password resets take effect immediately. See **[docs/AUTHENTICATION.md](docs/AUTHENTICATION.md)**.
- Frontend route guards only improve the user experience. **Security is enforced by the backend**, and every backend module will have to apply `authenticate` and `authorize` as it is built.

## Frontend

React 19, Vite, JavaScript/JSX, Tailwind CSS v4, React Router v7, Axios, Lucide icons.

- `src/config/` brand text, path constants, navigation, environment access
- `src/services/` the only place that talks to the API (`apiClient`, `authService`, `healthService`)
- `src/context/` and `src/hooks/` authentication state and reusable hooks
- `src/routes/` the route table (`definitions/`), route guards, and the router
- `src/layouts/` Public, Auth, Customer, Carrier, and Admin layouts
- `src/components/` common UI, forms, and layout pieces
- `src/pages/` public and auth pages. Customer, carrier, and admin screens are placeholders generated from the route definitions.

Route guards: `ProtectedRoute`, `SuperAdminRoute`, `CustomerRoute`, `CarrierRoute` (all built on `RoleRoute`), plus `GuestRoute` for the sign-in pages.

### Design rules

- Minimum text size is 16px. Do not add smaller text.
- Visible keyboard focus on every interactive element, semantic HTML, labelled form fields.
- Mobile-first layouts. The desktop navigation appears at the `xl` breakpoint; below that a menu button is used.
- Business details (phone, email, address, MC and DOT numbers) live in `src/config/brand.js` as empty placeholders. Anything left empty is not displayed. These values will move into the CMS later.

## Backend

Node.js (ES modules), Express 5, Mongoose, JWT, bcryptjs, Zod, Helmet, CORS, express-rate-limit.

- `src/app.js` builds the Express app (importable without a database connection)
- `src/server.js` connects to MongoDB, starts the HTTP server, and shuts down cleanly
- `src/config/` environment validation and database connection
- `src/middleware/` `authenticate`, `authorize` (`requireRole`, `requireSuperAdmin`, `requireCustomer`, `requireCarrier`), `ownerContext`, `trustedOrigin`, `validate`, rate limiters, error handlers
- `src/models/` all Mongoose models, shared schemas, plugins, and access projections (see `docs/DATABASE.md`)
- `src/services/`, `src/controllers/`, `src/validators/`, `src/routes/` the layered structure each module will follow
- `src/jobs/` and `src/templates/` reserved for later phases
- `scripts/seed-super-admin.js` creates the single Super Admin
- `scripts/init-database.js` creates missing indexes and the two singleton CMS documents
- `tests/` model tests (static tests plus database tests that need a live MongoDB)

Every response uses one of two shapes:

```json
{ "success": true, "data": {}, "message": "..." }
{ "success": false, "message": "...", "errors": [] }
```

Stack traces and internal details are never sent to clients.

### API modules

All of these are mounted under `/api/v1`. Apart from `health` and `auth`, they currently return a placeholder response and contain no business logic. The access level shown is the default each placeholder enforces now and is expected to be refined per endpoint when the module is built.

| Access        | Modules                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| Public        | `quotes`, `carrier-applications`, `tracking`, `cms`, `services`, `industries`, `service-areas`, `blog`, `faqs`, `testimonials`, `seo`, `site-settings` |
| Signed in     | `loads`, `shipments`, `documents`, `payments`, `notifications`                                           |
| Super Admin   | `users`, `customers`, `carriers`, `media`                                                                |

## Database

MongoDB through Mongoose. The connection string comes from `MONGO_URI`. The connection module logs the host and database name only, never the credentials.

If MongoDB cannot be reached, the server logs a clear error and exits with a non-zero code rather than pretending to be healthy.

Phase 2 defines 22 models (Phase 11 adds two delivery models and Phase 12 adds four finance models) (customers, carriers, carrier applications, quotes, loads, shipments with border events, documents, payments, notifications, activity logs, site settings, homepage, CMS content, media, and a counter). Money is stored as integer cents, internal brokerage fields are hidden by default, and operational records are archived rather than deleted. Full details: **[docs/DATABASE.md](docs/DATABASE.md)**.

After pointing `MONGO_URI` at a database, run `npm run db:init` once (from `backend/`) to create the indexes. It adds no business data.

## Installation

Requirements: Node.js 20.19 or newer, npm, and a reachable MongoDB instance (local or Atlas).

```bash
npm run install:all
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Then edit `backend/.env` and `frontend/.env` (see the next section).

## Environment variables

### `backend/.env`

| Variable                | Required | Notes                                                         |
| ----------------------- | -------- | ------------------------------------------------------------- |
| `NODE_ENV`              | no       | `development` (default), `test`, or `production`              |
| `PORT`                  | no       | Defaults to `5000`                                            |
| `MONGO_URI`             | yes      | MongoDB connection string                                     |
| `JWT_SECRET`            | yes      | Random string, at least 32 characters                         |
| `JWT_EXPIRES_IN`        | no       | For example `30m`, `12h`, `7d`. Defaults to `7d`              |
| `CLIENT_URL`            | yes      | Frontend origin allowed by CORS, e.g. `http://localhost:5173` |
| `COOKIE_NAME`           | no       | Defaults to `hashimi_token`                                   |
| `COOKIE_SAME_SITE`      | no       | `lax` (default) or `strict`. `none` is refused at startup until CSRF protection exists |
| `GLOBAL_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MINUTES`, `LOGIN_ACCOUNT_LIMIT_MAX` | no | Rate limits (defaults 300, 20, 15, 10) |
| `PASSWORD_RESET_TTL_MINUTES`, `EMAIL_VERIFICATION_TTL_HOURS` | no | One-time link lifetimes (defaults 30, 24) |
| `DEV_LOG_AUTH_LINKS`    | no       | Development only: print reset/verification links in the log. Refused in production |
| `CLOUDINARY_*`          | later    | Prepared for file storage in a later phase                    |
| `RESET_EMAIL_LIMIT_MAX`, `UPLOAD_RATE_LIMIT_MAX`, `QUOTE_IP_LIMIT_MAX`, `TRUST_PROXY_HOPS`, `ENFORCE_HTTPS` | no | Phase 13 hardening limits and proxy/HTTPS settings (see `backend/.env.example`) |
| `PUBLIC_FORM_LIMIT_MAX`, `TRACKING_LIMIT_MAX` | no | Per-IP limits for the public quote, carrier application and contact forms (default 10 per hour, per form) and public tracking (default 30 per 15 minutes) |
| `FINANCE_RATE_LIMIT_MAX` | no | Per-admin limit on finance write endpoints per 15 minutes (Phase 12, default 300). See `docs/PAYMENTS_AND_INVOICING.md` |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY`, `SMS_PROVIDER`, `TWILIO_*`, `DELIVERY_*` | no | Email / optional SMS delivery and worker tuning (Phase 11). See `docs/NOTIFICATIONS_AND_MESSAGING.md` |
| `SUPER_ADMIN_*`         | seed     | Used only by `npm run seed:super-admin`                       |

The server validates these at startup and exits with a readable message if any are missing or malformed.

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### `frontend/.env`

| Variable       | Notes                                                              |
| -------------- | ------------------------------------------------------------------ |
| `VITE_API_URL` | Backend base URL including `/api/v1`, e.g. `http://localhost:5000/api/v1` |

## Development commands

From the repository root:

| Command                       | What it does                          |
| ----------------------------- | ------------------------------------- |
| `npm run install:all`         | Installs backend and frontend packages |
| `npm run dev:backend`         | Starts the API with auto-restart      |
| `npm run dev:frontend`        | Starts the Vite dev server            |
| `npm run start:backend`       | Starts the API without auto-restart   |
| `npm run build:frontend`      | Creates the production frontend build |
| `npm run test:backend`        | Runs the backend tests                |

Or run them from inside `backend/` and `frontend/` directly (`npm run dev`).

The frontend runs at `http://localhost:5173` (fixed port, so CORS stays in sync) and the API at `http://localhost:5000`.

### Tests

```bash
cd backend
npm test        # everything that needs no database; the database suites are reported as skipped
MONGO_TEST_URI=mongodb://127.0.0.1:27017/hashimi_test npm run test:db   # model and authentication tests on a live MongoDB

cd ../frontend
npm test        # routing, route guards, and authentication flows (jsdom, mocked API)
```

The database name in `MONGO_TEST_URI` must end in `_test` because the suites drop it afterwards. Database tests are never reported as passed when no database is configured.

### Creating the Super Admin

Set `SUPER_ADMIN_FIRST_NAME`, `SUPER_ADMIN_LAST_NAME`, `SUPER_ADMIN_EMAIL`, and `SUPER_ADMIN_PASSWORD` (it must pass the password policy) in `backend/.env`, then run:

```bash
cd backend
npm run seed:super-admin
```

The script refuses to run if a Super Admin already exists. Remove the `SUPER_ADMIN_*` values from `.env` afterwards. Sign in at `/admin/login`.

## API base URL and health endpoint

Base URL: `http://localhost:5000/api/v1`

```bash
curl http://localhost:5000/api/v1/health         # liveness
curl http://localhost:5000/api/v1/health/ready   # readiness: 200 only while the database is connected, else 503
```

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-01-01T12:00:00.000Z",
    "database": "connected"
  },
  "message": "API is running."
}
```

## Project structure

```
hashimi-logistics/
├── frontend/
│   ├── public/
│   └── src/
│       ├── assets/  components/{common,layout,forms,tables,tracking}/
│       ├── pages/{public,auth,customer,carrier,admin}/
│       ├── layouts/  routes/  context/  hooks/  services/  utils/  config/
│       ├── App.jsx
│       └── main.jsx
├── backend/
│   ├── scripts/          seed-super-admin.js, init-database.js
│   ├── tests/            model tests (static + database)
│   └── src/
│       ├── config/  controllers/  middleware/  models/  routes/
│       ├── services/  validators/  utils/  jobs/  templates/
│       ├── app.js
│       └── server.js
├── docs/
│   ├── DATABASE.md       data architecture reference
│   ├── AUTHENTICATION.md authentication and authorization reference
│   └── PUBLIC_WEBSITE.md public website reference
├── .gitignore
├── package.json      (workspace convenience scripts only)
└── README.md
```

## Current scope

**Phase 1 (foundation)**

- Project structure, `.gitignore`, environment templates, and this README
- Frontend: Vite, React Router, Tailwind, Axios service layer, design tokens, reusable components, and Public, Auth, Customer, Carrier, and Admin layouts
- The full route map for the public site, authentication, and the three portals. Portal and most public pages are clearly labelled placeholders.
- A foundation test page at `/` (not the final homepage)
- Backend: Express app, centralized configuration and error handling, Helmet, CORS, rate limiting, request validation, health endpoint, and placeholder route modules
- Authentication: register, login, Super Admin login, logout, and current-user lookup using JWT in HTTP-only cookies, with `authenticate` and `authorize` middleware

**Phase 2 (database foundation)**

- 22 Mongoose models with validation, indexes, relationships, and tests (see `docs/DATABASE.md`)
- Cross-border support on quotes, loads, and shipments (US <-> Canada, US <-> Mexico)
- Privacy by default for margins, carrier pay, and internal notes, plus per-role field projections for future controllers
- Archive-instead-of-delete for business records, an append-only activity log, and singleton site settings and homepage documents
- `npm run db:init`, and number generation helpers for quotes, loads, and tracking

**Phase 3 (authentication and authorization)**

- Customer and carrier registration that creates the login and its linked business profile; sign-in for each portal and a separate Super Admin sign-in; logout that revokes the session on the server; `/auth/me` with the linked profile
- Password policy with confirmation, strict request validation that rejects role/privilege injection and MongoDB operators
- Session revocation through a token version; account-status enforcement (deactivated users, suspended or missing profiles)
- Role guards for the three account types and **ownership authorization** (`req.owner`, `ownershipFilter`, `assertOwnsRecord`)
- Per-endpoint, configurable rate limits plus a per-account sign-in throttle; stricter security headers; origin check on state-changing requests
- Password reset and email verification **architecture**: random, hashed, expiring, single-use tokens, with audit logging of security events
- Frontend connected to the new endpoints, plus an email confirmation page

**Phase 4 (public website)**

- Cinematic homepage and 20 public routes (about, services, industries with one reusable detail template each, service areas, shippers, carriers, how it works, tracking, multi-step quote, carrier application, carrier resources, resources and articles, FAQ, contact, privacy, terms)
- Transparent-to-solid sticky navbar with accessible mobile menu; footer driven by client-controlled placeholders
- Hero video/poster/fallback system (no video hard-coded); original illustrated freight scenes stand in for photography
- Prop-driven, CMS-ready section components fed from `src/content/`; client data lives in `src/config/brand.js`
- Frontend services for quotes, carrier applications, contact, tracking, blog and CMS; SEO component; route-level code splitting

**Not built yet**

- **Payments gateway (Phase 12).** Invoices, manual payment records, carrier payables and an invoice PDF exist, but **no payment gateway is installed: `Real payment gateway: NOT CONFIGURED / NOT LIVE TESTED`**. Payment entries are administrative records by the Super Admin and are never described as bank-verified. No taxes, late fees or interest are calculated. Tests ran on FerretDB, not real MongoDB. See `docs/PAYMENTS_AND_INVOICING.md`.
- **Email / SMS delivery (Phase 11).** Implemented as a queue plus a separate worker (`npm run worker`), with Resend (email) and Twilio (SMS) providers and mock providers for tests. **Not live-tested with real providers**; with no provider configured nothing is sent and the API says so. See `docs/NOTIFICATIONS_AND_MESSAGING.md`.
- Requiring a verified email for any action
- Per-device session management (logging out ends all of a person's sessions)
- CSRF token protection (needed before `SameSite=None` could be enabled)
- API endpoints for the Phase 2 business models (the module routes are still placeholders)
- Public form endpoints are now built (`POST /quotes`, `POST /carrier-applications`, `POST /contact`, `GET /tracking/:number`; see `docs/PUBLIC_WEBSITE.md`). Still missing: file uploads from the public forms, linking a guest quote to a customer account, an approve/reject workflow for carrier applications, and e-mail confirmations to visitors.
- CMS screens, load management, customer and carrier dashboards, payments, file uploads, reporting, notifications, and admin CRUD

## Deployment notes

- Set `NODE_ENV=production` so cookies are marked `Secure`, plain-HTTP API requests are refused (426) and `TRUST_PROXY_HOPS` proxies are trusted for rate limiting. Serve both apps over HTTPS on the same registrable domain. Production start-up refuses an `http://` `CLIENT_URL`, placeholder secrets, mock providers and debug link logging. Full guide: `docs/PRODUCTION_DEPLOYMENT.md`.
- Never commit `.env` files. Only `.env.example` templates belong in Git.
- The frontend does not use local file storage and the backend does not write uploads to disk.
