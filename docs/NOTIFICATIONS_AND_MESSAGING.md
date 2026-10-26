# Notifications and messaging (Phase 11)

Email, optional text messages (SMS) and a delivery queue, built on top of the existing in-app notifications.
**Status: YELLOW.** The queue, worker, providers, preferences and admin log are implemented and tested with mock providers
against FerretDB. No real email or SMS provider has been smoke-tested and real MongoDB was not used. See "Known limitations".

## Architecture

```
business event
  -> notifyUser()/notifySuperAdmins()         operations/notifications.service.js   (existing, extended)
     -> Notification (in-app)                 models/Notification.js                (existing, unchanged)
     -> enqueueForNotification()              notifications/delivery.service.js
        -> NotificationDelivery rows          models/NotificationDelivery.js        (IN_APP = SENT, EMAIL/SMS = QUEUED)
npm run worker  (separate process)
  -> processDueDeliveries()                   claim one row -> check recipient + preferences -> provider.send()
     -> SENT | RETRYING (backoff) | FAILED | CANCELLED
```

* The HTTP request only **inserts rows**. It never calls a provider and never waits on one.
* The worker is a real process (`backend/scripts/run-worker.js`), not a timer inside the API. If it is not running, rows stay
  `QUEUED` and the Super Admin delivery log shows them as such. Nothing is claimed as sent that was not.
* **Reused, not duplicated:** the `Notification` model, `notifyUser`/`notifySuperAdmins`, `recordActivity`, the auth token
  flows (hashing, TTL, single use), `selectionFor`, the validation/error conventions, the provider-abstraction pattern from
  `backend/src/storage`, and the Super Admin `/admin` router.
* **New:** `NotificationDelivery` (outbox) and `NotificationDeliveryClaim` (worker claims), `backend/src/notifications/*`,
  user `notificationPreferences`, `/…/notification-preferences` endpoints, `/admin/notification-deliveries`.

### Status meaning

| Status | Meaning |
| --- | --- |
| `QUEUED` | Waiting for the worker. |
| `PROCESSING` | A worker holds it (lock expires after `DELIVERY_LOCK_SECONDS`). |
| `RETRYING` | A temporary failure; `nextAttemptAt` says when it is tried again. |
| `SENT` | **The provider accepted the message** and returned a message id (`providerMessageId`). It does *not* mean the message reached an inbox or phone. No delivery receipts are collected. |
| `FAILED` | A permanent failure, or the retries ran out. Not retried again unless the Super Admin re-queues it. |
| `CANCELLED` | Not sent on purpose: preference turned off after queueing, recipient gone/inactive, no valid phone, security link expired or superseded. |

`IN_APP` rows are written as `SENT` when the in-app notification exists (audit trail); they never go to a provider.

## Events and recipients

Only events that already exist in the system send notifications. Messages are the same recipient-safe text as the in-app
notification (lane = cities only; no rates, margin, internal notes, other parties).

| Event | Recipients (In-App always; Email/SMS when allowed by preferences) |
| --- | --- |
| Quote request received/created | Customer (own quote) → In-App + Email (+SMS if opted in); Super Admin → In-App + Email |
| Quote sent (priced) | Customer → In-App + Email (+SMS) |
| Quote accepted / declined | Customer (confirmation) → In-App + Email; Super Admin → In-App + Email. Carrier: none |
| Quote expired / cancelled | Customer → In-App + Email |
| Quote converted to load | Customer → In-App + Email |
| Load assigned | Assigned carrier → In-App + Email; owning customer ("a carrier was assigned", no identity) → In-App + Email |
| Load reassigned / unassigned / cancelled / pay or schedule changed | Previous/assigned carrier and owning customer, as before → In-App + Email |
| Shipment scheduled, dispatched, pickup, in transit, border, out for delivery, delivered, completed, exception raised/resolved | Owning customer and assigned carrier only → In-App + Email (+SMS) |
| POD uploaded / replaced | Owning customer → In-App + Email; Super Admin → In-App + Email. Carrier: none |
| Password reset, email verification | The account owner → **Email only** (security category, ignores preferences) |
| Carrier application submitted / status changes | **Not implemented:** the application workflow has no notification events yet, so none are invented here. |

Recipients are resolved on the server from the record's owner. No client input chooses a recipient.
Unverified email addresses receive no business email (security emails are the exception: they are how an address gets verified).

## Idempotency

`idempotencyKey` is unique (database index): `<eventKey>:<recipientId>:<channel>`, for example
`quote.customer_accepted:<quoteId>:<userId>:EMAIL`. A double click, a retried request or a repeated event inserts nothing
the second time. Events that can legitimately recur use a key that includes the changing part (assignment includes the load's
`updatedAt`; shipment exceptions include the exception id). The frontend plays no part. Auth emails use
`auth:<kind>:<userId>:<hash of the token>`.

Worker side: before sending, the worker must win a unique `NotificationDeliveryClaim` (`<deliveryId>:<retryRound>:<attempt>`),
which guarantees a single sender per attempt even where conditional updates are not strictly isolated (see limitations).

## Retry

* Temporary errors (network, timeout, HTTP 429/5xx): `RETRYING`, next attempt after `min(DELIVERY_BACKOFF_MAX_SECONDS, DELIVERY_BACKOFF_BASE_SECONDS × 2^(attempt-1))` (defaults 60 s, 120 s, 240 s …, capped at 1 h).
* Permanent errors (HTTP 4xx other than 429, bad credentials, no address): `FAILED` immediately.
* At `DELIVERY_MAX_ATTEMPTS` (default 5) a row becomes `FAILED`. No infinite retry.
* A worker that dies mid-send leaves a lock; after `DELIVERY_LOCK_SECONDS` another worker reclaims it, and the attempt still counts.
* The Super Admin can re-queue a `FAILED` notification row ("Queue again"). Security emails are never re-sent: their link is
  gone by design; the user requests a new one.
* `lastError` holds only `code: standard message` built from the error code. Provider response bodies, keys, addresses and numbers are never stored or logged.

## Worker and production start

```bash
# API (unchanged)
cd backend && npm start
# Delivery worker: a separate long-running process, same environment variables
cd backend && npm run worker          # = node scripts/run-worker.js
```

Run the worker under a process manager (systemd, a second container, a Render/Railway "worker" service, PM2 …) so it restarts
on failure. It handles `SIGTERM`/`SIGINT` by finishing the current pass and exiting 0. More than one worker is safe.
It polls every `DELIVERY_WORKER_POLL_SECONDS` (default 10) and logs which providers are configured at startup.

## Environment variables

Only the variables of the *selected* provider are needed. None are required for tests or local development.

| Variable | Needed when | Notes |
| --- | --- | --- |
| `EMAIL_PROVIDER` | optional | `resend` or `mock`. Empty: no email is sent and the API says so. `mock` is refused when `NODE_ENV=production`. |
| `EMAIL_FROM` | `resend` | Verified sender, e.g. `HASHIMI LOGISTICS INC. <notices@your-domain>` |
| `RESEND_API_KEY` | `resend` | Secret. Never returned, logged, or shown. |
| `EMAIL_REPLY_TO` | optional | |
| `SMS_PROVIDER` | optional | `twilio` or `mock` (mock refused in production). SMS is never required. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | `twilio` | `+` E.164 sender number |
| `DELIVERY_MAX_ATTEMPTS`, `DELIVERY_BACKOFF_BASE_SECONDS`, `DELIVERY_BACKOFF_MAX_SECONDS` | optional | 5, 60, 3600 |
| `DELIVERY_WORKER_POLL_SECONDS`, `DELIVERY_BATCH_SIZE`, `DELIVERY_LOCK_SECONDS` | optional | 10, 20, 120 |
| `NOTIFICATION_RATE_LIMIT_MAX` | optional | Per signed-in user, per 15 minutes (default 60) |
| `CLIENT_URL` | existing | Used for links in emails |

The API process and the worker both need `MONGO_URI`, `JWT_SECRET` (it also derives the key that seals queued security links)
and the provider variables. The API only needs the provider variables to know whether email is *available*.

## Providers

* **Email:** Resend over HTTPS (`fetch`, no SDK dependency): `notifications/providers/email.resend.js`. Add another provider by
  implementing `send({to, subject, text, html}) -> {providerMessageId}` and selecting it in `providers/index.js`.
* **SMS:** Twilio Messages API over HTTPS: `providers/sms.twilio.js`. `send({to, body}) -> {providerMessageId}`.
* **Mock:** `providers/mock.provider.js` records messages in memory and can be told to fail. Used by tests; `*_PROVIDER=mock`
  exercises the worker locally without credentials.
* Neither provider exposes delivery receipts here, so the system does not report them.
* **Setup (Resend):** create an account, verify your sending domain (SPF/DKIM), create an API key, set `EMAIL_PROVIDER=resend`,
  `EMAIL_FROM`, `RESEND_API_KEY`. **Setup (Twilio):** buy/verify a sender number, set the three `TWILIO_*` values and
  `SMS_PROVIDER=twilio`. Review carrier SMS compliance (opt-in, STOP handling) for your numbers before enabling SMS.

### Text messages

* Off by default and never required. The user opts in (`smsNotifications`) and needs a number that normalizes to **E.164**
  (`notifications/phone.js`). Ten-digit and `1`+ten-digit North American numbers are accepted; other numbers must start with `+`
  and a country code. Stored phone values are never changed or rejected by this: a malformed number simply gets no SMS.
* The number comes from `User.phone`, else the customer/carrier profile phone. Message text: brand + notification title + "Sign in to your account for details." No links, names, prices or carrier details.

## Templates

`notifications/templates.js`. Branded text + HTML with the company name (`SiteSettings.companyName`, default
`HASHIMI LOGISTICS INC.`). Every dynamic value is HTML-escaped, there is no user-supplied HTML, and links are built only
from `CLIENT_URL` plus a fixed portal path. No phone number, address, MC/DOT number, certification, statistic or guarantee is
invented; nothing marketing is sent.

## Authentication emails

Email verification (registration, resend) and password reset go through the same queue (`category: security`).

* Tokens are generated and hashed exactly as before; only the hash is stored on the user.
* The emailed link must survive until the worker sends it, so it is stored **AES-256-GCM encrypted** (key derived from
  `JWT_SECRET`) in `securePayload` (`select: false`, never serialized), and **deleted when the row reaches SENT, FAILED or
  CANCELLED**. It is kept only while a retry is pending, and the row is cancelled once the token's own expiry passes.
* A newer request supersedes an older queued link. Raw tokens are never logged or put in the audit log.
* Anti-enumeration is unchanged: the forgot-password answer is identical for known and unknown addresses and depends only on
  server configuration. Unknown addresses create no row.
* With no email provider nothing is queued and the API says "No email was sent". `DEV_LOG_AUTH_LINKS=true` (development only,
  refused in production) still prints the link to the server log when no provider is configured; it is not a production mechanism.
* The wording is honest: "queued for sending", not "sent".

## Preferences

`User.notificationPreferences` (never in auth/user JSON): `emailNotifications` (default on), `smsNotifications` (default off),
`quoteNotifications`, `shipmentNotifications` (loads and shipments), `documentNotifications` (default on).

* `GET/PUT /api/v1/{customer|carrier|admin}/notification-preferences`: the user comes from the session; the body schema is strict (a role, id or any other key is rejected with 422); turning SMS on requires a valid number.
* Preferences only reduce what is sent. They never widen who can see something, and they are re-checked by the worker at
  send time. Security emails cannot be disabled. There is no marketing email.

## Super Admin delivery log

`GET /api/v1/admin/notification-deliveries` (filters `channel`, `status`, `type`, `category`; paginated), `GET …/:id`,
`POST …/:id/retry`. Super Admin only (customers/carriers get 403, guests 401). Returns metadata only: channel, type, status,
provider, attempts, provider message id, sanitized last error, times, a masked recipient (`j***@domain`). It never returns
message text, full addresses, tokens, secrets or the idempotency key. UI: **Admin → Delivery log**.
No new roles were added.

## Rate limiting

Per signed-in user (`NOTIFICATION_RATE_LIMIT_MAX`) on notification listing/read, preference and delivery-log endpoints and on
customer quote creation. The existing per-IP limiters still cover registration, login, forgot-password, reset and verification.

## Failure behavior

Event → in-app notification (always) → queue rows → worker attempt → temporary failure: backoff retry → permanent failure or
retries exhausted: `FAILED` (visible in the log). A provider outage or a queue error never fails the business action or
changes an API answer; queue errors are logged and swallowed like the audit log. Responses never include provider messages.

## Security

* Credentials only from environment variables; not in code, rows, logs, audit metadata, API responses or the frontend.
* Delivery rows hold no address, phone, password, token or provider secret (the address is read from the user at send time).
* Customer emails never contain carrier identity or margins; carrier emails never contain other carriers/customers or rates
  (tests send the full quote and assignment flows and scan every message).
* Role injection through preference endpoints is rejected; `/admin/*` delivery endpoints are Super Admin only; ids in the URL
  are validated and unknown ids give 404.

## Testing

* `backend/tests/notifications.delivery.test.js` (44 tests, mock providers/mock `fetch` only, no credentials): queueing without
  waiting on providers, idempotency (including the unique index), retries/backoff/max attempts, permanent failure, crashed worker
  recovery, concurrent workers, preferences, SMS, auth emails (encrypted at rest, removed when sent, no token in logs,
  anti-enumeration, supersede, expiry), authorization/IDOR/role injection, rate limiting, leakage scans, admin log, a real
  `npm run worker` process start/stop.
* `frontend/tests/notification-delivery.test.mjs` (15 tests): settings panel in all three portals, delivery log page.
* The test database is **FerretDB 1.24 on PostgreSQL**, not MongoDB. Run:
  `MONGO_TEST_URI=mongodb://127.0.0.1:27018/hl_test npm test` (database name must end in `_test`).

## Known limitations

* **No real provider has been live-tested** (Resend and Twilio code is exercised only through mock `fetch`). Run a controlled
  smoke test with real credentials before relying on it.
* **Real MongoDB was not used**: tests run on FerretDB. The worker's exclusivity does not depend on atomic conditional updates
  (it uses a unique claim row), but `db:init` on a real MongoDB has not been run for the two new collections.
* Delivery means *provider accepted*; no bounce/delivery webhooks or receipts are processed.
* Each `NotificationDeliveryClaim` row is kept for 7 days and purged by the worker (no TTL index, to stay portable).
* No inbound SMS (STOP/HELP) handling in this codebase: it relies on the SMS provider's built-in handling.
* Carrier application and payment events do not send notifications because the workflows do not produce them yet.
* The worker must be deployed and monitored; if it is down, messages wait (visible as `QUEUED` in the log).
* Business emails go only to verified addresses.

## Running the queue on Vercel (no always-on worker)

Vercel functions are not long-running, so `npm run worker` cannot run there. Three things cover it:

1. **Right after the request.** When a request queues an e-mail/SMS row, the API asks Vercel to keep the function alive after the response (`backend/src/utils/background.js`, `waitUntil`) and sends due rows then. The visitor never waits. This is a no-op outside Vercel and in tests.
2. **A free scheduler.** `.github/workflows/deliveries.yml` (GitHub Actions, every 5 minutes) or any free cron service (for example cron-job.org) calls `POST /api/v1/internal/deliveries/run` with `Authorization: Bearer <CRON_SECRET>`. This handles retries with backoff and anything missed.
3. **Vercel Cron** (`vercel.json`, once a day, the Hobby limit) as a last backstop; Vercel sends the `CRON_SECRET` itself.

The runner uses the same atomic claim rules as the worker, so overlapping calls never send a row twice. Without `CRON_SECRET` the endpoint answers 404. It returns counts only. On a server that does keep a process running, `npm run worker` still works unchanged. See `docs/VERCEL_ENV_VARIABLES.md` for the variables.
