import CmsPageContent from '../../components/sections/CmsPageContent';
import Seo from '../../components/seo/Seo';
import { useCmsPage } from '../../hooks/useCmsPage';
import CTASection from '../../components/sections/CTASection';
import BulletSection from '../../components/sections/BulletSection';
import FeatureGrid from '../../components/sections/FeatureGrid';
import IntroSplit from '../../components/sections/IntroSplit';
import HeroSection from '../../components/sections/HeroSection';
import { PATHS } from '../../config/paths';
import { carrierRequirements, carrierSections } from '../../content/pages';
import { brand } from '../../config/brand';

export default function ForCarriersPage() {
  const { page: cms } = useCmsPage('for-carriers');
  return (
    <>
      <Seo title="For Carriers" description={`Carriers: haul domestic and cross-border freight with ${brand.name} Apply online.`} path={PATHS.forCarriers} seo={cms?.seo} />
      <HeroSection eyebrow="For Carriers" title={`Grow With ${brand.shortName}`} description="Partner with a brokerage that coordinates domestic and cross-border freight." scene="flatbed" actions={[{ label: brand.secondaryCta, to: PATHS.becomeCarrier }, { label: 'Carrier Resources', to: PATHS.carrierResources, variant: 'secondary' }]} cms={cms} />
      <CmsPageContent page={cms} />
      <IntroSplit
        id="carrier-intro"
        eyebrow="For carriers"
        title="A brokerage that works with carriers"
        paragraphs={[
          `${brand.name} coordinates domestic and cross-border freight for shippers and works with carriers to move it.`,
          'Apply online and our team will review your application. We confirm the exact requirements during onboarding.',
        ]}
        highlights={['Domestic and cross-border lanes', 'Online application and documents', 'Clear pickup and delivery details', 'A coordination team that supports carriers']}
        media={{ image: cms?.introImage, scene: 'flatbed', alt: '' }}
      />
      <FeatureGrid id="carrier-benefits" eyebrow="Carriers" title="Working With Us" items={carrierSections} tone="muted" />
      <BulletSection id="carrier-requirements" eyebrow="Requirements" title="What Carriers Need to Apply" description="Our team confirms exact requirements during onboarding." items={carrierRequirements} />
      <CTASection title="Become a Carrier" text="Apply online and our team will review your application." actions={[{ label: brand.secondaryCta, to: PATHS.becomeCarrier }]} />
    </>
  );
}
