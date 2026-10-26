# Vercel environment variables (free-tier setup)

Set these in Vercel: Project > Settings > Environment Variables, for the **Production** environment (add Preview too if you want preview deployments to work). Redeploy after changing them. Never put a secret in a `VITE_*` variable (those are public). Never commit real values.

The site and the API run in one Vercel project on one domain (`vercel.json` rewrites `/api/*` to the API function), so the sign-in cookie is same-site and `VITE_API_URL` is not needed.

## 1. Required

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `MONGO_URI` | `mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/hashimi_logistics?retryWrites=true&w=majority` | MongoDB Atlas M0 (free). Create a database user limited to this database. In Atlas > Network Access allow `0.0.0.0/0` (Vercel has no fixed IP). |
| `JWT_SECRET` | 48+ random characters | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `CLIENT_URL` | `https://www.yourdomain.com` | Exact site origin, `https://`, no trailing slash. Until the domain is connected use the `https://<project>.vercel.app` address. Used for CORS, the origin check, e-mail links and the sitemap. |
| `VITE_SITE_URL` | same as `CLIENT_URL` | Build-time. Written into canonical tags and the prerendered pages. Redeploy after the domain changes. |

## 2. Files and images (Cloudinary free plan)

| Variable | Value |
|---|---|
| `STORAGE_PROVIDER` | `cloudinary` |
| `CLOUDINARY_CLOUD_NAME` | from the Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | from the Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | from the Cloudinary dashboard |

`local` storage is refused in production.

## 3. E-mail (Resend free plan)

First add your domain in Resend and create the DNS records it shows (SPF, DKIM) at Porkbun, then wait for "Verified".

| Variable | Value |
|---|---|
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | from Resend |
| `EMAIL_FROM` | `no-reply@yourdomain.com` (on the verified domain) |
| `EMAIL_REPLY_TO` | an inbox you read, for example `info@yourdomain.com` |

## 4. Delivery queue (free scheduler)

| Variable | Value |
|---|---|
| `CRON_SECRET` | 32+ random characters (generate like `JWT_SECRET`) |

Also add two **GitHub repository secrets** (Settings > Secrets and variables > Actions): `APP_URL` (`https://www.yourdomain.com`) and `CRON_SECRET` (the same value). The workflow `.github/workflows/deliveries.yml` then calls the runner every 5 minutes. Vercel Cron (once a day, the Hobby limit) is a backup and authenticates itself with the same `CRON_SECRET`. E-mail and SMS are also sent right after the request that created them.

## 5. AI chat assistant (free)

| Variable | Value |
|---|---|
| `CHATBOT_PROVIDER` | `openai` |
| `CHAT_API_BASE_URL` | Gemini: `https://generativelanguage.googleapis.com/v1beta/openai`, Groq: `https://api.groq.com/openai/v1` |
| `CHAT_API_KEY` | key from Google AI Studio (aistudio.google.com) or console.groq.com |
| `CHAT_API_MODEL` | a free model from the provider's current list |

Optional: `CHATBOT_RATE_LIMIT_MAX` (default 20 per 10 minutes per IP), `CHATBOT_DAILY_LIMIT_MAX` (default 150 per day per IP), `CHAT_API_TIMEOUT_MS` (default 30000). Lower the daily limit if the free allowance runs out.

## 6. SMS (optional, paid: Twilio has no free plan)

Leave these unset to keep SMS off. Only set them when the client approves the cost and the consent requirements (and US A2P 10DLC registration) are met.

| Variable | Value |
|---|---|
| `SMS_PROVIDER` | `twilio` |
| `TWILIO_ACCOUNT_SID` | from Twilio |
| `TWILIO_AUTH_TOKEN` | from Twilio |
| `TWILIO_FROM_NUMBER` | your Twilio number, `+1...` |

## 7. Optional

| Variable | Value | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `123-abc.apps.googleusercontent.com` | Only for Google sign-in (`docs/GOOGLE_SIGN_IN.md`). Add the site origin to the client's authorised JavaScript origins. |
| `VITE_OG_IMAGE` | `https://.../share.jpg` | Public image for link previews (1200x630). Build-time. |
| `TRUST_PROXY_HOPS` | `1` (default) | Leave as is on Vercel. |

## 8. Do NOT set in production

`DEV_LOG_AUTH_LINKS` (must be false), `ENFORCE_HTTPS=false`, `STORAGE_PROVIDER=local`, `EMAIL_PROVIDER=mock`, `COOKIE_SAME_SITE=none`, `OLLAMA_*` (the assistant uses the hosted engine above), `PORT`, and `VITE_API_URL` (the default `/api/v1` is correct on one domain).

## 9. One-time steps (not variables)

1. Initialise the database once from your computer with the Atlas string: `cd backend && npm run db:init`.
2. Create the single Super Admin once: set `SUPER_ADMIN_FIRST_NAME`, `SUPER_ADMIN_LAST_NAME`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` in your local shell only (not on Vercel), run `npm run seed:super-admin`, then clear them.
3. After the domain is live: Search Console > add the domain, verify with the DNS TXT record, submit `https://www.yourdomain.com/sitemap.xml`.
