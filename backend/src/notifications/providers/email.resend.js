import { ProviderError, fromHttpStatus, fromNetworkError } from './ProviderError.js';

/** Resend over HTTPS (no SDK dependency). SENT only means Resend accepted the message; its id is stored as providerMessageId. */
export function createResendProvider({ apiKey, from, replyTo, fetchImpl = fetch, timeoutMs = 10000 }) {
  return {
    name: 'resend',
    async send({ to, subject, text, html }) {
      let response;
      try {
        response = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [to], subject, text, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw fromNetworkError(error);
      }
      if (!response.ok) throw fromHttpStatus(response.status);
      const body = await response.json().catch(() => ({}));
      if (!body?.id) throw new ProviderError('no_message_id', 'Provider accepted the request but returned no message id.', { temporary: true });
      return { providerMessageId: String(body.id) };
    },
  };
}
