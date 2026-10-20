import { Info } from 'lucide-react';
import CmsPageContent from '../../components/sections/CmsPageContent';
import Seo from '../../components/seo/Seo';
import { useCmsPage } from '../../hooks/useCmsPage';
import HeroSection from '../../components/sections/HeroSection';
import SectionShell from '../../components/sections/SectionShell';
import { brand, contactDetails } from '../../config/brand';
import { PATHS } from '../../config/paths';
import { legal } from '../../content/pages';

function LegalDocument({ title, path, sections, description, pageKey }) {
  const { page: cms } = useCmsPage(pageKey);
  // A published CMS version replaces the built-in template entirely (the template is only a placeholder structure).
  if (cms && (cms.content || cms.sections?.length)) {
    return (
      <>
        <Seo title={title} description={description} path={path} seo={cms.seo} />
        <HeroSection title={title} description={brand.name} scene="dryvan" cms={cms} />
        <CmsPageContent page={cms} id="legal" />
      </>
    );
  }
  return (
    <>
      <Seo title={title} description={description} path={path} />
      <HeroSection title={title} description={`${brand.name}`} scene="dryvan" />
      <SectionShell id="legal" labelledBy="legal-heading">
        <div className="mx-auto max-w-3xl">
          <h2 id="legal-heading" className="sr-only">{title}</h2>
          <div className="mb-10 flex gap-3 rounded-2xl border border-signal-400/40 bg-gradient-to-br from-signal-400/15 via-signal-400/5 to-transparent p-5 text-base">
            <Info className="mt-1 size-5 shrink-0" aria-hidden="true" />
            <p>{legal.notice}</p>
          </div>
          <p className="mb-8 text-base text-steel-600">
            Company: {brand.name}
            {contactDetails.address && ` · ${contactDetails.address}`}
            {contactDetails.email && ` · ${contactDetails.email}`}
          </p>
          <ol className="space-y-4">
            {sections.map((section, index) => (
              <li key={section.title} className="rounded-2xl border border-steel-200 bg-white p-6">
                <h3 className="text-xl font-extrabold">{index + 1}. {section.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-steel-600">{section.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </SectionShell>
    </>
  );
}

export function PrivacyPolicyPage() {
  return <LegalDocument title="Privacy Policy" path={PATHS.privacy} pageKey="privacy" sections={legal.privacy} description={`Privacy policy structure for ${brand.name} (placeholder).`} />;
}

export function TermsPage() {
  return <LegalDocument title="Terms and Conditions" path={PATHS.terms} pageKey="terms" sections={legal.terms} description={`Terms and conditions structure for ${brand.name} (placeholder).`} />;
}
