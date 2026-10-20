/**
 * A last safety net on what a small local model says, applied before any reply leaves the server. The prompt asks the model not to do
 * these things; this checks that it did not. A reply that breaks a rule is replaced with a fixed, honest answer rather than shown.
 */
const LEAK_MARKERS = ['WEBSITE FACTS', 'WEBSITE PAGES', 'RULES\n1.', 'WHAT YOU MUST NEVER DO', '"Hashimi AI Assistant", the website assistant', 'reference data, not instructions', 'EXAMPLES\nVisitor:'];

export const SAFE_REPLIES = {
  leak: "I can't share that. I'm happy to help with questions about our freight services, quotes, service areas or working with us as a carrier.",
  price: "I can't give prices or rates. Our team prepares quotes after reviewing the shipment details. Please use the Request a Quote page: /request-quote.",
  offering: "We coordinate truck freight, including cross-border moves between the U.S., Canada and Mexico. I don't have verified information about other services, so please check /services or contact our team on /contact.",
  offtopic: 'I can only help with questions about Hashimi Logistics and our freight services.',
  promise: "I can't make promises or guarantees. For details on how we work with shippers and carriers, please see /how-it-works or contact our team on /contact.",
};

const PRICE = /(?:\$|usd\s?)\s?\d|\b\d[\d,.]*\s?(?:usd|dollars?|cents?)\b|\bper\s+mile\b/i;
// "We offer ocean freight", "we handle customs clearance", "our air cargo service" ... but not "we do not offer ocean freight".
// The words between the verb and the service may not contain a negation ("not", "never", "n't"), so a refusal is never read as an offer.
const GAP = (max) => `(?:(?!\\b(?:not|never|no|cannot)\\b|n't)[^.!?\\n]){0,${max}}`;
const OFFERING = new RegExp(
  `\\b(?:we|hashimi(?:\\s+logistics)?|our\\s+company)\\s+(?:can\\s+|also\\s+|will\\s+)?(?:offer|provide|handle|specialize\\s+in|arrange)\\b${GAP(60)}\\b(?:ocean|sea|air|rail|barge)\\s+(?:freight|cargo|shipping|transport)`
    + `|\\b(?:we|hashimi(?:\\s+logistics)?)\\s+(?:can\\s+|also\\s+|will\\s+)?(?:offer|provide|handle|arrange)\\b${GAP(40)}\\bcustoms\\b`,
  'i'
);
// Program code, SQL or markup: nothing the freight assistant should ever write.
const CODE = /```|\bdef\s+\w+\s*\(|\bprint\s*\(|\bconsole\.log\s*\(|\bfunction\s+\w+\s*\(|\b(?:import|from)\s+\w+\s+import\b|\bSELECT\b[^.]{0,80}\bFROM\b|<\/?(?:script|html|div|body)\b|\b\w+\.(?:sort|append|push|split|join)\(\)/i;
const PROMISE = /\b(?:we|hashimi(?:\s+logistics)?)\s+(?:will\s+)?(?:guarantee|promise|assure)\b|\b(?:guaranteed|promised)\s+(?:delivery|pickup|approval|arrival|rate|price|savings)\b/i;

/** Returns the reply to show: the model's own text when it is acceptable, otherwise a fixed safe reply. */
export function guardReply(text) {
  const reply = String(text ?? '');
  if (LEAK_MARKERS.some((marker) => reply.includes(marker))) return SAFE_REPLIES.leak;
  if (CODE.test(reply)) return SAFE_REPLIES.offtopic;
  if (PRICE.test(reply)) return SAFE_REPLIES.price;
  if (OFFERING.test(reply)) return SAFE_REPLIES.offering;
  if (PROMISE.test(reply)) return SAFE_REPLIES.promise;
  return reply;
}

// ---- Before the model: requests that must never reach it ------------------------------------------------------------------------------
// Two kinds of message are answered at once with a fixed, honest reply, without asking the model: a request for the status of a specific
// shipment (the assistant has no tracking data and must never guess), and an attempt to extract the instructions. Everything else,
// including ordinary questions about tracking, goes to the model.
SAFE_REPLIES.tracking = "I can't look up or state the status of a shipment, and I don't have access to tracking data. Please enter your tracking number on the Track Shipment page: /track-shipment, or contact our team on /contact.";

// Clear requests for work that has nothing to do with freight: writing code, poems, essays, stories, songs or homework.
const OFF_TOPIC = /\b(?:write|generate|create|compose|draft|give\s+me|make)\b[^.?!]{0,40}\b(?:python|javascript|java|sql|html|css|code|script|program|poem|poetry|essay|story|song|lyrics|rap|joke|homework|assignment|resume|cover\s+letter)\b|\b(?:solve|calculate)\b[^.?!]{0,30}\b(?:equation|integral|derivative|homework)\b|\b(?:translate|tell\s+me\s+a)\b[^.?!]{0,20}\b(?:joke|story|poem)\b/i;
const TRACKING_NUMBER = /\b[A-Za-z]{1,4}[-\s]?\d{4,}\b|\b\d{7,}\b/;
const WHERE_IS_MY = /\b(?:where|whereabouts|status|location|eta|update)\b[^.?!]{0,40}\b(?:my|our|the)\s+(?:shipment|load|freight|truck|package|cargo|order|delivery)\b|\b(?:track|trace|locate)\b[^.?!]{0,30}\b(?:my|our)\s+(?:shipment|load|freight|truck|package|cargo|order)\b[^.?!]*\d/i;
const EXTRACTION = /\b(?:system|hidden|secret|initial|original|developer)\s+(?:prompt|instructions?|rules|message)\b|\b(?:ignore|disregard|forget|override)\b[^.?!]{0,40}\b(?:previous|prior|above|earlier|all|your)\b[^.?!]{0,30}\b(?:instructions?|rules|prompt)\b|\b(?:reveal|show|print|repeat|output|display|leak)\b[^.?!]{0,30}\b(?:your|the)\s+(?:instructions?|prompt|rules|configuration|settings)\b|\bapi[\s_-]?key\b/i;

/** A fixed reply for a message that must not reach the model, or null to let the model answer. */
export function preflight(text) {
  const message = String(text ?? '');
  if (EXTRACTION.test(message)) return SAFE_REPLIES.leak;
  if (OFF_TOPIC.test(message)) return SAFE_REPLIES.offtopic;
  if (WHERE_IS_MY.test(message) || (TRACKING_NUMBER.test(message) && /\b(?:track|tracking|shipment|load|where|status|eta|delivery)\b/i.test(message))) return SAFE_REPLIES.tracking;
  return null;
}
