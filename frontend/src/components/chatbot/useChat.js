import { useCallback, useEffect, useRef, useState } from 'react';
import { sendChatMessages } from '../../services/chatService';

export const WELCOME_MESSAGE =
  "Hello! Welcome to Hashimi Logistics LLC. I'm your AI assistant. I can help you understand our freight services, request a quote, explore carrier opportunities, and find answers to common logistics questions. How can I help you today?";

export const SUGGESTED_QUESTIONS = [
  'I need a freight quote.',
  'How can I become a carrier?',
  'What freight services do you offer?',
  'What areas do you serve?',
  'How can I track my shipment?',
];

export const MAX_INPUT_LENGTH = 1000;
// What the server accepts is 8 messages of 1,200 characters. Earlier answers are shortened a little so a long chat stays well under the
// request size limit; the conversation shown on screen is never shortened.
const MAX_HISTORY = 8;
const MAX_ANSWER_CONTEXT = 700;

let counter = 0;
const newId = () => `m${(counter += 1)}`;
const welcome = () => ({ id: newId(), role: 'assistant', content: WELCOME_MESSAGE, time: new Date(), welcome: true });

/** The request body for the server: real turns only (not the greeting), ending with the visitor's message and starting with theirs. */
export function toPayload(messages) {
  const turns = messages
    .filter((message) => !message.welcome && (message.role === 'user' || message.role === 'assistant'))
    .map((message) => ({ role: message.role, content: message.role === 'assistant' ? message.content.slice(0, MAX_ANSWER_CONTEXT) : message.content }))
    .slice(-MAX_HISTORY);
  while (turns.length > 0 && turns[0].role !== 'user') turns.shift();
  return turns;
}

/**
 * The conversation: messages, the in-flight request, and the last error. Context lives only in this component's memory for the
 * current page session (nothing is written to browser storage). Guards: an empty message or a second send while an answer is
 * pending is ignored; starting a new conversation cancels the pending request and ignores its late answer.
 */
export function useChat() {
  const [messages, setMessages] = useState(() => [welcome()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const busyRef = useRef(false);
  const epoch = useRef(0);
  const controller = useRef(null);

  useEffect(() => () => controller.current?.abort(), []);

  const request = useCallback(async (list) => {
    const mine = epoch.current;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    controller.current = new AbortController();
    try {
      const data = await sendChatMessages(toPayload(list), { signal: controller.current.signal });
      if (mine !== epoch.current) return;
      setMessages((current) => [...current, { id: newId(), role: 'assistant', content: String(data.reply ?? ''), links: Array.isArray(data.links) ? data.links : [], time: new Date() }]);
    } catch (caught) {
      if (mine !== epoch.current) return;
      setError({ message: caught?.message || 'The assistant could not answer. Please try again.', status: caught?.status ?? null });
    } finally {
      if (mine === epoch.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, []);

  const send = useCallback(async (text) => {
    const content = String(text ?? '').trim().slice(0, MAX_INPUT_LENGTH);
    if (!content || busyRef.current) return false;
    const next = [...messagesRef.current, { id: newId(), role: 'user', content, time: new Date() }];
    setMessages(next);
    await request(next);
    return true;
  }, [request]);

  /** Send the same question again after an error (the visitor's message is already on screen, so it is not added twice). */
  const retry = useCallback(async () => {
    if (busyRef.current || messagesRef.current.at(-1)?.role !== 'user') return;
    await request(messagesRef.current);
  }, [request]);

  const reset = useCallback(() => {
    epoch.current += 1;
    controller.current?.abort();
    busyRef.current = false;
    setBusy(false);
    setError(null);
    setMessages([welcome()]);
  }, []);

  return { messages, busy, error, send, retry, reset };
}
