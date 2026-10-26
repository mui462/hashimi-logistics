/**
 * The chatbot's Claude engine (CHATBOT_PROVIDER=claude), tested with a mocked fetch: no network, no API key is ever sent anywhere.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

Object.assign(process.env, {
  NODE_ENV: 'development',
  MONGO_URI: 'mongodb://127.0.0.1:27018/chatbot_claude_unit',
  JWT_SECRET: 'chatbot-test-secret-chatbot-test-secret-1234',
  CLIENT_URL: 'http://localhost:5173',
  CHATBOT_PROVIDER: 'claude',
  ANTHROPIC_API_KEY: 'sk-ant-test-key-0000000000000000',
  ANTHROPIC_MODEL: 'claude-haiku-5-5',
});

const service = await import('../src/chatbot/chatbot.service.js');
const realFetch = globalThis.fetch;
const user = (content) => ({ role: 'user', content });

describe('AI assistant with Claude', () => {
  test('is available when the key is configured, without calling any API', async () => {
    globalThis.fetch = () => { throw new Error('no network expected'); };
    try {
      assert.deepEqual(await service.checkAvailability(), { available: true, reason: null });
    } finally { globalThis.fetch = realFetch; }
  });

  test('sends the system prompt and history to the Anthropic API and returns the cleaned answer', async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'We coordinate **full truckload** freight. See /services.' }], usage: { input_tokens: 10, output_tokens: 8 } }), { status: 200 });
    };
    try {
      const result = await service.reply([user('What services do you offer?')]);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
      assert.equal(calls[0].headers['x-api-key'], process.env.ANTHROPIC_API_KEY);
      assert.equal(calls[0].body.model, 'claude-haiku-5-5');
      assert.match(calls[0].body.system, /Hashimi AI Assistant/);
      assert.deepEqual(calls[0].body.messages, [user('What services do you offer?')]);
      assert.ok(!result.reply.includes('**'));
      assert.ok(result.links.some((link) => link.path === '/services'));
    } finally { globalThis.fetch = realFetch; }
  });

  test('an API failure becomes the fixed unavailable message and never leaks the key or the upstream body', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'invalid x-api-key sk-ant-test-key-0000000000000000' } }), { status: 401 });
    try {
      await assert.rejects(() => service.reply([user('What services do you offer?')]), (error) => {
        assert.equal(error.statusCode, 503);
        assert.equal(error.code, 'CHATBOT_UNAVAILABLE');
        assert.ok(!JSON.stringify(error).includes('sk-ant'));
        return true;
      });
    } finally { globalThis.fetch = realFetch; }
  });

  test('a shipment look-up never reaches the API', async () => {
    globalThis.fetch = () => { throw new Error('must not be called'); };
    try {
      const result = await service.reply([user('Where is my shipment HL-123456?')]);
      assert.ok(result.reply.length > 0);
    } finally { globalThis.fetch = realFetch; }
  });
});
