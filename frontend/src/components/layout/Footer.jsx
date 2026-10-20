import { Link } from 'react-router-dom';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { brand, contactDetails, socialLinks } from '../../config/brand';
import { footerLinks, legalLinks } from '../../config/navigation';
import { PATHS } from '../../config/paths';
import { useSiteContent } from '../../context/SiteContentContext';
import Container from '../common/Container';
import Logo from '../common/Logo';

const linkClasses = 'inline-flex min-h-11 items-center text-base text-steel-200 underline-offset-4 hover:text-white hover:underline';

const SOCIAL_LABELS = { linkedin: 'LinkedIn', facebook: 'Facebook', instagram: 'Instagram', x: 'X', youtube: 'YouTube', tiktok: 'TikTok' };

export default function Footer({
  company: companyProp,
  contact: contactProp,
  social: socialProp,
  links = footerLinks,
  legal = legalLinks,
}) {
  const site = useSiteContent();
  const company = companyProp ?? site?.company ?? brand;
  const contact = contactProp ?? site?.contact ?? contactDetails;
  const social = socialProp ?? site?.social ?? socialLinks;
  const hours = Array.isArray(contact.businessHours) ? contact.businessHours : contact.businessHours ? [contact.businessHours] : [];
  const { phone, email, address, mcNumber, dotNumber } = contact;
  const socials = Object.entries(social).filter(([, url]) => url);

  return (
    <footer data-surface="dark" className="bg-ink-950 text-white">
      <div className="lane-rule" aria-hidden="true" />
      <Container className="py-12 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr_1.1fr]">
          <div className="space-y-4">
            <Logo tone="dark" name={company.name} image={site?.logo} />
            <p className="text-lg font-semibold">{company.tagline}</p>
            <p className="max-w-sm text-base text-steel-200">{site?.footerText || company.supportingStatement}</p>
            {socials.length > 0 && (
              <ul className="flex flex-wrap gap-x-5" aria-label="Social media">
                {socials.map(([key, url]) => (
                  <li key={key}>
                    <a href={url} target="_blank" rel="noopener noreferrer" className={linkClasses}>
                      {SOCIAL_LABELS[key]}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <nav aria-label="Footer">
            <h2 className="text-lg font-bold">Explore</h2>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 lg:grid-cols-1 xl:grid-cols-2">
              {links.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className={linkClasses}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-lg font-bold">Contact</h2>
            <ul className="mt-3 space-y-3 text-base text-steel-200">
              {phone && (
                <li className="flex gap-3">
                  <Phone className="mt-1 size-5 shrink-0 text-signal-400" aria-hidden="true" />
                  <a href={`tel:${phone.replace(/[^+\d]/g, '')}`} className="underline-offset-4 hover:underline">{phone}</a>
                </li>
              )}
              {email && (
                <li className="flex gap-3">
                  <Mail className="mt-1 size-5 shrink-0 text-signal-400" aria-hidden="true" />
                  <a href={`mailto:${email}`} className="break-all underline-offset-4 hover:underline">{email}</a>
                </li>
              )}
              {address && (
                <li className="flex gap-3">
                  <MapPin className="mt-1 size-5 shrink-0 text-signal-400" aria-hidden="true" />
                  <span>{address}</span>
                </li>
              )}
              {hours.length > 0 && (
                <li className="flex gap-3">
                  <Clock className="mt-1 size-5 shrink-0 text-signal-400" aria-hidden="true" />
                  <ul aria-label="Business hours">{hours.map((row) => <li key={row}>{row}</li>)}</ul>
                </li>
              )}
              {(mcNumber || dotNumber) && (
                <li>{[mcNumber && `MC ${mcNumber}`, dotNumber && `DOT ${dotNumber}`].filter(Boolean).join(' · ')}</li>
              )}
              {!phone && !email && !address && hours.length === 0 && (
                <li>Contact details will be published here. In the meantime, <Link to={PATHS.contact} className="underline underline-offset-4 hover:text-white">send us a message</Link>.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-ink-700 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base text-steel-200">
            {site?.copyrightText || <>&copy; {new Date().getFullYear()} {company.name} All rights reserved.</>}
          </p>
          <ul className="flex flex-wrap gap-x-6">
            {legal.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className={linkClasses}>
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link to={PATHS.login} className={linkClasses}>
                Sign in
              </Link>
            </li>
          </ul>
        </div>
      </Container>
    </footer>
  );
}
