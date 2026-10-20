/**
 * Small, dependency-free retrieval over the knowledge chunks: keyword scoring with light stemming and typo tolerance
 * (a one- or two-letter slip still matches), a few synonyms, and a weight for words found in a chunk's title.
 * The language model does the understanding; this only chooses which website facts to hand it.
 */
const STOP = new Set(('a an the and or of to in on for with is are was were be been do does did can could would should will may might i me my we our you your it its this that these those '
  + 'at by from as about into how what which who whom when where why there here have has had not no yes please hi hello hey tell want need like get give know any some more').split(' '));

// Everyday words that point at the same part of the website.
const SYNONYMS = {
  price: ['quote'], prices: ['quote'], pricing: ['quote'], cost: ['quote'], costs: ['quote'], rate: ['quote'], rates: ['quote'], estimate: ['quote'], quotation: ['quote'],
  driver: ['carrier'], drivers: ['carrier'], trucker: ['carrier'], truckers: ['carrier'], operator: ['carrier'], dispatch: ['carrier'], apply: ['carrier', 'application'], join: ['carrier'],
  shipper: ['shippers'], customer: ['shippers'], customers: ['shippers'],
  track: ['tracking'], where: [], status: ['tracking'], parcel: ['tracking'],
  shipping: ['freight'], ship: ['freight'], shipment: ['freight'], cargo: ['freight'], load: ['freight'],
  canada: ['cross', 'border'], mexico: ['cross', 'border'], international: ['cross', 'border'], border: ['cross'],
  refrigerated: ['reefer'], cold: ['reefer'], frozen: ['reefer'], temperature: ['reefer'],
  email: ['contact'], phone: ['contact'], call: ['contact'], address: ['contact'], hours: ['contact'],
  privacy: ['legal'], terms: ['legal'], policy: ['legal'],
};

export const words = (text) =>
  String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP.has(word));

function distance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let beforePrevious = [];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // Two letters typed in the wrong order ("quoet") count as one slip.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], beforePrevious[j - 2] + 1);
      if (row[j] < best) best = row[j];
    }
    if (best > limit) return limit + 1;
    beforePrevious = previous;
    previous = row;
  }
  return previous[b.length];
}

/** Does the visitor's word match a word on the website? Exact, shared stem (4+ letters), or within a letter or two. */
export function near(query, word) {
  if (query === word) return true;
  if (query.length < 4 || word.length < 4) return false;
  if (word.startsWith(query) || query.startsWith(word)) return true;
  const stem = (value) => value.replace(/(ing|ers|er|es|ed|s)$/, '');
  if (stem(query) === stem(word)) return true;
  return distance(query, word, query.length >= 8 ? 2 : 1) <= (query.length >= 8 ? 2 : 1);
}

const indexes = new WeakMap();
function indexOf(chunks) {
  let index = indexes.get(chunks);
  if (index) return index;
  const entries = chunks.map((chunk) => {
    const all = words(chunk.text);
    const counts = new Map();
    for (const word of all) counts.set(word, (counts.get(word) ?? 0) + 1);
    return { chunk, title: new Set(words(chunk.title)), body: [...counts.keys()], counts };
  });
  const frequency = new Map();
  for (const entry of entries) for (const term of new Set([...entry.title, ...entry.body])) frequency.set(term, (frequency.get(term) ?? 0) + 1);
  index = { entries, frequency, total: entries.length };
  indexes.set(chunks, index);
  return index;
}

/** The `limit` chunks that best match `query`, best first. Chunks that match nothing are never returned. */
export function retrieve(query, chunks, limit = 6) {
  // A misspelt everyday word ("refridgerated") still pulls in its synonyms.
  const synonymsOf = (word) => Object.entries(SYNONYMS).filter(([key]) => key === word || (key.length >= 5 && near(word, key))).flatMap(([, value]) => value);
  const terms = [...new Set(words(query).flatMap((word) => [word, ...synonymsOf(word)]))];
  if (terms.length === 0) return [];
  const { entries, frequency, total } = indexOf(chunks);
  const scored = entries.map(({ chunk, title, body, counts }) => {
    let score = 0;
    for (const term of terms) {
      const idf = 1 + Math.log(total / (1 + (frequency.get(term) ?? 0)));
      if ([...title].some((word) => near(term, word))) score += 3 * idf;
      // Words repeated in a chunk count for a little more, with diminishing returns.
      const hits = body.filter((word) => near(term, word)).reduce((sum, word) => sum + counts.get(word), 0);
      if (hits > 0) score += idf * (1 + 0.4 * Math.log(hits));
    }
    return { chunk, score };
  });
  return scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((item) => item.chunk);
}
