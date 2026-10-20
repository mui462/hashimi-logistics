import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import ArticleCard from '../../components/common/ArticleCard';
import Button from '../../components/common/Button';
import Container from '../../components/common/Container';
import ErrorState from '../../components/common/ErrorState';
import LoadingState from '../../components/common/LoadingState';
import MediaImage from '../../components/media/MediaImage';
import Seo from '../../components/seo/Seo';
import CTASection from '../../components/sections/CTASection';
import HeroSection from '../../components/sections/HeroSection';
import SectionShell from '../../components/sections/SectionShell';
import { PATHS } from '../../config/paths';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getArticle } from '../../services/blogService';
import NotFoundPage from './NotFoundPage';
import { finalCta } from '../../content/home';

// Reusable article template. Body text is rendered as plain paragraphs (never raw HTML).
export default function ArticlePage() {
  const { slug } = useParams();
  const load = useCallback(() => getArticle(slug), [slug]);
  const { data: article, error, isLoading, reload } = useAsyncData(load);

  if (isLoading) {
    return (
      <>
        <Seo title="Loading article" robots="noindex,follow" />
        <HeroSection title="Resources" scene="warehouse" />
        <Container><LoadingState label="Loading article" /></Container>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Seo title="Article unavailable" robots="noindex,follow" />
        <HeroSection title="Resources" scene="warehouse" />
        <Container className="py-12"><ErrorState title="This article is unavailable right now" message={error.message} onRetry={reload} /></Container>
      </>
    );
  }

  if (!article) return <NotFoundPage title="Article not found" message="We could not find that article. Browse our resources instead." />;

  const paragraphs = String(article.content || '').split(/\n{2,}/).filter(Boolean);

  return (
    <>
      <Seo title={article.title} description={article.excerpt} image={article.featuredImage ?? undefined} path={`${PATHS.resources}/${article.slug}`} type="article" seo={article.seo} />
      <HeroSection eyebrow={article.category} title={article.title} description={[article.author, article.publishedAt && new Date(article.publishedAt).toLocaleDateString()].filter(Boolean).join(' · ')} scene="warehouse" breadcrumbs={[{ label: 'Home', to: PATHS.home }, { label: 'Resources', to: PATHS.resources }, { label: article.title }]} />
      <SectionShell id="article" labelledBy="article-title">
        <article className="mx-auto max-w-3xl">
          <h2 id="article-title" className="sr-only">{article.title}</h2>
          <div className="mb-8 aspect-[16/9] overflow-hidden rounded-3xl bg-ink-900 shadow-[0_24px_50px_-24px_rgb(0_0_0/0.6)] ring-1 ring-black/5">
            <MediaImage src={article.featuredImage} alt={article.featuredImageAlt || ''} scene="highway" eager />
          </div>
          <div className="space-y-5 text-lg">
            {paragraphs.map((p, index) => <p key={index}>{p}</p>)}
          </div>
          {article.tags?.length > 0 && (
            <ul className="mt-8 flex flex-wrap gap-2" aria-label="Tags">
              {article.tags.map((tag) => <li key={tag} className="rounded-full border border-signal-400/40 bg-signal-400/10 px-4 py-1 text-base font-semibold">{tag}</li>)}
            </ul>
          )}
          <div className="mt-10"><Button to={PATHS.resources} variant="secondary">Back to resources</Button></div>
        </article>
        {article.related?.length > 0 && (
          <div className="mt-16">
            <h2 className="mb-6 text-2xl font-extrabold">Related articles</h2>
            <ul className="grid gap-6 md:grid-cols-3">
              {article.related.map((item) => <li key={item.slug}><ArticleCard article={item} /></li>)}
            </ul>
          </div>
        )}
      </SectionShell>
      <CTASection {...finalCta} />
    </>
  );
}
