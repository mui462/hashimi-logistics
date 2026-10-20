# Google Sign-In (customers and carriers)

Status: **implemented, configuration pending.** Automated tests use a mocked Google provider; no real Google round trip has been run.

## What the owner must configure

1. In Google Cloud Console create an **OAuth 2.0 Client ID** of type **Web application**.
2. Under **Authorized JavaScript origins** add the site origin(s), for example `https://www.your-domain.com` and, for development, `http://localhost:5173`. No redirect URI is needed: the button uses Google Identity Services in popup mode and returns a signed ID token to the page.
3. Set one backend environment variable (backend `.env` or the host's settings; this change does not edit any `.env`):

   | Variable | Value |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | the client ID, `<digits>-<id>.apps.googleusercontent.com` |

   There is **no client secret**: the server verifies the ID token's RS256 signature against Google's public keys, plus issuer, audience (`GOOGLE_CLIENT_ID`), expiry and `email_verified`. The browser learns the public client ID from `GET /api/v1/auth/google/config`; until the variable is set the buttons show as disabled with an explanation.

## How it behaves

- `POST /auth/google/login` `{ credential, portal: customer | carrier }`: signs in an existing account. It never creates one (404 `ACCOUNT_NOT_FOUND`, the page links to registration).
- `POST /auth/google/register/customer|carrier` `{ credential, companyName, phone? }`: creates the account. The role comes from the endpoint, never the body. A carrier still starts `pending` for authority, compliance and status, exactly like a password registration.
- The Google email counts as verified for accounts created this way. They have no usable password (a random secret is stored) and can set one through the normal reset flow.
- An existing password account is linked to Google only if its email was already verified on this site, it is a customer or carrier, and it has no Google link yet. Unverified accounts, accounts linked to another Google identity, and the Super Admin are never linked or signed in through Google.
- A Google account whose role does not match the portal is refused (403 `WRONG_PORTAL`); roles are never switched.
- `portal` on password sign-in (`POST /auth/login`) is optional and only narrows who may sign in on that page. A wrong portal returns the same generic 401 as a wrong password.
