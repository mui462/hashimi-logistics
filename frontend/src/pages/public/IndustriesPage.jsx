import CmsPageContent from '../../components/sections/CmsPageContent';
import Seo from '../../components/seo/Seo';
import { useCmsPage } from '../../hooks/useCmsPage';
import { useContent } from '../../hooks/useContent';
import { industryCards } from '../../utils/homeContent';
import CTASection from '../../components/sections/CTASection';
import HeroSection from '../../components/sections/HeroSection';
import IndustryGrid from '../../components/sections/IndustryGrid';
import IntroSplit from '../../components/sections/IntroSplit';
import { PATHS } from '../../config/paths';
import { industries } from '../../content/industries';
import { finalCta } from '../../content/home';

export default function IndustriesPage() {
  const { page: cms } = useCmsPage('industries');
  const { data: cmsIndustries } = useContent('/industries');
  const { data: cmsHome } = useContent('/homepage');
  const cardImages = Object.fromEntries((cmsHome?.configured ? cmsHome.industries?.cardImages ?? [] : []).map((c) => [c.slug, c.image]));
  const items = cmsIndustries?.configured ? industryCards(cmsIndustries.items) : industries;
  return (
    <>
      <Seo title="Industries" description="Freight transportation for manufacturing, construction, automotive, retail, food and beverage, agriculture, industrial and consumer goods." path={PATHS.industries} seo={cms?.seo} />
      <HeroSection eyebrow="Industries" title="Freight Expertise Across Industries" description="Transportation coordinated around how your industry ships." scene="warehouse" cms={cms} />
      <CmsPageContent page={cms} />
      <IndustryGrid showcase industries={items} cardImages={cardImages} id="industry-grid" title="Industries We Serve" tone="default" />
      <IntroSplit
        tone="muted"
        id="why-industry"
        eyebrow="Why it matters"
        title="Why Industry Expertise Matters"
        paragraphs={[
          'Different freight has different needs: equipment type, loading method, temperature, timing and delivery requirements all vary by industry.',
          'Understanding how your industry ships helps us ask the right questions up front and coordinate the right carrier and equipment for each move.',
        ]}
        media={{ scene: 'warehouse', alt: '' }}
      />
      <CTASection {...finalCta} />
    </>
  );
}
