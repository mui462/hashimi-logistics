import { env } from '../../config/env.js';
import { createMockProvider } from './mock.provider.js';
import { createResendProvider } from './email.resend.js';
import { createTwilioProvider } from './sms.twilio.js';

let emailCached;
let smsCached;
let emailOverride;
let smsOverride;

function resolveEmail() {
  if (env.EMAIL_PROVIDER === 'resend') return createResendProvider({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM, replyTo: env.EMAIL_REPLY_TO });
  if (env.EMAIL_PROVIDER === 'mock') return createMockProvider({ name: 'mock-email' });
  return null;
}
function resolveSms() {
  if (env.SMS_PROVIDER === 'twilio') return createTwilioProvider({ accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN, fromNumber: env.TWILIO_FROM_NUMBER });
  if (env.SMS_PROVIDER === 'mock') return createMockProvider({ name: 'mock-sms' });
  return null;
}

/** null when no email provider is configured: nothing is sent and callers must not claim otherwise. */
export function getEmailProvider() {
  if (emailOverride !== undefined) return emailOverride;
  if (emailCached === undefined) emailCached = resolveEmail();
  return emailCached;
}
export function getSmsProvider() {
  if (smsOverride !== undefined) return smsOverride;
  if (smsCached === undefined) smsCached = resolveSms();
  return smsCached;
}

/** Tests only. Pass undefined to go back to the environment-configured provider. */
export function setEmailProviderForTests(provider) { emailOverride = provider; }
export function setSmsProviderForTests(provider) { smsOverride = provider; }

/** Safe to return from an API: provider names only, never keys, senders or numbers. */
export function getDeliveryStatus() {
  return { email: { configured: Boolean(getEmailProvider()), provider: getEmailProvider()?.name ?? null }, sms: { configured: Boolean(getSmsProvider()), provider: getSmsProvider()?.name ?? null } };
}
