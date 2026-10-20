import { ApiRequestError } from '../utils/apiRequestError';
import { apiClient } from './apiClient';

// The public website's only door to the CMS: GET /content/*. Responses are cached for a short time and identical requests
// that are in flight share one call, so a homepage with several consumers still makes one request. The server marks the same
// responses cacheable for about 30 seconds, and nothing here is ever sent a credential.
const TTL_MS = 30_000;
const cache = new Map();
const pending = new Map();

export const contentKey = (path, params) => `${path}?${params ? JSON.stringify(params) : ''}`;
export const clearContentCache = () => {
  cache.clear();
  pending.clear();
};
export function peekContent(key) {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < TTL_MS ? hit.data : undefined;
}

export function fetchContent(path, params) {
  const key = contentKey(path, params);
  const hit = peekContent(key);
  if (hit !== undefined) return Promise.resolve(hit);
  if (pending.has(key)) return pending.get(key);
  const request = apiClient
    .get(`/content${path}`, { params })
    .then((response) => {
      cache.set(key, { at: Date.now(), data: response.data.data });
      return response.data.data;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

/** Resolves null for "no such record" (404) so callers can fall back; every other failure still throws. */
export async function fetchContentOrNull(path, params) {
  try {
    return await fetchContent(path, params);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      cache.set(contentKey(path, params), { at: Date.now(), data: null });
      return null;
    }
    throw error;
  }
}
