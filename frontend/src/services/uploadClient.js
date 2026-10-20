import { apiClient } from './apiClient';

/**
 * Sends one file as the raw request body. The file's own type is the Content-Type and its details travel in the query
 * string (the API accepts exactly one file per request and validates the real content, not just this header).
 * Nothing about ownership is ever sent: the server derives customer, carrier and uploader from the session and the record.
 */
export function uploadFile(url, file, { query = {}, onProgress, signal } = {}) {
  const params = Object.fromEntries(Object.entries({ fileName: file.name, ...query }).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  return apiClient
    .post(url, file, {
      params,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      timeout: 0,
      signal,
      transformRequest: [(data) => data],
      onUploadProgress: (event) => onProgress?.(event.total ? Math.min(100, Math.round((event.loaded / event.total) * 100)) : null),
    })
    .then((response) => response.data.data);
}
