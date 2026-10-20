import { createHash, randomUUID } from 'node:crypto';
import { MIME_EXTENSION } from './fileTypes.js';
import { StorageError } from './storageError.js';

/**
 * Cloudinary provider over its documented REST API (signed requests, no SDK, so nothing else in the application depends
 * on Cloudinary). Public website media uses delivery type "upload"; private documents use "authenticated", which cannot be
 * fetched without a server-signed, expiring request created by createSecureAccess().
 *
 * storageKey = `${resourceType}:${deliveryType}:${publicId}`. The API secret never leaves this file.
 *
 * NOT verified against a live Cloudinary account in this project (no credentials were available): the request shapes follow
 * Cloudinary's Upload, Admin and private-download API documentation and are covered by mock-fetch tests only.
 */
const TIMEOUT_MS = 120_000;

export function createCloudinaryDriver({ cloudName, apiKey, apiSecret, fetchImpl = globalThis.fetch, now = () => Date.now() }) {
  const api = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}`;

  const sign = (params) => {
    const text = Object.keys(params).filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '').sort().map((key) => `${key}=${params[key]}`).join('&');
    return createHash('sha1').update(`${text}${apiSecret}`).digest('hex');
  };
  const parseKey = (storageKey) => {
    const [resourceType, deliveryType, ...rest] = String(storageKey).split(':');
    const publicId = rest.join(':');
    if (!['image', 'video', 'raw'].includes(resourceType) || !['upload', 'authenticated'].includes(deliveryType) || !publicId) throw new StorageError('rejected', 'invalid key');
    return { resourceType, deliveryType, publicId };
  };
  const call = async (url, init) => {
    let response;
    try {
      response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new StorageError('unavailable', 'network');
    }
    return response;
  };
  const resourceTypeFor = (mimeType) => (mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('video/') ? 'video' : 'raw');

  return {
    name: 'cloudinary',

    async upload({ buffer, mimeType, folder, access, fileName }) {
      const resourceType = resourceTypeFor(mimeType);
      const deliveryType = access === 'public' ? 'upload' : 'authenticated';
      const extension = resourceType === 'raw' ? `.${(fileName?.split('.').pop() ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)}` : '';
      const publicId = `hashimi/${access === 'public' ? 'public' : 'private'}/${String(folder ?? 'general').replace(/[^a-z0-9_-]/gi, '-').slice(0, 60)}/${randomUUID()}${extension}`;
      const timestamp = Math.floor(now() / 1000);
      const signed = { public_id: publicId, type: deliveryType, timestamp, overwrite: 'false' };
      const form = new FormData();
      for (const [key, value] of Object.entries({ ...signed, api_key: apiKey, signature: sign(signed) })) form.append(key, String(value));
      form.append('file', new Blob([buffer], { type: mimeType }), 'upload');
      const response = await call(`${api}/${resourceType}/upload`, { method: 'POST', body: form });
      if (!response.ok) throw new StorageError(response.status >= 500 || response.status === 429 ? 'unavailable' : 'rejected', `upload ${response.status}`);
      const result = await response.json().catch(() => null);
      if (!result?.public_id || !result?.secure_url) throw new StorageError('upload_failed', 'unexpected response');
      return {
        storageKey: `${resourceType}:${deliveryType}:${result.public_id}`,
        url: result.secure_url,
        bytes: result.bytes,
        ...(result.width ? { width: result.width } : {}),
        ...(result.height ? { height: result.height } : {}),
        ...(result.duration ? { duration: result.duration } : {}),
      };
    },

    async delete(storageKey) {
      const { resourceType, deliveryType, publicId } = parseKey(storageKey);
      const signed = { public_id: publicId, type: deliveryType, invalidate: 'true', timestamp: Math.floor(now() / 1000) };
      const body = new URLSearchParams({ ...signed, api_key: apiKey, signature: sign(signed) });
      const response = await call(`${api}/${resourceType}/destroy`, { method: 'POST', body });
      if (!response.ok) throw new StorageError(response.status >= 500 ? 'unavailable' : 'rejected', `destroy ${response.status}`);
    },

    async getMetadata(storageKey) {
      const { resourceType, deliveryType, publicId } = parseKey(storageKey);
      const response = await call(`${api}/resources/${resourceType}/${deliveryType}/${publicId.split('/').map(encodeURIComponent).join('/')}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}` },
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new StorageError('unavailable', `resource ${response.status}`);
      const result = await response.json().catch(() => ({}));
      return { bytes: result.bytes, width: result.width, height: result.height, duration: result.duration };
    },

    async exists(storageKey) {
      return (await this.getMetadata(storageKey)) !== null;
    },

    /** A signed, expiring download link (Cloudinary "private download URL"). Created per request, never stored. */
    async createSecureAccess(storageKey, { expiresInSeconds, disposition = 'attachment', mimeType }) {
      const { resourceType, deliveryType, publicId } = parseKey(storageKey);
      if (deliveryType === 'upload') throw new StorageError('rejected', 'public files do not use secure links');
      const nowSeconds = Math.floor(now() / 1000);
      const expiresAt = new Date((nowSeconds + expiresInSeconds) * 1000);
      const signed = {
        public_id: publicId,
        // Images and video are stored without an extension in their public id, so the format is part of the signed request.
        format: resourceType === 'raw' ? undefined : MIME_EXTENSION[mimeType],
        type: deliveryType,
        attachment: disposition === 'attachment' ? 'true' : undefined,
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        timestamp: nowSeconds,
      };
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries({ ...signed, api_key: apiKey, signature: sign(signed) })) if (value !== undefined) query.append(key, String(value));
      return { url: `${api}/${resourceType}/download?${query.toString()}`, expiresAt };
    },
  };
}
