import { apiClient } from './apiClient';

// The signed-in user's own notification settings. The server takes the user from the session; nothing here sends an id or a role.
const unwrap = (response) => response.data.data;
const SCOPES = ['customer', 'carrier', 'admin'];
const base = (scope) => {
  if (!SCOPES.includes(scope)) throw new Error('Unknown notification settings scope.');
  return `/${scope}/notification-preferences`;
};

export const getPreferences = (scope) => apiClient.get(base(scope)).then(unwrap);
export const updatePreferences = (scope, changes) => apiClient.put(base(scope), changes).then(unwrap);
