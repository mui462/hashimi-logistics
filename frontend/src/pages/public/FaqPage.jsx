import { Search } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import { FIELD_CLASSES } from '../../components/forms/fieldStyles';
import CmsPageContent from '../../components/sections/CmsPageContent';
import Seo from '../../components/seo/Seo';
import { useCmsPage } from '../../hooks/useCmsPage';
import { useContent } from '../../hooks/useContent';
import { faqItems } from '../../utils/homeContent';
import Accordion from '../../components/sections/Accordion';
import CTASection from '../../components/sections/CTASection';
import HeroSection from '../../components/sections/HeroSection';
import SectionShell from '../../components/sections/SectionShell';
import { PATHS } from '../../config/paths';
import { faqCategories, faqs } from '../../content/faqs';
import { cx } from '../../utils/cx';
import { brand } from '../../config/brand';

export default function FaqPage({ items: itemsProp = faqs, categories: categoriesProp = faqCategories }) {
  const { page: cms } = useCmsPage('faq');
  const { data: cmsFaqs } = useContent('/faqs');
  // Once any FAQ exists in the CMS it is the whole list; until then the built-in questions show.
  const items = cmsFaqs?.configured ? faqItems(cmsFaqs.items) : itemsProp;
  const categories = cmsFaqs?.configured ? faqCategories.filter((name) => items.some((item) => item.category === name)) : categoriesProp;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const searchId = useId();

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter(
      (item) => (category === 'All' || item.category === category) && (!term || `${item.q} ${item.a}`.toLowerCase().includes(term))
    );
  }, [items, query, category]);

  const reset = () => {
    setQuery('');
    setCategory('All');
  };

  return (
    <>
      <Seo title="Frequently Asked Questions" description={`Answers about shipping, carriers, quotes, tracking and cross-border freight with ${brand.name}`} path={PATHS.faq} seo={cms?.seo} />
      <HeroSection eyebrow="FAQ" title="Frequently Asked Questions" description="Search or browse answers for shippers and carriers." scene="highway" cms={cms} />
      <CmsPageContent page={cms} />
      <SectionShell id="faq" labelledBy="faq-heading">
        <div className="mx-auto max-w-4xl">
          <h2 id="faq-heading" className="sr-only">Questions and answers</h2>
          <div role="search" className="space-y-5">
            <div>
              <label htmlFor={searchId} className="block text-base font-semibold">Search questions</label>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-steel-500" aria-hidden="true" />
                <input id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by keyword" className={`${FIELD_CLASSES} pl-12`} />
              </div>
            </div>
            <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
              {['All', ...categories].map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={category === name}
                  onClick={() => setCategory(name)}
                  className={cx('min-h-11 rounded-full border px-5 text-base font-semibold transition-colors duration-200', category === name ? 'border-ink-900 bg-ink-900 text-white' : 'border-steel-300 bg-white hover:border-signal-400 hover:bg-steel-50')}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-6 text-base text-steel-600" role="status">
            {filtered.length} {filtered.length === 1 ? 'question' : 'questions'}
          </p>

          <div className="mt-4">
            {filtered.length > 0 ? (
              <Accordion key={`${category}-${query}`} items={filtered} headingLevel="h3" />
            ) : (
              <EmptyState icon={Search} title="No questions match" titleAs="h3" description="Try a different keyword or category, or contact our team." action={<Button variant="secondary" onClick={reset}>Clear filters</Button>} />
            )}
          </div>
        </div>
      </SectionShell>
      <CTASection title="Still Have a Question?" text="Send us a message and our team will follow up." actions={[{ label: 'Contact Us', to: PATHS.contact }]} />
    </>
  );
}
