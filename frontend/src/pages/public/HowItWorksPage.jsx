import CmsPageContent from '../../components/sections/CmsPageContent';
import Seo from '../../components/seo/Seo';
import { useCmsPage } from '../../hooks/useCmsPage';
import CTASection from '../../components/sections/CTASection';
import HeroSection from '../../components/sections/HeroSection';
import StepsSection from '../../components/sections/StepsSection';
import { PATHS } from '../../config/paths';
import { detailedSteps, finalCta } from '../../content/home';
import { brand } from '../../config/brand';

export default function HowItWorksPage() {
  const { page: cms } = useCmsPage('how-it-works');
  return (
    <>
      <Seo title="How It Works" description={`From quote request to delivery: how ${brand.name} coordinates your shipment.`} path={PATHS.howItWorks} seo={cms?.seo} />
      <HeroSection eyebrow="Process" title="How It Works" description="From your first request to delivery, in seven steps." scene="loading" actions={[{ label: brand.primaryCta, to: PATHS.requestQuote }]} cms={cms} />
      <CmsPageContent page={cms} />
      <StepsSection steps={detailedSteps} id="steps" title="Seven Steps From Request to Delivery" />
      <CTASection {...finalCta} />
    </>
  );
}
