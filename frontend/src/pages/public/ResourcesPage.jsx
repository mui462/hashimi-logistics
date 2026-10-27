import { Newspaper, Search } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import LoadingState from '../../components/common/LoadingState';
import { FIELD_CLASSES } from '../../components/forms/fieldStyles';
import ArticleCard from '../../components/common/ArticleCard';
import CmsPageContent from '../../components/sections/CmsPageContent';
import { useCmsPage } from '../../hooks/useCmsPage';
import Seo from '../../components/seo/Seo';
import CTASection from '../../components/sections/CTASection';
import HeroSection from '../../components/sections/HeroSection';
import SectionShell from '../../components/sections/SectionShell';
import { PATHS } from '../../config/paths';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listArticles } from '../../services/blogService';
import { cx } from '../../utils/cx';
import { brand } from '../../config/brand';

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-between gap-4">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button>
      <p className="text-base font-semibold" aria-current="page">Page {page} of {totalPages}</p>
      <Button variant="secondary" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</Button>
    </nav>
  );
}

export default function ResourcesPage() {
  const { page: cms } = useCmsPage('resources');
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const searchId = useId();

  const load = useCallback(() => listArticles({ page, category, search }), [page, category, search]);
  const { data, error, isLoading, reload } = useAsyncData(load);

  const categories = data?.categories ?? [];
  const filtered = Boolean(category || search);
  const items = data?.items || [];
  const featured = !filtered && page === 1 ? items[0] : null;
  const latest = featured ? items.slice(1) : items;

  const chooseCategory = (name) => {
    setCategory(name);
    setPage(1);
  };

  return (
    <>
      <Seo title="Resources" description={`Freight, transportation and cross-border articles and updates from ${brand.name}.`} path={PATHS.resources} seo={cms?.seo} />
      <HeroSection eyebrow="Resources" title="Freight Resources" description="Articles and updates on freight, transportation and cross-border shipping." scene="warehouse" cms={cms} />
      <CmsPageContent page={cms} />
      <SectionShell id="articles" labelledBy="articles-heading">
        <h2 id="articles-heading" className="sr-only">Articles</h2>
        <div role="search" className="mb-8 space-y-5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(searchInput.trim());
              setPage(1);
            }}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex-1">
              <label htmlFor={searchId} className="block text-base font-semibold">Search articles</label>
              <input id={searchId} type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className={`${FIELD_CLASSES} mt-2`} placeholder="Search by keyword" />
            </div>
            <Button type="submit"><Search className="size-5" aria-hidden="true" />Search</Button>
          </form>
          {categories.length > 0 && <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
            {['', ...categories].map((name) => (
              <button key={name || 'all'} type="button" aria-pressed={category === name} onClick={() => chooseCategory(name)} className={cx('min-h-11 rounded-full border px-5 text-base font-semibold transition-colors duration-200', category === name ? 'border-ink-900 bg-ink-900 text-white' : 'border-steel-500 bg-white hover:bg-steel-50')}>
                {name || 'All'}
              </button>
            ))}
          </div>}
        </div>

        {isLoading && <LoadingState label="Loading articles" />}
        {!isLoading && error && <ErrorState titleAs="h3" title="Articles are unavailable right now" message={error.message} onRetry={reload} />}
        {!isLoading && !error && items.length === 0 && (
          <EmptyState
            icon={Newspaper}
            titleAs="h3"
            title={filtered ? 'No articles match your search' : 'No articles published yet'}
            description={filtered ? 'Try a different keyword or category.' : 'New articles will appear here once they are published.'}
            action={filtered ? <Button variant="secondary" onClick={() => { setSearch(''); setSearchInput(''); chooseCategory(''); }}>Clear filters</Button> : undefined}
          />
        )}
        {!isLoading && !error && items.length > 0 && (
          <>
            {featured && (
              <div className="mb-10">
                <p className="mb-3 text-base font-bold uppercase tracking-widest text-steel-600">Featured</p>
                <ArticleCard article={featured} featured />
              </div>
            )}
            {latest.length > 0 && (
              <>
                <p className="mb-4 text-base font-bold uppercase tracking-widest text-steel-600">Latest articles</p>
                <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {latest.map((article) => (
                    <li key={article.slug}><ArticleCard article={article} /></li>
                  ))}
                </ul>
              </>
            )}
            <Pagination page={data.page || page} totalPages={data.totalPages || 1} onChange={setPage} />
          </>
        )}
      </SectionShell>
      <CTASection title="Have a Freight Question?" text="Tell us what you need to move and our team will help." />
    </>
  );
}
