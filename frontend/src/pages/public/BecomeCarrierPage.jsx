import CarrierApplicationForm from '../../components/forms/CarrierApplicationForm';
import Seo from '../../components/seo/Seo';
import BulletSection from '../../components/sections/BulletSection';
import CTASection from '../../components/sections/CTASection';
import FeatureGrid from '../../components/sections/FeatureGrid';
import HeroSection from '../../components/sections/HeroSection';
import SectionShell from '../../components/sections/SectionShell';
import SectionHeading from '../../components/common/SectionHeading';
import FormCard from '../../components/common/FormCard';
import { PATHS } from '../../config/paths';
import { carrierRequirements, carrierSections } from '../../content/pages';
import { brand } from '../../config/brand';

export default function BecomeCarrierPage() {
  return (
    <>
      <Seo title="Become a Carrier" description={`Apply to haul freight with ${brand.name}`} path={PATHS.becomeCarrier} />
      <HeroSection eyebrow="Carriers" title="Become a Carrier" description={`Apply to haul domestic and cross-border freight with ${brand.shortName}.`} scene="flatbed" actions={[{ label: 'Start Application', href: '#apply' }]} />
      <FeatureGrid id="why-partner" eyebrow="Why partner" title="Why Partner With Us" items={carrierSections.slice(0, 3)} tone="default" />
      <FeatureGrid id="carrier-benefits" eyebrow="Benefits" title="Carrier Benefits" items={carrierSections.slice(3)} tone="dark" />
      <BulletSection id="requirements" eyebrow="Requirements" title="Requirements" description="Our team confirms exact requirements during onboarding." items={carrierRequirements} />
      <SectionShell id="apply" tone="muted" labelledBy="apply-heading">
        <div className="mx-auto max-w-4xl">
          <SectionHeading id="apply-heading" eyebrow="Application" title="Carrier Application" description="Complete the form below. We never mark an application as submitted unless our server confirms it." />
          <FormCard>
            <CarrierApplicationForm />
          </FormCard>
        </div>
      </SectionShell>
      <CTASection title="Questions Before You Apply?" text="Read the carrier resources or contact our team." actions={[{ label: 'Carrier Resources', to: PATHS.carrierResources }, { label: 'Contact Us', to: PATHS.contact, variant: 'secondary' }]} />
    </>
  );
}
