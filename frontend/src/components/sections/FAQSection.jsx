import { Link } from 'react-router-dom';
import { PATHS } from '../../config/paths';
import SectionHeading from '../common/SectionHeading';
import Accordion from './Accordion';
import SectionShell from './SectionShell';

export default function FAQSection({
  items,
  id = 'faq-preview',
  eyebrow = 'FAQ',
  title = 'Frequently Asked Questions',
  description,
  tone = 'default',
  showAllLink = true,
  headingAs,
}) {
  if (!items?.length) return null;
  const headingId = `${id}-heading`;
  return (
    <SectionShell id={id} tone={tone} labelledBy={headingId}>
      <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <SectionHeading id={headingId} eyebrow={eyebrow} title={title} description={description} as={headingAs} className="mb-6 sm:mb-6" />
          {showAllLink && (
            <Link to={PATHS.faq} className="inline-flex min-h-11 items-center text-base font-bold underline underline-offset-4">
              View all questions
            </Link>
          )}
        </div>
        <Accordion items={items} headingLevel={headingAs === 'h1' ? 'h2' : 'h3'} />
      </div>
    </SectionShell>
  );
}
