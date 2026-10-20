
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { ALLOWED_TYPES } from './fileTypes.js';
import { storage } from './index.js';
import { storageNotConfigured } from './storageError.js';

const MB = 1024 * 1024;

const limitFor = (kind) =>
  (kind === 'video'
    ? env.UPLOAD_VIDEO_MAX_MB
    : kind === 'image'
      ? env.UPLOAD_IMAGE_MAX_MB
      : env.UPLOAD_DOCUMENT_MAX_MB) * MB;

/**
 * Reject upload requests when no storage provider is configured.
 */
export const requireStorage = (req, res, next) => {
  if (!storage.isConfigured()) {
    return next(storageNotConfigured());
  }

  return next();
};

/**
 * Reads one file sent as the raw request body.
 * Content-Type identifies the file type; the filename is in the query string.
 * Sets req.upload = { buffer, declaredType, size }.
 */
export const readUpload = (purpose) => async (req, res, next) => {
  const declaredType = String(req.headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  const rule = ALLOWED_TYPES[purpose]?.[declaredType];

  if (!rule) {
    throw new ApiError(
      415,
      'That file type is not supported.',
      [],
      'UNSUPPORTED_FILE_TYPE'
    );
  }

  const limit = limitFor(rule.kind);

  const tooLarge = () =>
    new ApiError(
      413,
      `That file is too large. The limit for this kind of file is ${Math.round(limit / MB)} MB.`,
      [],
      'FILE_TOO_LARGE'
    );

  const declaredLength = Number(req.headers['content-length']);
  const chunks = [];
  let size = 0;
  let oversized = Number.isFinite(declaredLength) && declaredLength > limit;

  try {
    for await (const chunk of req) {
      size += chunk.length;

      if (size > limit) {
        oversized = true;
      }

      // Do not retain upload data after the size limit is exceeded.
      if (!oversized) {
        chunks.push(chunk);
      }
    }
  } catch {
    throw new ApiError(
      400,
      'The upload was interrupted. Please try again.',
      [],
      'UPLOAD_INTERRUPTED'
    );
  }

  if (oversized) {
    throw tooLarge();
  }

  if (size === 0) {
    throw new ApiError(
      400,
      'The uploaded file is empty.',
      [],
      'EMPTY_FILE'
    );
  }

  req.upload = {
    buffer: Buffer.concat(chunks, size),
    declaredType,
    size,
  };

  return next();
};
