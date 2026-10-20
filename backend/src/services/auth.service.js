import crypto from 'node:crypto';
import { Carrier } from '../models/Carrier.js';
import { Customer } from '../models/Customer.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { ACCOUNT_TYPES } from '../utils/constants.js';
import { recordActivity } from './activity.service.js';
import { issueEmailVerification } from './emailVerification.service.js';
import { hashPassword, verifyPassword } from './password.service.js';
import { verifyAccessToken } from './token.service.js';

const CUSTOMER_PROFILE_FIELDS =
  'companyName contactPerson email phone address status createdAt';
const CARRIER_PROFILE_FIELDS =
  'companyName contactPerson email phone MCNumber DOTNumber address equipmentTypes operatingRegions ' +
  'crossBorderCapability authorityStatus complianceStatus status createdAt';

const PROFILE_MODELS = {
  [ACCOUNT_TYPES.CUSTOMER]: Customer,
  [ACCOUNT_TYPES.CARRIER]: Carrier,
};

/**
 * Creates the login identity plus its business profile. The role is decided here, by the server,
 * from which endpoint was called. MongoDB transactions are not available on a standalone server,
 * so if the profile cannot be created the new user is removed again.
 */
export async function registerAccount({ accountType, companyName, google, ...details }, context) {
  if (!PROFILE_MODELS[accountType]) {
    throw new Error(`Self-registration is not allowed for account type "${accountType}".`);
  }
  if (await User.exists({ email: details.email })) {
    throw ApiError.conflict('An account with this email address already exists.');
  }

  const user = await User.create({
    firstName: details.firstName,
    lastName: details.lastName,
    email: details.email,
    phone: details.phone,
    // A Google sign-up has no password of its own: the stored hash is of a random secret nobody knows (the person can set a
    // password later through the normal reset flow). Google has already verified the mailbox, so the email counts as verified.
    passwordHash: await hashPassword(google ? crypto.randomBytes(32).toString('base64url') : details.password),
    ...(google ? { googleSubject: google.subject } : {}),
    role: accountType,
    isActive: true,
    isEmailVerified: Boolean(google),
    lastLogin: new Date(),
  });

  let profile;
  try {
    profile = await PROFILE_MODELS[accountType].create({
      userId: user._id,
      companyName,
      contactPerson: user.fullName,
      phone: details.phone,
    });
  } catch (error) {
    await User.deleteOne({ _id: user._id });
    throw error;
  }

  await recordActivity({
    userId: user._id,
    action: 'auth.register',
    description: `New ${accountType} account registered.`,
    metadata: { accountType },
    context,
  });
  if (google) return { user, profile, verificationEmailSent: false };
  const verification = await issueEmailVerification(user, context);
  return { user, profile, verificationEmailSent: verification.delivered };
}

/**
 * Checks credentials for one portal. Every failure returns the same generic 401 so the response
 * never reveals whether the email exists. The password is compared before the account status is
 * revealed, so a deactivation notice is only shown to someone who knows the password.
 */
export async function authenticateUser({ email, password, allowedRoles, portal, context }) {
  const user = await User.findOne({ email }).select('+passwordHash +tokenVersion');
  const passwordMatches = await verifyPassword(password, user?.passwordHash);

  const failureReason = !user
    ? 'unknown_account'
    : !passwordMatches
      ? 'wrong_password'
      : !allowedRoles.includes(user.role)
        ? 'wrong_portal'
        : null;

  if (failureReason) {
    await recordActivity({
      userId: user?._id,
      action: 'auth.login.failed',
      description: 'Sign-in failed.',
      metadata: { portal, reason: failureReason },
      context,
    });
    throw ApiError.unauthorized('Invalid email or password.');
  }

  if (!user.isActive) {
    await recordActivity({
      userId: user._id,
      action: 'auth.login.failed',
      description: 'Sign-in blocked: account deactivated.',
      metadata: { portal, reason: 'account_deactivated' },
      context,
    });
    throw ApiError.forbidden('This account has been deactivated. Please contact support.');
  }

  user.lastLogin = new Date();
  await User.updateOne({ _id: user._id }, { lastLogin: user.lastLogin });
  await recordActivity({
    userId: user._id,
    action: 'auth.login.success',
    description: 'Signed in.',
    metadata: { portal },
    context,
  });
  return user;
}

/**
 * Signs in with a Google identity the server has already verified (see googleIdentity.service). The portal only narrows which
 * roles may use this page; the role is always the account's own. Google never creates an account here, never links to an
 * account whose email this site has not itself verified, and can never reach the Super Admin role.
 */
export async function authenticateWithGoogle({ identity, allowedRoles, portal, context }) {
  const refuse = async (userId, reason, error) => {
    await recordActivity({ userId, action: 'auth.login.failed', description: 'Google sign-in failed.', metadata: { portal, reason, method: 'google' }, context });
    throw error;
  };
  const notUsable = () => ApiError.unauthorized('This Google account cannot be used to sign in.');

  let user = await User.findOne({ googleSubject: identity.subject }).select('+tokenVersion');
  if (!user) {
    const byEmail = await User.findOne({ email: identity.email }).select('+tokenVersion +googleSubject');
    if (!byEmail) {
      return refuse(undefined, 'no_account', new ApiError(404, 'There is no account for this Google email yet. Please register first.', [], 'ACCOUNT_NOT_FOUND'));
    }
    if (!PROFILE_MODELS[byEmail.role] || byEmail.googleSubject) return refuse(byEmail._id, 'not_linkable', notUsable());
    if (!byEmail.isEmailVerified) {
      return refuse(byEmail._id, 'email_not_verified', new ApiError(403, 'Sign in with your email and password and confirm your email address before connecting Google.', [], 'EMAIL_NOT_VERIFIED'));
    }
    const linked = await User.updateOne({ _id: byEmail._id, googleSubject: { $exists: false } }, { googleSubject: identity.subject });
    if (linked.modifiedCount !== 1) return refuse(byEmail._id, 'link_race', notUsable());
    await recordActivity({ userId: byEmail._id, action: 'auth.google.linked', description: 'Google sign-in linked to this account.', metadata: { portal }, context });
    user = byEmail;
  }

  if (!PROFILE_MODELS[user.role]) return refuse(user._id, 'role_not_allowed', notUsable());
  if (!allowedRoles.includes(user.role)) {
    const label = user.role === ACCOUNT_TYPES.CARRIER ? 'Carrier' : 'Customer';
    return refuse(user._id, 'wrong_portal', new ApiError(403, 'This Google account is registered as a ' + label.toLowerCase() + '. Please use the ' + label + ' Login instead.', [], 'WRONG_PORTAL'));
  }
  if (!user.isActive) return refuse(user._id, 'account_deactivated', ApiError.forbidden('This account has been deactivated. Please contact support.'));

  await User.updateOne({ _id: user._id }, { lastLogin: new Date() });
  await recordActivity({ userId: user._id, action: 'auth.login.success', description: 'Signed in with Google.', metadata: { portal, method: 'google' }, context });
  return user;
}

/**
 * Ends the session for real: the cookie is cleared by the controller, and the token version is
 * bumped so the old token stops working even if someone copied it. This signs the user out on
 * every device. The version check means a stale or foreign token cannot revoke anything.
 */
export async function endSession(token, context) {
  if (!token) return;

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return;
  }

  const result = await User.updateOne(
    { _id: payload.userId, tokenVersion: payload.tokenVersion },
    { $inc: { tokenVersion: 1 } }
  );
  if (result.modifiedCount === 1) {
    await recordActivity({
      userId: payload.userId,
      action: 'auth.logout',
      description: 'Signed out. All sessions were ended.',
      context,
    });
  }
}

/** The signed-in user's safe profile for /auth/me and registration responses. */
export async function loadProfile(user) {
  const Model = PROFILE_MODELS[user.role];
  if (!Model) return null;

  const fields = user.role === ACCOUNT_TYPES.CUSTOMER ? CUSTOMER_PROFILE_FIELDS : CARRIER_PROFILE_FIELDS;
  return Model.findOne({ userId: user._id }).active().select(fields);
}
