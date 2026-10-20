/**
 * Rebuilds src/chatbot/knowledge.data.json from the website's own content (frontend/src/content, config/brand, config/paths).
 *   npm run chatbot:sync
 * Run it after changing built-in website content. Published CMS content is read live by the chatbot and does not need a sync.
 *
 * The frontend source uses bundler-style imports, so it is loaded through the frontend's own Vite (its dependencies must be
 * installed: `npm install` in frontend/). This is a development tool; the running API never touches the frontend folder.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { buildKnowledge } from '../src/chatbot/knowledgeBuilder.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FRONTEND_ROOT = path.resolve(here, '../../frontend');
export const OUTPUT_FILE = path.resolve(here, '../src/chatbot/knowledge.data.json');

export async function buildFromFrontend() {
  const { createServer } = await import(pathToFileURL(path.join(FRONTEND_ROOT, 'node_modules/vite/dist/node/index.js')).href);
  const vite = await createServer({ root: FRONTEND_ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const load = (file) => vite.ssrLoadModule(`/src/${file}`);
    const [{ brand, contactDetails }, { PATHS }, { services }, { industries }, { faqs }, home, pages] = await Promise.all([
      load('config/brand.js'), load('config/paths.js'), load('content/services.js'), load('content/industries.js'), load('content/faqs.js'),
      load('content/home.js'), load('content/pages.js'),
    ]);
    return buildKnowledge({ brand, contactDetails, PATHS, services, industries, faqs, home, pages });
  } finally {
    await vite.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const knowledge = await buildFromFrontend();
  await writeFile(OUTPUT_FILE, `${JSON.stringify(knowledge, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${knowledge.chunks.length} knowledge chunks and ${knowledge.routes.length} routes to ${path.relative(process.cwd(), OUTPUT_FILE)}`);
}
