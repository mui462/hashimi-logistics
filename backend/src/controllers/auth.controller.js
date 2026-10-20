import { env } from '../config/env.js';
import { requestContext } from '../services/activity.service.js';
import { authenticateUser, authenticateWithGoogle, endSession, loadProfile, registerAccount } from '../services/auth.service.js';
import { googleSignInConfigured, verifyGoogleCredential } from '../services/googleIdentity.service.js';
import { signAccessToken } from '../services/token.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { clearAuthCookie, setAuthCookie } from '../utils/authCookie.js';
import { ACCOUNT_TYPES } from '../utils/constants.js';

const PORTAL_ROLES = [ACCOUNT_TYPES.CUSTOMER, ACCOUNT_TYPES.CARRIER];
const ADMIN_ROLES = [ACCOUNT_TYPES.SUPER_ADMIN];

async function respondWithSession(res, user, { statusCode = 200, message, extra = {} }) {
  const { token, expiresAt } = signAccessToken(user);
  setAuthCookie(res, token, expiresAt);
  const profile = await loadProfile(user);
  sendSuccess(res, { statusCode, message, data: { user, profile, ...extra } });
}

const registerAs = (accountType) => async (req, res) => {
  const { user, verificationEmailSent } = await registerAccount(
    { ...req.validated.body, accountType },
    requestContext(req)
  );
  await respondWithSession(res, user, {
    statusCode: 201,
    message: verificationEmailSent
      ? 'Your account has been created. A confirmation email has been queued for sending. Check your inbox shortly.'
      : 'Your account has been created. Email confirmation is not available because email delivery is not configured.',
    extra: { verificationEmailSent },
  });
};

export const registerCustomer = registerAs(ACCOUNT_TYPES.CUSTOMER);
export const registerCarrier = registerAs(ACCOUNT_TYPES.CARRIER);

const loginTo = (allowedRoles, portal) => async (req, res) => {
  const { portal: requestedPortal, ...credentials } = req.validated.body;
  const user = await authenticateUser({
    ...credentials,
    // On the shared sign-in page the chosen portal narrows the roles; it never widens them and never selects a role.
    allowedRoles: allowedRoles === PORTAL_ROLES && requestedPortal ? [requestedPortal] : allowedRoles,
    portal,
    context: requestContext(req),
  });
  await respondWithSession(res, user, { message: 'Signed in successfully.' });
};

export const login = loginTo(PORTAL_ROLES, 'portal');
export const adminLogin = loginTo(ADMIN_ROLES, 'admin');

export async function logout(req, res) {
  await endSession(req.cookies?.[env.COOKIE_NAME], requestContext(req));
  clearAuthCookie(res);
  sendSuccess(res, { message: 'Signed out successfully.' });
}

export async function getCurrentUser(req, res) {
  const profile = await loadProfile(req.user);
  sendSuccess(res, { data: { user: req.user, profile } });
}

/** Public, non-secret: whether Google Sign-In is configured, and the OAuth client ID the browser button needs. */
export function googleConfig(_req, res) {
  const enabled = googleSignInConfigured();
  sendSuccess(res, { data: { enabled, clientId: enabled ? env.GOOGLE_CLIENT_ID : null } });
}

export async function googleLogin(req, res) {
  const { credential, portal } = req.validated.body;
  const identity = await verifyGoogleCredential(credential);
  const user = await authenticateWithGoogle({ identity, allowedRoles: [portal], portal, context: requestContext(req) });
  await respondWithSession(res, user, { message: 'Signed in successfully.' });
}

const googleRegisterAs = (accountType) => async (req, res) => {
  const { credential, ...details } = req.validated.body;
  const identity = await verifyGoogleCredential(credential);
  const { user } = await registerAccount(
    {
      ...details,
      accountType,
      email: identity.email,
      firstName: identity.givenName || identity.name.split(' ')[0] || identity.email.split('@')[0],
      lastName: identity.familyName || identity.name.split(' ').slice(1).join(' ') || 'Contact',
      google: { subject: identity.subject },
    },
    requestContext(req)
  );
  await respondWithSession(res, user, { statusCode: 201, message: 'Your account has been created with Google.' });
};

export const googleRegisterCustomer = googleRegisterAs(ACCOUNT_TYPES.CUSTOMER);
export const googleRegisterCarrier = googleRegisterAs(ACCOUNT_TYPES.CARRIER);
