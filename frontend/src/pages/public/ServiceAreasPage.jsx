import CmsPageContent from '../../components/sections/CmsPageContent';
import Seo from '../../components/seo/Seo';
import { useCmsPage } from '../../hooks/useCmsPage';
import { useContent } from '../../hooks/useContent';
import { areaCards } from '../../utils/homeContent';
import CrossBorderSection from '../../components/sections/CrossBorderSection';
import CTASection from '../../components/sections/CTASection';
import HeroSection from '../../components/sections/HeroSection';
import ServiceAreaCards from '../../components/sections/ServiceAreaCards';
import { PATHS } from '../../config/paths';
import { crossBorder, serviceAreas } from '../../content/home';

export default function ServiceAreasPage() {
  const { page: cms } = useCmsPage('service-areas');
  const { data: cmsAreas } = useContent('/service-areas');
  const { data: cmsHome } = useContent('/homepage');
  const cardImages = Object.fromEntries((cmsHome?.configured ? cmsHome.serviceAreas?.cardImages ?? [] : []).map((c) => [c.slug, c.image]));
  const areas = cmsAreas?.configured ? areaCards(cmsAreas.items) : serviceAreas;
  return (
    <>
      <Seo title="Service Areas" description="Freight coordinated across the United States, Canada and Mexico: U.S. domestic, U.S. to Canada and U.S. to Mexico." path={PATHS.serviceAreas} seo={cms?.seo} />
      <HeroSection eyebrow="Service Areas" title="Coverage Across North America" description="United States, Canada and Mexico: domestic and cross-border freight." scene="border" cms={cms} />
      <CmsPageContent page={cms} />
      <ServiceAreaCards showcase cardImages={cardImages} areas={areas} id="regions" title="United States, Canada and Mexico" />
      <CrossBorderSection data={crossBorder} />
      <CTASection title="Ready to Move Your Freight?" text="Tell us your pickup and delivery locations and we will help coordinate the move." />
    </>
  );
}
