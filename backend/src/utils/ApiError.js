export class ApiError extends Error {
  constructor(statusCode, message, errors = [], code) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.code = code;
    this.isOperational = true;
  }

  static badRequest(message, errors) {
    return new ApiError(400, message, errors);
  }

  static unauthorized(message = 'Authentication required.') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'You do not have permission to perform this action.') {
    return new ApiError(403, message);
  }

  /** `code` is an optional machine-readable reason the frontend can branch on (for example SHIPMENT_NOT_FOUND). */
  static notFound(message = 'The requested resource was not found.', code) {
    return new ApiError(404, message, [], code);
  }

  /** `code` is a machine-readable business reason (for example INVALID_STATUS_TRANSITION). */
  static conflict(message, code, errors = []) {
    return new ApiError(409, message, errors, code);
  }

  static validation(errors, message = 'Please correct the highlighted fields.') {
    return new ApiError(422, message, errors);
  }

  static tooManyRequests(message = 'Too many requests. Please wait a moment and try again.') {
    return new ApiError(429, message);
  }

  static notImplemented(message, code) {
    return new ApiError(501, message, [], code);
  }
}
