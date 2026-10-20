/**
 * Checks the AI assistant's engine, step by step, using the same settings the API uses (backend/.env):
 *   npm run chatbot:check
 * 1. Is Ollama reachable at OLLAMA_BASE_URL?   2. Is OLLAMA_MODEL installed?   3. Does the model actually answer?
 * Prints what to run when a step fails. Nothing is changed and nothing is stored.
 */
import { env } from '../src/config/env.js';

const headers = { 'Content-Type': 'application/json', ...(env.OLLAMA_API_KEY ? { Authorization: `Bearer ${env.OLLAMA_API_KEY}` } : {}) };
const get = (path, ms = 5000) => fetch(`${env.OLLAMA_BASE_URL}${path}`, { headers, signal: AbortSignal.timeout(ms) });
const fail = (message, hints = []) => {
  console.error(`\n✖ ${message}`);
  for (const hint of hints) console.error(`    ${hint}`);
  process.exit(1);
};

console.log(`Ollama address : ${env.OLLAMA_BASE_URL}`);
console.log(`Model          : ${env.OLLAMA_MODEL}`);

let version;
try {
  const response = await get('/api/version');
  version = (await response.json()).version;
} catch {
  fail('Ollama is not reachable.', [
    'Check it is installed:        ollama --version',
    'Start it (Windows):           start "Ollama" from the Start menu, or run  ollama serve  in a terminal',
    `If it runs elsewhere, set OLLAMA_BASE_URL in backend/.env (now ${env.OLLAMA_BASE_URL}).`,
  ]);
}
console.log(`✔ Ollama ${version} is running`);

let installed = [];
try {
  installed = ((await (await get('/api/tags')).json()).models ?? []).map((model) => model.name);
} catch {
  fail('Ollama answered, but its model list could not be read.');
}
const wanted = env.OLLAMA_MODEL;
if (!installed.some((name) => name === wanted || name === `${wanted}:latest`)) {
  fail(`The model "${wanted}" is not installed.`, [`Download it:  ollama pull ${wanted}`, `Installed now: ${installed.length > 0 ? installed.join(', ') : '(none)'}`, 'Or choose an installed one with OLLAMA_MODEL in backend/.env.']);
}
console.log(`✔ Model "${wanted}" is installed (${installed.join(', ')})`);

const started = Date.now();
try {
  const response = await fetch(`${env.OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(env.OLLAMA_TIMEOUT_MS),
    body: JSON.stringify({
      model: wanted,
      stream: false,
      keep_alive: env.OLLAMA_KEEP_ALIVE,
      options: { temperature: 0, num_predict: 20 },
      messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
    }),
  });
  const json = await response.json();
  if (!response.ok || typeof json?.message?.content !== 'string') throw new Error(`HTTP ${response.status}`);
  console.log(`✔ The model answered in ${((Date.now() - started) / 1000).toFixed(1)} s: "${json.message.content.trim()}"`);
} catch (error) {
  fail(`The model did not answer (${error?.name === 'TimeoutError' ? `no reply within ${env.OLLAMA_TIMEOUT_MS} ms` : error.message}).`, [
    'The first answer after a restart loads the model into memory and can be slow; try again.',
    'If it keeps failing, try a smaller model (for example qwen2.5:1.5b) or free memory.',
  ]);
}
console.log('\nAll checks passed. Start the API (npm run dev) and open the website to chat.');
