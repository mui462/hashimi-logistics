import { env } from '../config/env.js';
import { createCloudinaryDriver } from './cloudinary.driver.js';
import { createLocalDriver } from './local.driver.js';
import { STORAGE_NOT_CONFIGURED_MESSAGE, storageNotConfigured, toApiError } from './storageError.js';

/**
 * The storage service: the only thing the rest of the application imports. Controllers and services never touch a
 * provider SDK or URL scheme, so another provider (S3, GCS ...) is one new driver file plus a line in resolveDriver().
 *
 * A driver implements:
 *   upload({ buffer, mimeType, fileName, folder, access: 'public' | 'private' })
 *       -> { storageKey, url, bytes, width?, height?, duration? }
 *   delete(storageKey)            exists(storageKey) -> boolean           getMetadata(storageKey) -> object | null
 *   createSecureAccess(storageKey, { expiresInSeconds, disposition, fileName, mimeType }) -> { url, expiresAt }
 * Every provider error is mapped to a safe application error here; raw provider messages never reach a user.
 */
let cached;
let override = null;

function resolveDriver() {
  const wanted = env.STORAGE_PROVIDER;
  const hasCloudinary = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
  if (wanted === 'local') return createLocalDriver();
  if (wanted === 'cloudinary' || (!wanted && hasCloudinary)) {
    return hasCloudinary
      ? createCloudinaryDriver({ cloudName: env.CLOUDINARY_CLOUD_NAME, apiKey: env.CLOUDINARY_API_KEY, apiSecret: env.CLOUDINARY_API_SECRET })
      : null;
  }
  return null;
}

export function getStorageDriver() {
  if (override) return override;
  if (cached === undefined) cached = resolveDriver();
  return cached;
}

/** Tests only: install (or, with null, remove) a driver. */
export function setStorageDriverForTests(driver) {
  override = driver;
}

export const storageLimits = () => ({
  imageBytes: env.UPLOAD_IMAGE_MAX_MB * 1024 * 1024,
  videoBytes: env.UPLOAD_VIDEO_MAX_MB * 1024 * 1024,
  documentBytes: env.UPLOAD_DOCUMENT_MAX_MB * 1024 * 1024,
});

export const signedLinkSeconds = () => env.STORAGE_SIGNED_URL_TTL_SECONDS;

/** Safe to return from an API: provider name and capabilities only, never credentials, account names or paths. */
export function getStorageStatus() {
  const driver = getStorageDriver();
  const limits = storageLimits();
  return {
    configured: Boolean(driver),
    provider: driver?.name ?? null,
    uploadsAvailable: Boolean(driver),
    externalLinksAvailable: true,
    limits: { imageMB: limits.imageBytes / 1048576, videoMB: limits.videoBytes / 1048576, documentMB: limits.documentBytes / 1048576 },
    message: driver ? null : `${STORAGE_NOT_CONFIGURED_MESSAGE} You can still add media that is already hosted online by its web address.`,
  };
}

function need() {
  const driver = getStorageDriver();
  if (!driver) throw storageNotConfigured();
  return driver;
}

async function run(action, fn) {
  try {
    return await fn();
  } catch (error) {
    throw toApiError(error, action);
  }
}

export const storage = {
  isConfigured: () => Boolean(getStorageDriver()),
  providerName: () => getStorageDriver()?.name ?? null,
  upload: (input) => run('upload', () => need().upload(input)),
  /** Used for cleanup. Never throws to the caller of a business action: see removeQuietly. */
  remove: (storageKey) => run('delete', () => need().delete(storageKey)),
  exists: (storageKey) => run('exists', () => need().exists(storageKey)),
  getMetadata: (storageKey) => run('metadata', () => need().getMetadata(storageKey)),
  createSecureAccess: (storageKey, options) =>
    run('access', () => need().createSecureAccess(storageKey, { expiresInSeconds: env.STORAGE_SIGNED_URL_TTL_SECONDS, ...options })),
};

/** Cleanup after a failed business step. A cleanup failure is logged by the caller and never hides the original error. */
export async function removeQuietly(storageKey, logger) {
  try {
    await storage.remove(storageKey);
    return true;
  } catch (error) {
    logger?.warn?.(`Could not remove an orphaned stored file (${error.code ?? 'error'}). It needs manual cleanup.`);
    return false;
  }
}
