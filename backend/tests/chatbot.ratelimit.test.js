/**
 * AI assistant rate limiting: its own file because the limiter's counter lives for the whole process.
 *   node --test tests/chatbot.ratelimit.test.js
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';

let ollamaCalls = 0;
const ollama = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    if (req.url === '/api/chat') ollamaCalls += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(req.url === '/api/chat' ? { message: { role: 'assistant', content: 'ok' }, done: true } : { models: [{ name: 'qwen2.5:3b' }] }));
  });
});
await new Promise((resolve) => ollama.listen(0, '127.0.0.1', resolve));

Object.assign(process.env, {
  NODE_ENV: 'development',
  MONGO_URI: 'mongodb://127.0.0.1:27018/chatbot_unit',
  JWT_SECRET: 'chatbot-test-secret-chatbot-test-secret-1234',
  CLIENT_URL: 'http://localhost:5173',
  GLOBAL_RATE_LIMIT_MAX: '100000',
  CHATBOT_RATE_LIMIT_MAX: '3',
  CHATBOT_DAILY_LIMIT_MAX: '1000',
  OLLAMA_BASE_URL: `http://127.0.0.1:${ollama.address().port}`,
});

describe('AI assistant rate limiting', () => {
  let server;
  let baseUrl;
  const send = (body) => fetch(`${baseUrl}/api/v1/chatbot/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, headers: r.headers, json: await r.json() }));

  before(async () => {
    const { default: app } = await import('../src/app.js');
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((resolve) => server?.close(resolve));
    await new Promise((resolve) => ollama.close(resolve));
  });

  test('after the burst limit a visitor gets a clear 429 and Ollama is no longer called', async () => {
    const statuses = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await send({ messages: [{ role: 'user', content: `question ${i}` }] })).status);
    assert.deepEqual(statuses, [200, 200, 200, 429, 429, 429]);
    assert.equal(ollamaCalls, 3, 'refused requests never reach the local model');
    const limited = await send({ messages: [{ role: 'user', content: 'one more' }] });
    assert.match(limited.json.message, /wait/i);
    assert.ok(limited.headers.get('ratelimit') || limited.headers.get('ratelimit-policy'), 'standard rate-limit headers are sent');
  });

  test('invalid requests are refused for free: they do not use up the allowance', async () => {
    const before = ollamaCalls;
    assert.equal((await send({ messages: [] })).status, 422);
    assert.equal(ollamaCalls, before);
  });
});
