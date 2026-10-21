import Seo from '../../components/seo/Seo';
import CrossBorderSection from '../../components/sections/CrossBorderSection';
import CTASection from '../../components/sections/CTASection';
import FAQSection from '../../components/sections/FAQSection';
import FeatureGrid from '../../components/sections/FeatureGrid';
import HeroSection from '../../components/sections/HeroSection';
import HomeQuoteSection from '../../components/sections/HomeQuoteSection';
import NetworkMapSection from '../../components/sections/NetworkMapSection';
import IndustryGrid from '../../components/sections/IndustryGrid';
import ServiceAreaCards from '../../components/sections/ServiceAreaCards';
import ServiceGrid from '../../components/sections/ServiceGrid';
import StatsSection from '../../components/sections/StatsSection';
import StepsSection from '../../components/sections/StepsSection';
import TestimonialSection from '../../components/sections/TestimonialSection';
import TrustStrip from '../../components/sections/TrustStrip';
import { brand } from '../../config/brand';
import { PATHS } from '../../config/paths';
import { useSiteContent } from '../../context/SiteContentContext';
import { useContent } from '../../hooks/useContent';
import { DEFAULT_ORDER, resolveHome } from '../../utils/homeContent';
import { SectionAppearanceContext, toneForBackground } from '../../config/sectionAppearance';

// Section order, visibility and text come from the CMS (/content/homepage, one grouped request). While that loads, or if it
// fails, or before anything is customised, the page is exactly the built-in Phase 4 homepage: it is never blank.
export default function HomePage() {
  const { data } = useContent('/homepage');
  const site = useSiteContent();
  const company = site?.company ?? brand;
  const home = resolveHome(data, company);
  const { sections: s } = home;
  const optional = (value) => value || undefined;
  // A section's saved background preset as its tone; "default" keeps the section's built-in tone.
  const tone = (key, builtIn) => toneForBackground(home.appearance?.[key]?.background, builtIn);

  const render = {
    trust: () => <TrustStrip key="trust" items={s.trust.items} />,
    services: () => <ServiceGrid key="services" tone={tone('services', 'default')} services={s.services.items} title={optional(s.services.title)} description={s.services.description} backgroundImage={s.services.image} cardImages={s.services.cardImages} />,
    whyChooseUs: () => <FeatureGrid key="why" showcase id="why-hashimi" eyebrow="Why Hashimi" title={s.whyChooseUs.title} description={s.whyChooseUs.description} items={s.whyChooseUs.items} tone={tone('whyChooseUs', 'dark')} />,
    howItWorks: () => <StepsSection key="how" tone={tone('howItWorks', 'default')} steps={s.howItWorks.steps} title={optional(s.howItWorks.title)} description={s.howItWorks.description} />,
    industries: () => <IndustryGrid key="industries" showcase tone={tone('industries', 'muted')} industries={s.industries.items} title={optional(s.industries.title)} description={s.industries.description} cardImages={s.industries.cardImages} />,
    crossBorder: () => <CrossBorderSection key="cross" data={s.crossBorder.data} />,
    serviceAreas: () => <ServiceAreaCards key="areas" showcase cardImages={s.serviceAreas.cardImages} tone={tone('serviceAreas', 'default')} areas={s.serviceAreas.items} title={optional(s.serviceAreas.title)} description={s.serviceAreas.description} />,
    stats: () => <StatsSection key="stats" stats={s.stats.data} />,
    testimonials: () => <TestimonialSection key="testimonials" testimonials={s.testimonials.items} title={optional(s.testimonials.title)} />,
    faq: () => <FAQSection key="faq" items={s.faq.items} title={optional(s.faq.title)} description={s.faq.description} tone={tone('faq', 'muted')} />,
    finalCTA: () => <CTASection key="cta" title={s.finalCTA.title} text={s.finalCTA.text} actions={s.finalCTA.actions} />,
  };
  // The quote form and the FAQ always close the page (quote form, then FAQ, then the footer), whatever order the CMS saved.
  const order = (home.order ?? DEFAULT_ORDER).filter((key) => key !== 'faq');
  const showFaq = render.faq && s.faq?.enabled;

  return (
    <>
      <Seo title={company.tagline} path={PATHS.home} seo={home.seo} />
      <HeroSection variant="home" eyebrow={home.hero.eyebrow || undefined} title={home.hero.title} subtitle={home.hero.subtitle} description={home.hero.description} actions={home.hero.actions} media={home.hero.media} overlay={home.hero.overlay} />
      {order.map((key) =>
        render[key] && s[key]?.enabled ? (
          <SectionAppearanceContext.Provider key={key} value={home.appearance[key]}>
            {render[key]()}
          </SectionAppearanceContext.Provider>
        ) : null
      )}
      {s.network.enabled && <NetworkMapSection eyebrow={s.network.eyebrow} title={s.network.title} description={s.network.description} pillars={s.network.pillars} action={s.network.action} />}
      {s.quote.enabled && <HomeQuoteSection eyebrow={s.quote.eyebrow} title={s.quote.title} description={s.quote.description} />}
      {showFaq && (
        <SectionAppearanceContext.Provider value={home.appearance.faq}>{render.faq()}</SectionAppearanceContext.Provider>
      )}
    </>
  );
}
