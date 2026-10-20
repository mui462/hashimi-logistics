import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { MIME_EXTENSION } from './fileTypes.js';
import { StorageError } from './storageError.js';

/**
 * Development-only provider: files on this server's disk. It exists so the whole upload / preview / download flow can be
 * exercised without a cloud account, and it is refused when NODE_ENV=production (config/env.js). A server's disk is not
 * durable storage: use Cloudinary (or another provider) for anything real.
 *
 * Private files are served only through an HMAC-signed, expiring link created after the application's own authorization
 * check (see routes/storage.routes.js). Public website media is served from /storage/local/p/.
 */
const KEY = /^(public|private)\/[a-z0-9_-]{1,60}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

const signingKey = () => createHmac('sha256', env.JWT_SECRET).update('storage-local-access-v1').digest();
const b64 = (value) => Buffer.from(value).toString('base64url');

export function signAccessToken(payload) {
  const body = b64(JSON.stringify(payload));
  return `${body}.${createHmac('sha256', signingKey()).update(body).digest('base64url')}`;
}

export function verifyAccessToken(token) {
  const [body, signature] = String(token ?? '').split('.');
  if (!body || !signature) return null;
  const expected = createHmac('sha256', signingKey()).update(body).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload?.e > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

export const isLocalKey = (key) => KEY.test(String(key));
export const apiBase = () => env.API_PUBLIC_URL ?? `http://localhost:${env.PORT}`;

export function createLocalDriver({ directory = env.STORAGE_LOCAL_DIR } = {}) {
  const root = path.resolve(process.cwd(), directory);
  const fileFor = (key) => {
    if (!isLocalKey(key)) throw new StorageError('rejected', 'invalid key');
    const full = path.resolve(root, key);
    if (!full.startsWith(`${root}${path.sep}`)) throw new StorageError('rejected', 'invalid key');
    return full;
  };
  const wrap = async (fn) => {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof StorageError) throw error;
      if (error?.code === 'ENOENT') throw new StorageError('not_found', 'missing');
      throw new StorageError('unavailable', error?.code ?? 'disk error');
    }
  };

  return {
    name: 'local',
    root,
    async upload({ buffer, mimeType, folder, access }) {
      return wrap(async () => {
        const folderName = String(folder ?? 'general').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 60) || 'general';
        const storageKey = `${access === 'public' ? 'public' : 'private'}/${folderName}/${randomUUID()}.${MIME_EXTENSION[mimeType] ?? 'bin'}`;
        const target = fileFor(storageKey);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, buffer, { flag: 'wx' });
        await writeFile(`${target}.meta`, JSON.stringify({ mimeType }), 'utf8');
        return { storageKey, url: `${apiBase()}/api/v1/storage/local/${access === 'public' ? `p/${storageKey.replace(/^public\//, '')}` : `f/${storageKey}`}`, bytes: buffer.length };
      });
    },
    async delete(storageKey) {
      return wrap(async () => {
        const target = fileFor(storageKey);
        await rm(target, { force: true });
        await rm(`${target}.meta`, { force: true });
      });
    },
    async exists(storageKey) {
      return wrap(async () => {
        try { await stat(fileFor(storageKey)); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
      });
    },
    async getMetadata(storageKey) {
      return wrap(async () => {
        const target = fileFor(storageKey);
        try {
          const [info, meta] = await Promise.all([stat(target), readFile(`${target}.meta`, 'utf8').then(JSON.parse).catch(() => ({}))]);
          return { bytes: info.size, mimeType: meta.mimeType };
        } catch (error) {
          if (error?.code === 'ENOENT') return null;
          throw error;
        }
      });
    },
    async createSecureAccess(storageKey, { expiresInSeconds, disposition = 'attachment', fileName }) {
      return wrap(async () => {
        fileFor(storageKey);
        if (!(await this.exists(storageKey))) throw new StorageError('not_found', 'missing');
        const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
        const token = signAccessToken({ k: storageKey, e: Math.floor(expiresAt.getTime() / 1000), d: disposition, n: fileName ?? 'file' });
        return { url: `${apiBase()}/api/v1/storage/local/f/${token}`, expiresAt };
      });
    },
    /** Used by the file route only. */
    async read(storageKey) {
      return wrap(async () => {
        const target = fileFor(storageKey);
        await stat(target); // a missing file is a "not found", never a server error
        const meta = await readFile(`${target}.meta`, 'utf8').then(JSON.parse).catch(() => ({}));
        return { path: target, mimeType: meta.mimeType };
      });
    },
  };
}
