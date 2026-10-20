import { Link } from 'react-router-dom';
import IconByName from '../../components/common/IconByName';
import Seo from '../../components/seo/Seo';
import CTASection from '../../components/sections/CTASection';
import HeroSection from '../../components/sections/HeroSection';
import SectionShell from '../../components/sections/SectionShell';
import { PATHS } from '../../config/paths';
import { carrierResourceCards } from '../../content/pages';
import { brand } from '../../config/brand';

export default function CarrierResourcesPage() {
  return (
    <>
      <Seo title="Carrier Resources" description={`Onboarding, documents, POD instructions and support for carriers working with ${brand.name}`} path={PATHS.carrierResources} />
      <HeroSection eyebrow="Carriers" title="Carrier Resources" description="What carriers need to get started and stay informed." scene="dryvan" />
      <SectionShell id="resources-cards" labelledBy="cr-heading">
        <h2 id="cr-heading" className="sr-only">Carrier resources</h2>
        <ul className="grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
          {carrierResourceCards.map((card) => (
            <li key={card.title}>
              <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-signal-400/40 bg-gradient-to-br from-signal-400/15 via-signal-400/5 to-transparent p-6 transition duration-300 hover:-translate-y-1 hover:border-signal-500 sm:p-7">
                <span className="flex size-14 items-center justify-center rounded-xl bg-gradient-to-br from-signal-400 to-signal-500 text-ink-950 shadow-[0_8px_16px_-6px_rgb(196_154_63/0.8)] transition-transform duration-300 group-hover:scale-105">
                  <IconByName name={card.icon} className="size-7" />
                </span>
                <h3 className="mt-5 text-xl font-bold">{card.title}</h3>
                <p className="mt-2 flex-1 text-base leading-relaxed text-steel-600">{card.text}</p>
                {card.to && (
                  <Link to={card.to} className="mt-4 inline-flex min-h-11 items-center font-bold underline underline-offset-4">
                    {card.title === 'Support' ? 'Contact support' : 'Read FAQ'}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </SectionShell>
      <CTASection title="Ready to Apply?" text="Submit your carrier application online." actions={[{ label: brand.secondaryCta, to: PATHS.becomeCarrier }]} />
    </>
  );
}
