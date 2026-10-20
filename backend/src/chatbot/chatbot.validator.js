import { z } from 'zod';

export const MAX_MESSAGES = 8;
export const MAX_MESSAGE_CHARS = 1200;

// Control characters (other than tab and line breaks) have no place in a chat message.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const content = z
  .string()
  .max(MAX_MESSAGE_CHARS, `Messages can be at most ${MAX_MESSAGE_CHARS} characters.`)
  .transform((value) => value.replace(CONTROL, '').replace(/\r\n?/g, '\n').trim())
  .pipe(z.string().min(1, 'Type a message first.'));

const message = z.object({ role: z.enum(['user', 'assistant']), content }).strict();

/** The whole conversation so far, oldest first, ending with the visitor's new message. Nothing is stored on the server. */
export const chatMessageSchema = z.object({
  body: z
    .object({
      messages: z
        .array(message)
        .min(1, 'Send at least one message.')
        .max(MAX_MESSAGES, `Send at most ${MAX_MESSAGES} messages of conversation history.`)
        .refine((items) => items.length === 0 || items[0].role === 'user', 'The conversation must start with a visitor message.')
        .refine((items) => items.length === 0 || items.at(-1).role === 'user', 'The last message must be from the visitor.'),
    })
    .strict(),
  query: z.object({}).strict(),
  params: z.object({}).strict(),
});

export const statusSchema = z.object({ body: z.object({}).passthrough(), query: z.object({}).strict(), params: z.object({}).strict() });
