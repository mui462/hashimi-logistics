import { Router } from 'express';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { getStorageDriver } from '../storage/index.js';
import { isLocalKey, verifyAccessToken } from '../storage/local.driver.js';

/**
 * Serves files for the development-only `local` storage provider. This router does nothing when another provider (or none)
 * is configured. Private files need an expiring, signed link that only the authorized document endpoints create; there is
 * no way to ask for a file by path. Public website media is served without a token from the public/ area only.
 */
const router = Router();

const localDriver = () => {
  const driver = getStorageDriver();
  return driver?.name === 'local' ? driver : null;
};

const asciiName = (name) => String(name ?? 'file').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');

function baseHeaders(res) {
  // The API is JSON-only (helmet denies framing). Files are the exception: the website and admin app embed images and PDFs.
  res.removeHeader('X-Frame-Options');
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': `default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors ${env.CLIENT_URL}`,
  });
}

router.get('/f/:token', async (req, res) => {
  const driver = localDriver();
  const payload = driver && verifyAccessToken(req.params.token);
  if (!payload || !isLocalKey(payload.k) || !payload.k.startsWith('private/')) throw ApiError.notFound('This link is invalid or has expired.', 'LINK_EXPIRED');
  const file = await driver.read(payload.k).catch(() => null);
  if (!file) throw ApiError.notFound('This link is invalid or has expired.', 'LINK_EXPIRED');
  baseHeaders(res);
  res.set({
    'Cache-Control': 'private, no-store',
    'Content-Disposition': `${payload.d === 'inline' ? 'inline' : 'attachment'}; filename="${asciiName(payload.n)}"; filename*=UTF-8''${encodeURIComponent(payload.n ?? 'file')}`,
  });
  if (file.mimeType) res.type(file.mimeType);
  res.sendFile(file.path, { dotfiles: 'allow', cacheControl: false, headers: { 'Cache-Control': 'private, no-store' } });
});

router.get('/p/:folder/:file', async (req, res) => {
  const driver = localDriver();
  const key = `public/${req.params.folder}/${req.params.file}`;
  if (!driver || !isLocalKey(key)) throw ApiError.notFound();
  const file = await driver.read(key).catch(() => null);
  if (!file) throw ApiError.notFound();
  baseHeaders(res);
  if (file.mimeType) res.type(file.mimeType);
  res.sendFile(file.path, { dotfiles: 'allow', cacheControl: false, headers: { 'Cache-Control': 'public, max-age=3600' } });
});

export default router;
