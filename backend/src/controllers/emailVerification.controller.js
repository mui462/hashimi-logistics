import { requestContext } from '../services/activity.service.js';
import { resendEmailVerification, verifyEmail as confirmEmail } from '../services/emailVerification.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function verifyEmail(req, res) {
  await confirmEmail(req.validated.body.token, requestContext(req));
  sendSuccess(res, { message: 'Your email address has been confirmed.' });
}

export async function resendVerification(req, res) {
  const { alreadyVerified, delivered } = await resendEmailVerification(req.user, requestContext(req));

  const message = alreadyVerified
    ? 'Your email address is already confirmed.'
    : delivered
      ? 'A new confirmation email has been queued for sending.'
      : 'Email delivery is not configured, so no confirmation email was sent.';
  sendSuccess(res, { message, data: { alreadyVerified, delivered } });
}
