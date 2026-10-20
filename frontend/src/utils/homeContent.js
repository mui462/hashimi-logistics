import { resolveSectionAppearance } from '../config/sectionAppearance';
import { brand } from '../config/brand';
import { PATHS } from '../config/paths';
import { faqs as builtInFaqs } from '../content/faqs';
import { crossBorder as builtInCrossBorder, finalCta, howItWorksSteps, serviceAreas as builtInAreas, stats as builtInStats, trustItems, whyItems } from '../content/home';
import { industries as builtInIndustries } from '../content/industries';
import { services as builtInServices } from '../content/services';
import { actionsFrom, list, text } from './siteContent';

const COUNTRY = { US: 'United States', CA: 'Canada', MX: 'Mexico' };
const asItems = (items) => list(items).map((item) => ({ icon: item.icon || 'check', title: item.title, text: item.description || '' }));

/** CMS records as the card shapes the Phase 4 sections already render. */
export const serviceCards = (items) => items.map((s) => ({ slug: s.slug, title: s.name, short: s.shortDescription || '', icon: s.icon || 'truck', image: s.image }));
export const industryCards = (items) => items.map((i) => ({ slug: i.slug, title: i.name, short: i.shortDescription || '', icon: i.icon || 'factory', image: i.image }));
export const areaCards = (items) => items.map((a) => ({ slug: a.slug || a.name, country: COUNTRY[a.country] ?? a.country, title: a.name, text: a.description || '', regions: [a.cityRegion, a.stateProvince].filter(Boolean), image: a.image }));
export const faqItems = (items) => items.map((f) => ({ id: f.id, category: f.category, q: f.question, a: f.answer }));

/** Once any record of a kind exists in the CMS it is the source of truth; until then the built-in Phase 4 content shows. */
const collection = (data, key, map, fallback) => {
  const group = data?.collections?.[key];
  return group?.configured ? map(group.items) : fallback;
};

/**
 * Everything the homepage renders, resolved field by field: CMS value when it has content, built-in otherwise.
 * `cms` may be null (loading, or the API is down), which yields exactly the Phase 4 homepage.
 */
export function resolveHome(cms, company = brand) {
  const c = cms?.configured ? cms : null;
  const sec = (name) => c?.[name] ?? {};
  const hero = c?.hero ?? {};
  const testimonials = list(cms?.collections?.testimonials?.items).map((t) => ({ id: t.id, name: t.customerName, role: t.position, company: t.company, quote: t.testimonial }));
  const statItems = list(sec('stats').items);
  const highlights = list(sec('crossBorder').highlights);
  const faqPreview = collection(cms, 'faqs', faqItems, builtInFaqs.filter((f) => f.preview).map((f) => ({ id: f.id, category: f.category, q: f.q, a: f.a })));

  return {
    configured: Boolean(c),
    order: c?.sectionOrder ?? null,
    seo: c?.seo ?? null,
    // Each section's saved look (Homepage editor); unsaved sections resolve to their built-in look.
    appearance: Object.fromEntries(['trust', 'services', 'whyChooseUs', 'howItWorks', 'industries', 'crossBorder', 'serviceAreas', 'stats', 'testimonials', 'faq', 'finalCTA'].map((key) => [key, resolveSectionAppearance({ services: 'servicesSection', stats: 'statsSection' }[key] ?? key, sec(key).appearance)])),
    hero: {
      eyebrow: text(hero.eyebrow),
      title: text(hero.title, company.name),
      subtitle: text(hero.subtitle, company.tagline),
      description: text(hero.description, brand.supportingStatement),
      actions: actionsFrom(hero.primaryButton, hero.secondaryButton, [{ label: company.primaryCta, to: PATHS.requestQuote }, { label: brand.secondaryCta, to: PATHS.becomeCarrier, variant: 'secondary' }]),
      media: hero.video?.url || hero.poster?.url ? { videoSrc: hero.video?.url ?? '', videoType: /\.webm(\?|$)/i.test(hero.video?.url ?? '') ? 'video/webm' : 'video/mp4', posterSrc: hero.poster?.url ?? '', posterAlt: hero.poster?.altText ?? '', autoplay: hero.autoplay !== false, loop: hero.loop !== false } : undefined,
      // undefined = no CMS homepage yet (the hero uses its built-in black overlay); null = the Super Admin switched the overlay off.
      overlay: c ? (hero.overlay?.enabled ? hero.overlay : null) : undefined,
    },
    sections: {
      trust: { enabled: sec('trust').enabled !== false, items: list(sec('trust').items).length ? list(sec('trust').items).map((i) => ({ icon: i.icon || 'shield', title: i.title, text: i.description || '', image: i.image ?? null })) : trustItems },
      services: { enabled: sec('services').enabled !== false, title: text(sec('services').title, undefined), description: text(sec('services').subtitle || sec('services').description, undefined), image: sec('services').image ?? null, cardImages: Object.fromEntries(list(sec('services').cardImages).map((c) => [c.slug, c.image])), items: collection(cms, 'services', serviceCards, builtInServices) },
      whyChooseUs: { enabled: sec('whyChooseUs').enabled !== false, title: text(sec('whyChooseUs').title, 'Transportation You Can Count On'), description: text(sec('whyChooseUs').description, undefined), items: list(sec('whyChooseUs').items).length ? asItems(sec('whyChooseUs').items) : whyItems },
      howItWorks: { enabled: sec('howItWorks').enabled !== false, title: text(sec('howItWorks').title, undefined), description: text(sec('howItWorks').description, undefined), steps: list(sec('howItWorks').steps).length ? list(sec('howItWorks').steps).map((s) => ({ title: s.title, text: s.description || '' })) : howItWorksSteps },
      industries: { enabled: sec('industries').enabled !== false, title: text(sec('industries').title, undefined), description: text(sec('industries').description, undefined), cardImages: Object.fromEntries(list(sec('industries').cardImages).map((c) => [c.slug, c.image])), items: collection(cms, 'industries', industryCards, builtInIndustries) },
      crossBorder: {
        enabled: sec('crossBorder').enabled !== false,
        data: {
          ...builtInCrossBorder,
          title: text(sec('crossBorder').title, builtInCrossBorder.title),
          intro: text(sec('crossBorder').description, builtInCrossBorder.intro),
          items: highlights.length ? highlights.map((line) => ({ icon: 'flag', title: line, text: '' })) : builtInCrossBorder.items,
          image: sec('crossBorder').image,
        },
      },
      serviceAreas: { enabled: sec('serviceAreas').enabled !== false, title: text(sec('serviceAreas').title, undefined), description: text(sec('serviceAreas').description, undefined), cardImages: Object.fromEntries(list(sec('serviceAreas').cardImages).map((c) => [c.slug, c.image])), items: collection(cms, 'serviceAreas', areaCards, builtInAreas) },
      stats: { enabled: sec('stats').enabled !== false, data: statItems.length ? { enabled: true, title: text(sec('stats').title, builtInStats.title), items: statItems.map((s) => ({ icon: 'gauge', label: s.label, value: s.value, text: s.description || '' })) } : { ...builtInStats, title: text(sec('stats').title, builtInStats.title) } },
      testimonials: { enabled: sec('testimonials').enabled !== false, title: text(sec('testimonials').title, undefined), items: testimonials },
      faq: { enabled: sec('faq').enabled !== false, title: text(sec('faq').title, undefined), description: text(sec('faq').description, undefined), items: faqPreview },
      finalCTA: {
        enabled: sec('finalCTA').enabled !== false,
        title: text(sec('finalCTA').title, finalCta.title),
        text: text(sec('finalCTA').description, finalCta.text),
        actions: actionsFrom(sec('finalCTA').primaryButton, sec('finalCTA').secondaryButton, undefined),
      },
    },
  };
}

export const DEFAULT_ORDER = ['trust', 'services', 'whyChooseUs', 'howItWorks', 'industries', 'crossBorder', 'serviceAreas', 'stats', 'testimonials', 'faq', 'finalCTA'];
