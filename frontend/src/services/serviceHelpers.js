import { ApiRequestError } from '../utils/apiRequestError';

const UNAVAILABLE_STATUSES = [404, 405, 501, 502, 503];

// When an endpoint has not been built or deployed yet the API answers 404/405/501/503. Surface a
// clear, honest message instead of a vague failure. Nothing is ever faked as a success.
export function asUnavailable(error, message) {
  if (error instanceof ApiRequestError && UNAVAILABLE_STATUSES.includes(error.status)) {
    return new ApiRequestError(message, { status: error.status, errors: [] });
  }
  return error;
}

export const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };
