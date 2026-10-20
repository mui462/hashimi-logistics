import axios from 'axios';
import { API_URL } from '../config/env';
import { toApiRequestError } from '../utils/apiRequestError';

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(toApiRequestError(error))
);
