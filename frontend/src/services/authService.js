import { apiClient } from './apiClient';

export async function getCurrentUser() {
  const { data } = await apiClient.get('/auth/me');
  return data.data.user;
}

export async function register({ accountType, ...details }) {
  const { data } = await apiClient.post(`/auth/register/${accountType}`, details);
  return data.data.user;
}

export async function login(credentials) {
  const { data } = await apiClient.post('/auth/login', credentials);
  return data.data.user;
}

export async function adminLogin(credentials) {
  const { data } = await apiClient.post('/auth/admin/login', credentials);
  return data.data.user;
}

export async function logout() {
  await apiClient.post('/auth/logout');
}

export async function requestPasswordReset(email) {
  const { data } = await apiClient.post('/auth/forgot-password', { email });
  return data.message;
}

export async function resetPassword({ token, password, passwordConfirmation }) {
  const { data } = await apiClient.post('/auth/reset-password', { token, password, passwordConfirmation });
  return data.message;
}

export async function verifyEmail(token) {
  const { data } = await apiClient.post('/auth/verify-email', { token });
  return data.message;
}

export async function resendVerification() {
  const { data } = await apiClient.post('/auth/resend-verification');
  return data.message;
}

/** Whether Google Sign-In is configured on the server, plus the public OAuth client ID the Google button needs. */
export async function getGoogleConfig() {
  const { data } = await apiClient.get('/auth/google/config');
  return data.data;
}

/** The server verifies the Google ID token. The portal only narrows which account type may sign in on this page. */
export async function googleLogin({ credential, portal }) {
  const { data } = await apiClient.post('/auth/google/login', { credential, portal });
  return data.data.user;
}

export async function googleRegister({ accountType, ...details }) {
  const { data } = await apiClient.post(`/auth/google/register/${accountType}`, details);
  return data.data.user;
}
