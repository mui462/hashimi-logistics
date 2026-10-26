/**
 * The chatbot's OpenAI-compatible engine (CHATBOT_PROVIDER=openai: Groq, Gemini, OpenRouter, ...), with a mocked fetch.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

Object.assign(process.env, {
  NODE_ENV: 'development',
  MONGO_URI: 'mongodb://127.0.0.1:27018/chatbot_openai_unit',
  JWT_SECRET: 'chatbot-test-secret-chatbot-test-secret-1234',
  CLIENT_URL: 'http://localhost:5173',
  CHATBOT_PROVIDER: 'openai',
  CHAT_API_BASE_URL: 'https://api.groq.com/openai/v1/',
  CHAT_API_KEY: 'gsk_test_key_000000000000',
  CHAT_API_MODEL: 'llama-3.1-8b-instant',
});

const service = await import('../src/chatbot/chatbot.service.js');
const realFetch = globalThis.fetch;
const user = (content) => ({ role: 'user', content });

describe('AI assistant with an OpenAI-compatible API', () => {
  test('is available when configured, without calling the API', async () => {
    globalThis.fetch = () => { throw new Error('no network expected'); };
    try {
      assert.deepEqual(await service.checkAvailability(), { available: true, reason: null });
    } finally { globalThis.fetch = realFetch; }
  });

  test('posts to /chat/completions with a bearer key and the system prompt first', async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'We coordinate freight. See /services.' } }], usage: { prompt_tokens: 9, completion_tokens: 7 } }), { status: 200 });
    };
    try {
      const result = await service.reply([user('What services do you offer?')]);
      assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
      assert.equal(calls[0].headers.Authorization, 'Bearer gsk_test_key_000000000000');
      assert.equal(calls[0].body.model, 'llama-3.1-8b-instant');
      assert.equal(calls[0].body.messages[0].role, 'system');
      assert.deepEqual(calls[0].body.messages.at(-1), user('What services do you offer?'));
      assert.ok(result.links.some((link) => link.path === '/services'));
    } finally { globalThis.fetch = realFetch; }
  });

  test('a provider rate limit (429) becomes the polite busy message', async () => {
    globalThis.fetch = async () => new Response('{}', { status: 429 });
    try {
      await assert.rejects(() => service.reply([user('What services do you offer?')]), (error) => error.statusCode === 503 && error.code === 'CHATBOT_BUSY');
    } finally { globalThis.fetch = realFetch; }
  });

  test('other failures become the fixed unavailable message without leaking the key', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'bad key gsk_test_key_000000000000' }), { status: 401 });
    try {
      await assert.rejects(() => service.reply([user('What services do you offer?')]), (error) => {
        assert.equal(error.code, 'CHATBOT_UNAVAILABLE');
        assert.ok(!JSON.stringify(error).includes('gsk_'));
        return true;
      });
    } finally { globalThis.fetch = realFetch; }
  });
});
