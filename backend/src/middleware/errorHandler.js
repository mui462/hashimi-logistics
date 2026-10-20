import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

const GENERIC_MESSAGE = 'Something went wrong on our side. Please try again later.';

function normalizeError(error) {
  if (error instanceof ApiError) {
    return error;
  }
  if (error.type === 'entity.parse.failed') {
    return ApiError.badRequest('The request body is not valid JSON.');
  }
  if (error.type === 'entity.too.large') {
    return new ApiError(413, 'The request body is too large.');
  }
  if (error instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(error.errors).map((item) => ({
      field: item.path,
      message: item.message,
    }));
    return ApiError.validation(errors);
  }
  if (error instanceof mongoose.Error.CastError) {
    return ApiError.badRequest('One of the supplied identifiers is invalid.');
  }
  if (error.code === 11000) {
    return ApiError.conflict('A record with those details already exists.');
  }
  return new ApiError(500, GENERIC_MESSAGE);
}

export function notFoundHandler(_req, _res, next) {
  next(ApiError.notFound('The requested endpoint does not exist.'));
}

export function errorHandler(error, _req, res, _next) {
  const normalized = normalizeError(error);

  if (!error.isOperational && normalized.statusCode >= 500) {
    logger.error(error.stack ?? error);
  }

  res.status(normalized.statusCode).json({
    success: false,
    message: normalized.message,
    errors: normalized.errors,
    ...(normalized.code ? { code: normalized.code } : {}),
  });
}
