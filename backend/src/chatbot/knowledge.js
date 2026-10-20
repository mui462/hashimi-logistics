import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';
import * as content from '../cms/content.service.js';
import builtIn from './knowledge.data.json' with { type: 'json' };
import { retrieve } from './retrieval.js';

/**
 * What the assistant knows. The base is the website's own built-in content (knowledge.data.json, generated from frontend/src/content by
 * `npm run chatbot:sync`). Where the Super Admin has published content in the CMS (services, industries, service areas, FAQs, contact
 * details) that published content replaces the built-in version of the same topic, so the assistant says what the website says.
 * Only public, published content is ever used; there is no path from here to customer, carrier, quote or shipment records.
 */
const TTL_MS = 5 * 60 * 1000;
const clip = (text, max = 900) => (String(text ?? '').length > max ? `${String(text).slice(0, max - 1)}…` : String(text ?? ''));
let cached = { at: 0, value: null };

const DAYS = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };

function settingsChunk(settings) {
  if (!settings?.configured) return null;
  const a = settings.address;
  const address = a ? [a.street, [a.city, [a.state, a.zipCode].filter(Boolean).join(' ')].filter(Boolean).join(', '), a.country].filter(Boolean).join(', ') : '';
  const hours = (settings.businessHours ?? []).map((row) => `${DAYS[row.day] ?? row.day}: ${row.isClosed ? 'closed' : `${row.opensAt ?? '?'} to ${row.closesAt ?? '?'}`}`).join('; ');
  const parts = [settings.phone && `Phone: ${settings.phone}`, settings.email && `Email: ${settings.email}`, address && `Address: ${address}`, hours && `Business hours: ${hours}`].filter(Boolean);
  return parts.length > 0 ? { id: 'contact', title: 'Contact', url: '/contact', text: `${parts.join('. ')}. The Contact page has a form for sending the team a message.` } : null;
}

/** The built-in chunks with any published CMS content swapped in. Exported for tests. */
export function mergeLive(base, live) {
  let chunks = [...base.chunks];
  let routes = [...base.routes];
  const replace = (test, additions) => { chunks = [...chunks.filter((chunk) => !test(chunk)), ...additions]; };

  if (live.services?.configured) {
    const items = live.services.items;
    replace((c) => c.id.startsWith('service-') || c.id === 'services-overview', [
      ...items.map((s) => ({ id: `cms-service-${s.slug}`, title: s.name, url: `/services/${s.slug}`, text: clip(`${s.name}. ${s.shortDescription ?? ''}`) })),
      { id: 'services-overview', title: 'Freight services', url: '/services', text: `Services offered: ${items.map((s) => s.name).join(', ')}.` },
    ]);
    routes = [...routes.filter((r) => !r.path.startsWith('/services/')), ...items.map((s) => ({ label: s.name, path: `/services/${s.slug}` }))];
  }
  if (live.industries?.configured) {
    const items = live.industries.items;
    replace((c) => c.id.startsWith('industry-') || c.id === 'industries-overview', [
      ...items.map((i) => ({ id: `cms-industry-${i.slug}`, title: `${i.name} freight`, url: `/industries/${i.slug}`, text: clip(`${i.name}. ${i.shortDescription ?? ''}`) })),
      { id: 'industries-overview', title: 'Industries served', url: '/industries', text: `Industries: ${items.map((i) => i.name).join(', ')}.` },
    ]);
    routes = [...routes.filter((r) => !r.path.startsWith('/industries/')), ...items.map((i) => ({ label: `${i.name} freight`, path: `/industries/${i.slug}` }))];
  }
  if (live.areas?.configured) {
    replace((c) => c.id === 'service-areas', [{ id: 'service-areas', title: 'Service areas', url: '/service-areas', text: clip(`Service areas: ${live.areas.items.map((a) => `${a.name}${a.description ? ` (${a.description})` : ''}`).join('; ')}.`) }]);
  }
  if (live.faqs?.configured) {
    replace((c) => c.id.startsWith('faq-'), live.faqs.items.map((f) => ({ id: `cms-faq-${f.id}`, title: f.question, url: '/faq', text: clip(`${f.question} ${f.answer}`) })));
  }
  const contact = settingsChunk(live.settings);
  if (contact) replace((c) => c.id === 'contact', [contact]);
  return { ...base, chunks, routes };
}

async function readLive() {
  const [settings, services, industries, areas, faqs] = await Promise.all([
    content.getSiteSettings(), content.listServices(), content.listIndustries(), content.listServiceAreas(), content.listFaqs(),
  ]);
  return { settings, services, industries, areas, faqs };
}

/** The knowledge in force right now. Falls back to the built-in content when the database is unavailable. */
export async function currentKnowledge() {
  if (mongoose.connection.readyState !== 1) return builtIn;
  if (cached.value && Date.now() - cached.at < TTL_MS) return cached.value;
  try {
    cached = { at: Date.now(), value: mergeLive(builtIn, await readLive()) };
  } catch (error) {
    logger.warn(`Chatbot: published website content could not be read; using the built-in content (${error?.name ?? 'error'}).`);
    cached = { at: Date.now() - TTL_MS + 30_000, value: builtIn };
  }
  return cached.value;
}

export const clearKnowledgeCache = () => { cached = { at: 0, value: null }; };

/** The facts to give the model for this conversation: the best-matching chunks for the visitor's recent words. */
export async function knowledgeFor(query, limit = 3) {
  const knowledge = await currentKnowledge();
  return { knowledge, chunks: retrieve(query, knowledge.chunks, limit) };
}
