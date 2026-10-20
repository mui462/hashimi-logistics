import { randomBytes, randomUUID } from 'node:crypto';
import { MIME_EXTENSION } from './fileTypes.js';
import { StorageError } from './storageError.js';

/**
 * In-memory provider for automated tests (and nothing else): no network, no disk. It records every call so tests can verify
 * what was uploaded, can be told to fail the next call, and issues expiring access links like a real provider.
 */
export function createMemoryDriver({ name = 'memory' } = {}) {
  const objects = new Map();
  const calls = [];
  const failures = new Map();
  const maybeFail = (operation) => {
    const mode = failures.get(operation);
    if (!mode) return;
    if (mode.times <= 1) failures.delete(operation); else mode.times -= 1;
    throw new StorageError(mode.code, `memory driver forced ${operation} failure: SECRET-PROVIDER-DETAIL`);
  };

  return {
    name,
    objects,
    calls,
    failNext(operation, { code = 'unavailable', times = 1 } = {}) { failures.set(operation, { code, times }); },
    reset() { objects.clear(); calls.length = 0; failures.clear(); },

    async upload({ buffer, mimeType, folder, access, fileName }) {
      calls.push({ operation: 'upload', mimeType, folder, access, fileName, size: buffer.length });
      maybeFail('upload');
      const storageKey = `${access}/${folder}/${randomUUID()}.${MIME_EXTENSION[mimeType] ?? 'bin'}`;
      objects.set(storageKey, { buffer: Buffer.from(buffer), mimeType, access });
      return { storageKey, url: `https://storage.test/${storageKey}`, bytes: buffer.length };
    },
    async delete(storageKey) {
      calls.push({ operation: 'delete', storageKey });
      maybeFail('delete');
      objects.delete(storageKey);
    },
    async exists(storageKey) {
      calls.push({ operation: 'exists', storageKey });
      maybeFail('exists');
      return objects.has(storageKey);
    },
    async getMetadata(storageKey) {
      calls.push({ operation: 'getMetadata', storageKey });
      maybeFail('getMetadata');
      const object = objects.get(storageKey);
      return object ? { bytes: object.buffer.length, mimeType: object.mimeType } : null;
    },
    async createSecureAccess(storageKey, { expiresInSeconds, disposition = 'attachment', fileName }) {
      calls.push({ operation: 'createSecureAccess', storageKey, expiresInSeconds, disposition, fileName });
      maybeFail('createSecureAccess');
      if (!objects.has(storageKey)) throw new StorageError('not_found', 'missing');
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
      return { url: `https://storage.test/secure/${randomBytes(8).toString('hex')}?expires=${Math.floor(expiresAt.getTime() / 1000)}&disposition=${disposition}`, expiresAt };
    },
  };
}
