const NETWORK_ERROR_MESSAGE =
  'We could not reach the server. Check your connection and try again.';
const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

export class ApiRequestError extends Error {
  constructor(message, { status = null, errors = [], code = null } = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.errors = errors;
    this.code = code;
  }
}

export function toApiRequestError(error) {
  if (error.response) {
    const { status, data } = error.response;
    return new ApiRequestError(data?.message || FALLBACK_MESSAGE, {
      status,
      errors: Array.isArray(data?.errors) ? data.errors : [],
      code: typeof data?.code === 'string' ? data.code : null,
    });
  }
  return new ApiRequestError(NETWORK_ERROR_MESSAGE);
}

export function toFieldErrors(errors = []) {
  return Object.fromEntries(
    errors.filter((item) => item.field).map((item) => [item.field, item.message])
  );
}
