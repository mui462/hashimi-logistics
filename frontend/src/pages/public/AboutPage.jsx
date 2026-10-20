import CmsPageContent from '../../components/sections/CmsPageContent';
import Seo from '../../components/seo/Seo';
import { useCmsPage } from '../../hooks/useCmsPage';
import { Approach, Commitment, Mission, SetsUsApart, WhoWeAre } from '../../components/sections/AboutSections';
import CTASection from '../../components/sections/CTASection';
import HeroSection from '../../components/sections/HeroSection';
import { PATHS } from '../../config/paths';
import { brand } from '../../config/brand';
import { resolveAbout } from '../../utils/aboutContent';

export default function AboutPage() {
  const { page: cms } = useCmsPage('about');
  const about = resolveAbout(cms);
  const slot = Object.fromEntries(about.slots.map((entry) => [entry.key, entry]));
  const cards = about.slots.filter((entry) => entry.key.startsWith('card-') && entry.visible);
  // Text a Super Admin wrote outside the built-in sections: the summary and main text come first, other sections and the button after.
  const intro = cms ? { ...cms, sections: [], cta: null } : null;
  const extra = cms ? { ...cms, content: null, excerpt: null, sections: about.extra } : null;
  return (
    <>
      <Seo title="About Us" description={`Learn about ${brand.name}, a freight brokerage coordinating domestic and cross-border transportation across North America.`} path={PATHS.about} seo={cms?.seo} />
      <HeroSection title="Moving Freight. Building Trust." description="Freight brokerage and transportation solutions for shippers and carriers across North America." scene="dryvan" cms={cms} />
      <CmsPageContent page={intro} />
      {slot.who.visible && <WhoWeAre slot={slot.who} />}
      {slot.mission.visible && <Mission slot={slot.mission} />}
      {slot.approach.visible && <Approach slot={slot.approach} />}
      <SetsUsApart intro={slot.apart} cards={cards} />
      {slot.commitment.visible && <Commitment slot={slot.commitment} />}
      <CmsPageContent page={extra} id="cms-more" />
      {slot.cta.visible && (
        <CTASection
          title={slot.cta.heading}
          text={slot.cta.body}
          actions={[
            { label: 'Request a Quote', to: PATHS.requestQuote },
            { label: 'Become a Carrier', to: PATHS.becomeCarrier, variant: 'secondary' },
          ]}
        />
      )}
    </>
  );
}
