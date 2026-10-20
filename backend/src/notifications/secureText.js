import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

/** AES-256-GCM with a key derived (HKDF) from JWT_SECRET for this one purpose. Used only for queued one-time links. */
const key = () => Buffer.from(hkdfSync('sha256', env.JWT_SECRET, 'hashimi-delivery', 'securePayload-v1', 32));

export function seal(object) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(object), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url')).join('.');
}

export function open(sealed) {
  const [iv, tag, data] = String(sealed).split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
}
