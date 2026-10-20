import { apiClient } from './apiClient';

// The public AI assistant API. Stateless: every request carries the conversation so far and gets one answer back.
// The assistant runs on a local model, so an answer can take from a few seconds to well over twenty (longer right after the model was
// idle). These calls wait longer than the client's default; the server gives up first and says so.
const ANSWER_TIMEOUT_MS = 140000;

/** Whether the server says the assistant can answer right now. */
export const getChatStatus = () => apiClient.get('/chatbot/status', { timeout: 8000 }).then((response) => Boolean(response.data?.data?.available));

/** `messages`: [{ role: 'user' | 'assistant', content }], oldest first, ending with the visitor's message. Resolves to { reply, links }. */
export const sendChatMessages = (messages, { signal } = {}) =>
  apiClient.post('/chatbot/messages', { messages }, { signal, timeout: ANSWER_TIMEOUT_MS }).then((response) => response.data.data);
