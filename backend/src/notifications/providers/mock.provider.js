import { randomUUID } from 'node:crypto';
import { ProviderError } from './ProviderError.js';

/**
 * Records every message in memory and sends nothing. Used by automated tests, and by `*_PROVIDER=mock` in development to
 * exercise the whole pipeline without credentials. It can be told to fail so retry behaviour can be tested.
 */
export function createMockProvider({ name = 'mock' } = {}) {
  const calls = [];
  const failures = [];
  return {
    name,
    calls,
    failNext({ temporary = true, times = 1, code = temporary ? 'http_503' : 'http_400' } = {}) {
      for (let i = 0; i < times; i += 1) failures.push({ temporary, code });
    },
    reset() { calls.length = 0; failures.length = 0; },
    async send(message) {
      calls.push({ ...message });
      const failure = failures.shift();
      if (failure) throw new ProviderError(failure.code, 'Mock provider forced failure (SECRET-PROVIDER-DETAIL FAKE-SECRET-KEY-abcdefghijklmnopqrstuvwxyz).', { temporary: failure.temporary });
      return { providerMessageId: `mock_${randomUUID()}` };
    },
  };
}
