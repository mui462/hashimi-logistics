/**
 * Turns the website's own content modules (frontend/src/content/*) into the chatbot's knowledge: a list of short text chunks, each
 * with the page it comes from, and the list of real website routes the assistant may point visitors to.
 *
 * The chunks are generated, not hand-written: `npm run chatbot:sync` rebuilds knowledge.data.json from the frontend content, and a test
 * fails when the file is out of date. Nothing here invents company facts; it only reshapes text the website already shows.
 */
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const list = (items) => (items ?? []).map(clean).filter(Boolean).join('; ');
const sentence = (text) => {
  const value = clean(text);
  return value && !/[.!?]$/.test(value) ? `${value}.` : value;
};

export function buildKnowledge({ brand, contactDetails, PATHS, services, industries, faqs, home, pages }) {
  const chunks = [];
  const add = (id, title, url, ...parts) => {
    const text = parts.map(sentence).filter(Boolean).join(' ');
    if (text) chunks.push({ id, title: clean(title), url, text });
  };

  add('company', `About ${brand.name}`, PATHS.about,
    `${brand.name} is a freight brokerage. ${brand.tagline}`, brand.supportingStatement, ...pages.about.who,
    `Mission: ${pages.about.mission}`, `Vision: ${pages.about.vision}`,
    `Values: ${pages.about.values.map((v) => `${v.title} (${v.text})`).join(' ')}`);

  add('trust', 'What sets us apart', PATHS.about, ...home.trustItems.map((t) => `${t.title}: ${t.text}`));
  add('why', 'Why choose us', PATHS.home, ...home.whyItems.map((w) => `${w.title}: ${w.text}`));

  for (const service of services) {
    add(`service-${service.slug}`, service.title, `${PATHS.services}/${service.slug}`,
      service.short, service.intro, `Freight it handles: ${list(service.handles)}`, `Benefits: ${list(service.benefits)}`,
      `Equipment: ${list(service.equipment)}`,
      `Industries it commonly serves: ${service.industries.map((slug) => industries.find((i) => i.slug === slug)?.title ?? slug).join(', ')}`);
  }
  add('services-overview', 'Freight services', PATHS.services, `Services offered: ${services.map((s) => s.title).join(', ')}`);

  for (const industry of industries) {
    add(`industry-${industry.slug}`, `${industry.title} freight`, `${PATHS.industries}/${industry.slug}`,
      industry.short, industry.overview, `Typical freight: ${list(industry.typical)}`, `Planning considerations: ${list(industry.considerations)}`,
      `Relevant services: ${industry.services.map((slug) => services.find((s) => s.slug === slug)?.title ?? slug).join(', ')}`);
  }
  add('industries-overview', 'Industries served', PATHS.industries, `Industries served: ${industries.map((i) => i.title).join(', ')}`);

  add('service-areas', 'Service areas', PATHS.serviceAreas, ...home.serviceAreas.map((a) => `${a.title}: ${a.text}`),
    `Cross-border: ${home.crossBorder.intro}`, ...home.crossBorder.lanes.map((l) => `${l.title}: ${l.text}`), home.crossBorder.disclaimer);
  add('cross-border', home.crossBorder.title, PATHS.serviceAreas, home.crossBorder.intro,
    ...home.crossBorder.items.map((i) => `${i.title}: ${i.text}`), home.crossBorder.disclaimer);

  add('for-shippers', 'For shippers', PATHS.forShippers, ...pages.shipperSections.map((s) => `${s.title}: ${s.text}`));
  add('for-carriers', 'For carriers', PATHS.forCarriers, ...pages.carrierSections.map((s) => `${s.title}: ${s.text}`),
    `Requirements our team confirms during onboarding: ${list(pages.carrierRequirements)}`);
  add('carrier-resources', 'Carrier resources', PATHS.carrierResources, ...pages.carrierResourceCards.map((c) => `${c.title}: ${c.text}`));
  add('become-carrier', 'Become a carrier', PATHS.becomeCarrier,
    'Carriers apply online on the Become a Carrier page. Our team reviews the application and contacts the applicant about next steps.',
    `Requirements our team confirms during onboarding: ${list(pages.carrierRequirements)}`);

  add('how-it-works', 'How it works', PATHS.howItWorks, ...home.detailedSteps.map((s, i) => `Step ${i + 1}, ${s.title}: ${s.text}`));
  add('request-quote', 'Request a quote', PATHS.requestQuote,
    'Quote requests are made on the Request a Quote page, in five short steps: pickup and delivery, freight details, transportation, contact and additional information.',
    'The assistant cannot price a shipment, submit a quote or book freight.');
  add('track-shipment', 'Track a shipment', PATHS.trackShipment,
    'The Track Shipment page looks up a shipment with the tracking number provided by our team.',
    'The assistant cannot look up or state the status of any shipment.');

  for (const faq of faqs) add(`faq-${faq.id}`, faq.q, PATHS.faq, faq.q, faq.a);

  const contactBits = [
    contactDetails.phone && `Phone: ${contactDetails.phone}`,
    contactDetails.email && `Email: ${contactDetails.email}`,
    contactDetails.address && `Address: ${contactDetails.address}`,
    contactDetails.businessHours && `Business hours: ${contactDetails.businessHours}`,
  ].filter(Boolean);
  add('contact', 'Contact', PATHS.contact,
    contactBits.length > 0 ? contactBits.join('. ') : 'No phone number, email address or street address is published in the built-in website content.',
    'The Contact page has a form for sending the team a message.');
  add('legal', 'Privacy Policy and Terms', PATHS.privacy,
    'The Privacy Policy and Terms and Conditions pages are placeholder structures that have not been finalised. Their legal text is not available.');

  const routes = [
    ['Home', PATHS.home], ['About', PATHS.about], ['Services', PATHS.services], ['Industries', PATHS.industries],
    ['Service Areas', PATHS.serviceAreas], ['For Shippers', PATHS.forShippers], ['For Carriers', PATHS.forCarriers],
    ['How It Works', PATHS.howItWorks], ['Track Shipment', PATHS.trackShipment], ['Request a Quote', PATHS.requestQuote],
    ['Become a Carrier', PATHS.becomeCarrier], ['Carrier Resources', PATHS.carrierResources], ['Resources', PATHS.resources],
    ['FAQ', PATHS.faq], ['Contact', PATHS.contact], ['Privacy Policy', PATHS.privacy], ['Terms and Conditions', PATHS.terms],
    ...services.map((s) => [s.title, `${PATHS.services}/${s.slug}`]),
    ...industries.map((i) => [`${i.title} freight`, `${PATHS.industries}/${i.slug}`]),
  ].map(([label, path]) => ({ label, path }));

  return { company: { name: brand.name, tagline: brand.tagline, supportingStatement: brand.supportingStatement }, routes, chunks };
}
