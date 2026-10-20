import { useParams } from 'react-router-dom';
import Container from '../../components/common/Container';
import LoadingState from '../../components/common/LoadingState';
import Seo from '../../components/seo/Seo';
import CmsPageContent from '../../components/sections/CmsPageContent';
import HeroSection from '../../components/sections/HeroSection';
import { useContent } from '../../hooks/useContent';
import { fetchContentOrNull } from '../../services/contentService';
import NotFoundPage from './NotFoundPage';

// /pages/:slug: a custom page a Super Admin created in the CMS. Only published pages exist here; the built-in pages keep
// their own routes (a CMS version of one is shown on that route), so a built-in page key is not served from this path.
export default function CmsPage() {
  const { slug } = useParams();
  const { data: page, status } = useContent(`/pages/${slug}`, undefined, () => fetchContentOrNull(`/pages/${slug}`));

  if (status === 'loading') {
    return (
      <>
        <Seo title="Loading page" robots="noindex,follow" />
        <HeroSection title="Loading" scene="highway" />
        <Container><LoadingState label="Loading page" /></Container>
      </>
    );
  }
  if (!page || page.pageKey) return <NotFoundPage />;
  return (
    <>
      <Seo title={page.title} description={page.excerpt ?? undefined} path={`/pages/${page.slug}`} seo={page.seo} />
      <HeroSection title={page.heroHeading || page.title} description={page.heroSubtitle || undefined} scene="highway" cms={page} breadcrumbs={[{ label: 'Home', to: '/' }, { label: page.title }]} />
      <CmsPageContent page={page} />
    </>
  );
}
