import CmsPageContent from '../../components/sections/CmsPageContent';
import Seo from '../../components/seo/Seo';
import { useCmsPage } from '../../hooks/useCmsPage';
import CTASection from '../../components/sections/CTASection';
import FeatureGrid from '../../components/sections/FeatureGrid';
import IntroSplit from '../../components/sections/IntroSplit';
import StepsSection from '../../components/sections/StepsSection';
import HeroSection from '../../components/sections/HeroSection';
import { PATHS } from '../../config/paths';
import { shipperSections } from '../../content/pages';
import { howItWorksSteps } from '../../content/home';

export default function ForShippersPage() {
  const { page: cms } = useCmsPage('for-shippers');
  return (
    <>
      <Seo title="For Shippers" description="Freight coordination for shippers: carrier network, shipment visibility, flexible transportation and cross-border support." path={PATHS.forShippers} seo={cms?.seo} />
      <HeroSection eyebrow="For Shippers" title="Your Freight. Our Coordination." description="One team coordinating pickup, transit and delivery." scene="loading" actions={[{ label: 'Request a Freight Quote', to: PATHS.requestQuote }, { label: 'Track Your Shipment', to: PATHS.trackShipment, variant: 'secondary' }]} cms={cms} />
      <CmsPageContent page={cms} />
      <IntroSplit
        id="shipper-intro"
        eyebrow="For shippers"
        title="One team from request to delivery"
        paragraphs={[
          'Tell us what you need to move and our team coordinates pickup, transit and delivery, matching your freight with suitable carriers and equipment.',
          'Whether it is a single shipment or a recurring lane, domestic or between the U.S., Canada and Mexico, you deal with one team.',
        ]}
        highlights={['Truckload and LTL', 'Domestic and cross-border', 'Tracking by tracking number', 'One coordination team']}
        media={{ image: cms?.introImage, scene: 'loading', alt: '' }}
      />
      <FeatureGrid id="shipper-benefits" eyebrow="Shippers" title="What You Can Expect" items={shipperSections} tone="muted" />
      <StepsSection steps={howItWorksSteps} id="shipper-steps" title="How Shipping With Us Works" />
      <CTASection title="Request a Freight Quote" text="Tell us what you need to move and our team will help coordinate the right transportation solution." actions={[{ label: 'Request a Freight Quote', to: PATHS.requestQuote }, { label: 'Track Your Shipment', to: PATHS.trackShipment, variant: 'secondary' }]} />
    </>
  );
}
