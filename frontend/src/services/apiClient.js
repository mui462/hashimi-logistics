import axios from 'axios';
import { API_URL } from '../config/env';
import { ApiRequestError, toApiRequestError } from '../utils/apiRequestError';
import { ensureConsentChoice } from '../utils/consentStore';

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Anything that changes data (sign in, register, forms, portal actions) first makes sure the visitor has seen the cookie banner and
// chosen. Reading is never held up, and neither are signing out and the AI assistant (which set and need no cookies).
const READ_ONLY = new Set(['get', 'head', 'options']);
const NEVER_HELD = /^\/(auth\/logout|chatbot\/)/;

apiClient.interceptors.request.use(async (config) => {
  if (READ_ONLY.has(String(config.method ?? 'get').toLowerCase()) || NEVER_HELD.test(config.url ?? '')) return config;
  if (!(await ensureConsentChoice())) {
    throw new ApiRequestError('Please choose a cookie option to continue.', { code: 'COOKIE_CHOICE_REQUIRED' });
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(toApiRequestError(error))
);
