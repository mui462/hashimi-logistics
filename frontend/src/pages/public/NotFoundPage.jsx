import Seo from '../../components/seo/Seo';
import { Link } from 'react-router-dom';
import SectionShell from '../../components/sections/SectionShell';
import Button from '../../components/common/Button';
import HeroSection from '../../components/sections/HeroSection';
import { PATHS } from '../../config/paths';

export default function NotFoundPage({ title = 'Page not found', message = 'The page you are looking for does not exist or may have moved.' }) {
  return (
    <>
      <Seo title={title} robots="noindex,follow" />
      <HeroSection title={title} description={message} scene="highway">
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button to={PATHS.home} tone="dark" size="lg">Back to home</Button>
          <Button to={PATHS.services} tone="dark" size="lg" variant="secondary">View services</Button>
        </div>
      </HeroSection>
      <SectionShell id="helpful-links" labelledBy="helpful-links-heading">
        <h2 id="helpful-links-heading" className="mb-6 text-2xl font-extrabold">Where would you like to go?</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Services', text: 'Truckload, LTL and more.', to: PATHS.services },
            { label: 'Request a Quote', text: 'Tell us about your shipment.', to: PATHS.requestQuote },
            { label: 'Track Shipment', text: 'Look up a tracking number.', to: PATHS.trackShipment },
            { label: 'Contact', text: 'Send our team a message.', to: PATHS.contact },
          ].map((link) => (
            <li key={link.label}>
              <Link to={link.to} className="group flex h-full flex-col rounded-2xl border border-signal-400/40 bg-gradient-to-br from-signal-400/15 via-signal-400/5 to-transparent p-6 transition duration-300 hover:-translate-y-1 hover:border-signal-500">
                <span className="text-lg font-bold">{link.label}</span>
                <span className="mt-1 text-base text-steel-600">{link.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </SectionShell>
    </>
  );
}
