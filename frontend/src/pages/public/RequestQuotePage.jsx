import QuoteForm from '../../components/forms/QuoteForm';
import CmsPageContent from '../../components/sections/CmsPageContent';
import { useCmsPage } from '../../hooks/useCmsPage';
import Seo from '../../components/seo/Seo';
import HeroSection from '../../components/sections/HeroSection';
import SectionShell from '../../components/sections/SectionShell';
import FormCard from '../../components/common/FormCard';
import Button from '../../components/common/Button';
import { howItWorksSteps } from '../../content/home';
import { PATHS } from '../../config/paths';
import { brand } from '../../config/brand';

export default function RequestQuotePage() {
  const { page: cms } = useCmsPage('request-quote');
  return (
    <>
      <Seo title="Request a Quote" description={`Request a freight quote from ${brand.name} Tell us about your shipment in a few steps.`} path={PATHS.requestQuote} seo={cms?.seo} />
      <HeroSection eyebrow="Request a Quote" title="Request a Freight Quote" description="Tell us about your shipment in five short steps." scene="loading" cms={cms} />
      <CmsPageContent page={cms} />
      <SectionShell id="quote-form" labelledBy="quote-form-heading">
        <h2 id="quote-form-heading" className="sr-only">Quote request form</h2>
        <div className="grid items-start gap-8 lg:grid-cols-[1.7fr_1fr]">
          <FormCard>
            <QuoteForm />
          </FormCard>
          <aside aria-label="What happens next" className="space-y-5 lg:sticky lg:top-40">
            <div className="rounded-3xl border border-signal-400/40 bg-gradient-to-br from-signal-400/15 via-signal-400/5 to-transparent p-6 sm:p-7">
              <h2 className="text-xl font-extrabold">What happens next</h2>
              <ol className="mt-5 space-y-5">
                {howItWorksSteps.slice(0, 3).map((step, index) => (
                  <li key={step.title} className="flex gap-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-signal-400 to-signal-500 text-base font-extrabold text-ink-950" aria-hidden="true">{index + 1}</span>
                    <div>
                      <h3 className="text-base font-bold">{step.title}</h3>
                      <p className="mt-1 text-base text-steel-600">{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-3xl border border-steel-200 bg-white p-6 sm:p-7">
              <h2 className="text-lg font-extrabold">Questions first?</h2>
              <p className="mt-2 text-base text-steel-600">Read the answers to common questions or send our team a message.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button to={PATHS.faq} variant="secondary" size="sm">Read the FAQ</Button>
                <Button to={PATHS.contact} variant="secondary" size="sm">Contact us</Button>
              </div>
            </div>
          </aside>
        </div>
      </SectionShell>
    </>
  );
}
