/**
 * AI assistant with Ollama switched off (nothing listening on the configured address), and the configuration rules.
 *   node --test tests/chatbot.offline.test.js
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';

// A port that is certainly closed: bind one, note it, release it.
const closedPort = await new Promise((resolve) => {
  const probe = net.createServer().listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const BASE_ENV = {
  NODE_ENV: 'development',
  MONGO_URI: 'mongodb://127.0.0.1:27018/chatbot_unit',
  JWT_SECRET: 'chatbot-test-secret-chatbot-test-secret-1234',
  CLIENT_URL: 'http://localhost:5173',
  GLOBAL_RATE_LIMIT_MAX: '100000',
  CHATBOT_RATE_LIMIT_MAX: '100000',
  CHATBOT_DAILY_LIMIT_MAX: '100000',
};
Object.assign(process.env, BASE_ENV, { OLLAMA_BASE_URL: `http://127.0.0.1:${closedPort}`, OLLAMA_TIMEOUT_MS: '3000' });
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('AI assistant when Ollama is not running', () => {
  let server;
  let baseUrl;
  before(async () => {
    const { default: app } = await import('../src/app.js');
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((resolve) => server?.close(resolve));
  });

  test('the status says unavailable', async () => {
    const response = await fetch(`${baseUrl}/api/v1/chatbot/status`).then((r) => r.json());
    assert.deepEqual(response.data, { available: false });
  });

  test('a question gets a clear, fixed error: no pretend answer, no address, no system error code', async () => {
    const response = await fetch(`${baseUrl}/api/v1/chatbot/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'What services do you offer?' }] }),
    });
    const text = await response.text();
    assert.equal(response.status, 503);
    const json = JSON.parse(text);
    assert.equal(json.code, 'CHATBOT_UNAVAILABLE');
    assert.match(json.message, /not available/i);
    assert.equal(json.data, undefined);
    for (const leak of ['ECONNREFUSED', String(closedPort), '127.0.0.1', 'fetch failed', 'ollama', 'stack']) assert.ok(!text.toLowerCase().includes(leak.toLowerCase()), leak);
  });
});

describe('Ollama configuration', () => {
  const script = "const { env } = await import('./src/config/env.js'); console.log(JSON.stringify({ url: env.OLLAMA_BASE_URL, model: env.OLLAMA_MODEL, ctx: env.OLLAMA_NUM_CTX, keep: env.OLLAMA_KEEP_ALIVE }));";
  const load = (extra) => spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: backend,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...BASE_ENV, ...extra },
  });

  test('defaults: local Ollama, a small Qwen2.5 model, trailing slashes removed', () => {
    const result = load({});
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { url: 'http://127.0.0.1:11434', model: 'qwen2.5:3b', ctx: 4096, keep: '30m' });
    assert.equal(JSON.parse(load({ OLLAMA_BASE_URL: 'http://127.0.0.1:11434///', OLLAMA_MODEL: 'qwen2.5:1.5b' }).stdout).url, 'http://127.0.0.1:11434');
  });

  test('credentials inside the address and nonsense values are refused at startup', () => {
    assert.notEqual(load({ OLLAMA_BASE_URL: 'http://user:pass@127.0.0.1:11434' }).status, 0);
    assert.notEqual(load({ OLLAMA_BASE_URL: 'not a url' }).status, 0);
    assert.notEqual(load({ OLLAMA_KEEP_ALIVE: 'forever' }).status, 0);
  });

  test('in production Ollama may not be reached over plain http across the internet, or have port 11434 open publicly', () => {
    const production = { NODE_ENV: 'production', CLIENT_URL: 'https://example.test', JWT_SECRET: 'q8Zr2vN5xT7wK1pL9mC3bD6fG0hJ4sA8uE2yR5tV7nX1', ENFORCE_HTTPS: 'true' };
    assert.notEqual(load({ ...production, OLLAMA_BASE_URL: 'http://203.0.113.5:11434' }).status, 0);
    assert.notEqual(load({ ...production, OLLAMA_BASE_URL: 'http://ai.example.test:11434' }).status, 0);
    assert.equal(load({ ...production, OLLAMA_BASE_URL: 'https://ai.example.test' }).status, 0, 'an https endpoint (for example a reverse proxy) is fine');
    assert.equal(load({ ...production, OLLAMA_BASE_URL: 'http://127.0.0.1:11434' }).status, 0, 'Ollama on the same server is fine');
    assert.equal(load({ ...production, OLLAMA_BASE_URL: 'http://10.0.0.7:11434' }).status, 0, 'and so is a private network');
  });
});
