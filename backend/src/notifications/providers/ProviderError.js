/**
 * Every provider failure is turned into one of these. `temporary` decides whether the worker retries (network trouble,
 * timeouts, 429, 5xx) or stops at once (bad address, rejected credentials, malformed request). `safeMessage` is the only
 * text that is ever stored or logged: it never contains provider response bodies, keys or addresses.
 */
export class ProviderError extends Error {
  constructor(code, safeMessage, { temporary = false } = {}) {
    super(safeMessage);
    this.name = 'ProviderError';
    this.code = code;
    this.temporary = temporary;
  }
}

export function fromHttpStatus(status) {
  if (status === 429 || status >= 500) return new ProviderError(`http_${status}`, `Provider returned HTTP ${status}.`, { temporary: true });
  if (status === 401 || status === 403) return new ProviderError(`http_${status}`, 'Provider rejected the credentials.', { temporary: false });
  return new ProviderError(`http_${status}`, `Provider rejected the message (HTTP ${status}).`, { temporary: false });
}

export function fromNetworkError(error) {
  const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
  return new ProviderError(timedOut ? 'timeout' : 'network', timedOut ? 'Provider request timed out.' : 'Could not reach the provider.', { temporary: true });
}

const MESSAGES = {
  timeout: 'Provider request timed out.',
  network: 'Could not reach the provider.',
  no_message_id: 'Provider accepted the request but returned no message id.',
};

/**
 * The only text ever stored in lastError or logged for a provider failure. It is built from the error code alone, never
 * from free text, so a provider response body, key, address or number cannot end up in the database or the log.
 */
export function sanitizeError(error) {
  if (!(error instanceof ProviderError)) return 'unexpected_error: Delivery failed unexpectedly.';
  const code = /^[a-z0-9_]{1,30}$/.test(error.code) ? error.code : 'provider_error';
  const http = /^http_(\d{3})$/.exec(code);
  const message = MESSAGES[code] ?? (http ? (['401', '403'].includes(http[1]) ? 'Provider rejected the credentials.' : `Provider returned HTTP ${http[1]}.`) : 'Provider error.');
  return `${code}: ${message}`;
}
