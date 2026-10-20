import { Router } from 'express';
import { createNotificationLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getPreferences, updatePreferences } from './preferences.service.js';
import { emptyPreferencesQuery, updatePreferencesSchema } from './notifications.validator.js';

/** Mounted under /customer, /carrier and /admin at /notification-preferences. Always acts on the signed-in user only. */
const router = Router();
const userId = (req) => req.user._id;

router.get('/', createNotificationLimiter(), validate(emptyPreferencesQuery), async (req, res) => {
  sendSuccess(res, { data: await getPreferences(userId(req)) });
});
router.put('/', createNotificationLimiter(), validate(updatePreferencesSchema), async (req, res) => {
  sendSuccess(res, { message: 'Notification settings saved.', data: await updatePreferences(userId(req), req.validated.body) });
});

export default router;
