import { ProviderError, fromHttpStatus, fromNetworkError } from './ProviderError.js';

/** Twilio Messages API over HTTPS (no SDK dependency). */
export function createTwilioProvider({ accountSid, authToken, fromNumber, fetchImpl = fetch, timeoutMs = 10000 }) {
  return {
    name: 'twilio',
    async send({ to, body }) {
      let response;
      try {
        response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: to, From: fromNumber, Body: body }).toString(),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw fromNetworkError(error);
      }
      if (!response.ok) throw fromHttpStatus(response.status);
      const data = await response.json().catch(() => ({}));
      if (!data?.sid) throw new ProviderError('no_message_id', 'Provider accepted the request but returned no message id.', { temporary: true });
      return { providerMessageId: String(data.sid) };
    },
  };
}
