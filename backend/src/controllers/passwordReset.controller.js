import { requestContext } from '../services/activity.service.js';
import { isEmailConfigured } from '../services/email.service.js';
import { requestPasswordReset, resetPassword as completePasswordReset } from '../services/passwordReset.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { clearAuthCookie } from '../utils/authCookie.js';

export async function forgotPassword(req, res) {
  await requestPasswordReset(req.validated.body.email, requestContext(req));

  // The wording depends only on server configuration, never on whether the account exists.
  const emailAvailable = isEmailConfigured();
  sendSuccess(res, {
    message: emailAvailable
      ? 'If an account exists for that email address, a password reset message will be sent.'
      : 'Password reset email is not available yet because email delivery is not configured. No email was sent.',
    data: { emailDeliveryAvailable: emailAvailable },
  });
}

export async function resetPassword(req, res) {
  await completePasswordReset(req.validated.body, requestContext(req));
  clearAuthCookie(res);
  sendSuccess(res, { message: 'Your password has been changed. Please sign in with your new password.' });
}
