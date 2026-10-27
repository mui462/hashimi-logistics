import CmsPageContent from '../../components/sections/CmsPageContent';
import Seo from '../../components/seo/Seo';
import { useCmsPage } from '../../hooks/useCmsPage';
import { useContent } from '../../hooks/useContent';
import { serviceCards } from '../../utils/homeContent';
import CTASection from '../../components/sections/CTASection';
import FeatureGrid from '../../components/sections/FeatureGrid';
import HeroSection from '../../components/sections/HeroSection';
import IntroSplit from '../../components/sections/IntroSplit';
import ServiceGrid from '../../components/sections/ServiceGrid';
import StepsSection from '../../components/sections/StepsSection';
import { PATHS } from '../../config/paths';
import { howItWorksSteps, whyItems, finalCta } from '../../content/home';
import { services } from '../../content/services';
import { brand } from '../../config/brand';

export default function ServicesPage() {
  const { page: cms } = useCmsPage('services');
  const { data: cmsServices } = useContent('/services');
  const { data: cmsHome } = useContent('/homepage');
  // The pictures a Super Admin chose for the service cards on the homepage; without them the built-in card pictures show.
  const cardImages = Object.fromEntries((cmsHome?.configured ? cmsHome.services?.cardImages ?? [] : []).map((c) => [c.slug, c.image]));
  const items = cmsServices?.configured ? serviceCards(cmsServices.items) : services;
  return (
    <>
      <Seo title="Freight Services" description={`Full truckload, LTL, dry van, reefer, flatbed, expedited, specialized and cross-border freight coordinated by ${brand.name}.`} path={PATHS.services} seo={cms?.seo} />
      <HeroSection eyebrow="Services" title="Freight Services" description="Truckload and LTL transportation, domestic and cross-border, coordinated around your shipment." scene="highway" actions={[{ label: brand.primaryCta, to: PATHS.requestQuote }]} cms={cms} />
      <CmsPageContent page={cms} />
      <IntroSplit
        id="intro"
        eyebrow="Our services"
        title="One partner for the freight you move"
        paragraphs={['Every shipment is different. Choose the service that matches your freight, or tell us about it and we will help you decide.']}
        highlights={['Full truckload and LTL', 'Dry van, reefer and flatbed', 'Expedited and specialized freight', 'Cross-border: U.S., Canada and Mexico']}
        media={{ image: cms?.introImage, scene: 'highway', alt: '' }}
      />
      <ServiceGrid services={items} cardImages={cardImages} id="service-grid" eyebrow="All services" title="Choose a Service" tone="muted" />
      <FeatureGrid id="why-choose-us" eyebrow="Why choose us" title={`Why Choose ${brand.shortName}`} items={whyItems} tone="dark" />
      <StepsSection steps={howItWorksSteps} />
      <CTASection {...finalCta} />
    </>
  );
}
