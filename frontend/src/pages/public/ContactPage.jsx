import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import FormCard from '../../components/common/FormCard';
import ContactForm from '../../components/forms/ContactForm';
import CmsPageContent from '../../components/sections/CmsPageContent';
import Seo from '../../components/seo/Seo';
import { useSiteContent } from '../../context/SiteContentContext';
import { useCmsPage } from '../../hooks/useCmsPage';
import HeroSection from '../../components/sections/HeroSection';
import SectionShell from '../../components/sections/SectionShell';
import { brand, contactDetails } from '../../config/brand';
import { PATHS } from '../../config/paths';

export default function ContactPage() {
  const { page: cms } = useCmsPage('contact');
  const contact = useSiteContent()?.contact ?? contactDetails;
  const hours = Array.isArray(contact.businessHours) ? contact.businessHours.join('; ') : contact.businessHours;
  const rows = [
    { icon: Phone, label: 'Phone', value: contact.phone },
    { icon: Mail, label: 'Email', value: contact.email },
    { icon: MapPin, label: 'Address', value: contact.address },
    { icon: Clock, label: 'Business hours', value: hours },
  ].filter((row) => row.value);

  return (
    <>
      <Seo title="Contact Us" description={`Contact ${brand.name} about shipping, carrier opportunities or general questions.`} path={PATHS.contact} seo={cms?.seo} />
      <HeroSection eyebrow="Contact" title="Let’s Talk About Your Freight" description="Send us a message and our team will follow up." scene="highway" cms={cms} />
      <CmsPageContent page={cms} />
      <SectionShell id="contact" labelledBy="contact-heading">
        <div className="grid gap-10 lg:grid-cols-[1.7fr_1fr]">
          <div>
            <h2 id="contact-heading" className="mb-6 text-3xl font-extrabold">Send a message</h2>
            <FormCard>
              <ContactForm />
            </FormCard>
          </div>
          <aside aria-label="Contact details" className="self-start rounded-3xl border border-signal-400/40 bg-gradient-to-br from-signal-400/15 via-signal-400/5 to-transparent p-6 sm:p-7">
            <h2 className="text-xl font-extrabold">Contact details</h2>
            {rows.length > 0 ? (
              <ul className="mt-4 space-y-4 text-base">
                {rows.map(({ icon: Icon, label, value }) => (
                  <li key={label} className="flex gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-signal-400 to-signal-500 text-ink-950"><Icon className="size-5" aria-hidden="true" /></span>
                    <span><span className="sr-only">{label}: </span>{value}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-base text-steel-600">Phone, email and address details will be published here. Use the form to reach our team in the meantime.</p>
            )}
          </aside>
        </div>
      </SectionShell>
    </>
  );
}
