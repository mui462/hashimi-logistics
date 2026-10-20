import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { resolvePhone } from './delivery.service.js';
import { getDeliveryStatus } from './providers/index.js';

const DEFAULTS = { emailNotifications: true, smsNotifications: false, quoteNotifications: true, shipmentNotifications: true, documentNotifications: true };

async function present(userId) {
  const user = await User.findById(userId).select('role phone notificationPreferences').lean();
  const stored = user?.notificationPreferences ?? {};
  const status = getDeliveryStatus();
  return {
    preferences: Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, stored[key] ?? DEFAULTS[key]])),
    channels: {
      emailAvailable: status.email.configured,
      smsAvailable: status.sms.configured,
      smsPhoneOnFile: Boolean(user && (await resolvePhone(user))),
    },
    securityEmailsAlwaysSent: true,
  };
}

export const getPreferences = (userId) => present(userId);

/**
 * Updates only the signed-in user's own notification flags. The id always comes from the session, the body schema is strict
 * (so a role or any other field is rejected before this runs), and preferences only ever reduce what is sent: they never
 * widen who may see a record. Security emails ignore them.
 */
export async function updatePreferences(userId, changes) {
  if (changes.smsNotifications === true) {
    const user = await User.findById(userId).select('role phone').lean();
    if (!(await resolvePhone(user))) {
      throw ApiError.validation([{ field: 'smsNotifications', message: 'Add a valid mobile number to your profile before turning on text messages.' }]);
    }
  }
  const set = Object.fromEntries(Object.entries(changes).map(([key, value]) => [`notificationPreferences.${key}`, value]));
  await User.updateOne({ _id: userId }, { $set: set });
  return present(userId);
}
