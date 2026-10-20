import Button from '../common/Button';
import PlainText from '../common/PlainText';
import SectionHeading from '../common/SectionHeading';
import MediaImage from '../media/MediaImage';
import SectionShell from './SectionShell';
import { toAction } from '../../utils/siteContent';

/**
 * The text a Super Admin wrote for a page in the CMS: the summary, main text, sections and a button. It is rendered as
 * plain text (the API refuses HTML), never as markup. Returns nothing when the page has no such content.
 */
export default function CmsPageContent({ page, id = 'cms-content' }) {
  if (!page) return null;
  const sections = (page.sections ?? []).filter((section) => section.heading || section.body || section.image);
  const action = toAction(page.cta);
  if (!page.content && !page.excerpt && sections.length === 0 && !action) return null;
  return (
    <>
      {(page.excerpt || page.content) && (
        <SectionShell id={id} labelledBy={`${id}-heading`}>
          <h2 id={`${id}-heading`} className="sr-only">{page.title}</h2>
          <div className="max-w-3xl text-lg">
            {page.excerpt && <p className="mb-5 text-xl font-semibold">{page.excerpt}</p>}
            <PlainText text={page.content} />
          </div>
        </SectionShell>
      )}
      {sections.map((section, index) => (
        <SectionShell key={index} id={`${id}-${index + 1}`} tone={index % 2 === 0 ? 'muted' : 'default'} labelledBy={`${id}-${index + 1}-heading`}>
          <div className={section.image ? 'grid items-center gap-10 lg:grid-cols-2' : ''}>
            <div className="max-w-3xl">
              <SectionHeading id={`${id}-${index + 1}-heading`} title={section.heading || page.title} />
              <PlainText text={section.body} className="text-lg text-steel-600" />
            </div>
            {section.image && (
              <div className="aspect-[4/3] overflow-hidden bg-ink-900">
                <MediaImage src={section.image.url} alt={section.image.altText ?? ''} />
              </div>
            )}
          </div>
        </SectionShell>
      ))}
      {action && (
        <SectionShell id={`${id}-cta`} tone="muted" labelledBy={`${id}-cta-link`}>
          <Button to={action.to} href={action.href} id={`${id}-cta-link`} size="lg">{action.label}</Button>
        </SectionShell>
      )}
    </>
  );
}
