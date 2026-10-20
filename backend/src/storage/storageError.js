import { ApiError } from '../utils/ApiError.js';

/** Raised by providers. Never shown to users: `toApiError` maps it to a safe application error. */
export class StorageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StorageError';
    this.code = code; // 'unavailable' | 'upload_failed' | 'not_found' | 'rejected'
  }
}

export const STORAGE_NOT_CONFIGURED_MESSAGE = 'File storage is not configured yet.';

export const storageNotConfigured = () => ApiError.notImplemented(STORAGE_NOT_CONFIGURED_MESSAGE, 'STORAGE_NOT_CONFIGURED');

/** Provider errors can carry request details, account names or signed values. None of that is passed on. */
export function toApiError(error, action) {
  if (error instanceof ApiError) return error;
  const code = error instanceof StorageError ? error.code : 'unavailable';
  if (code === 'not_found') return new ApiError(404, 'The stored file could not be found.', [], 'STORAGE_FILE_MISSING');
  if (code === 'rejected' || (code === 'upload_failed' && action === 'upload')) return new ApiError(502, 'The file could not be stored. Please try again.', [], 'STORAGE_UPLOAD_FAILED');
  return new ApiError(503, 'File storage is temporarily unavailable. Please try again later.', [], 'STORAGE_UNAVAILABLE');
}
