import { useParams } from 'react-router-dom';
import Container from '../../components/common/Container';
import LoadingState from '../../components/common/LoadingState';
import Seo from '../../components/seo/Seo';
import BulletSection from '../../components/sections/BulletSection';
import CTASection from '../../components/sections/CTASection';
import HeroSection from '../../components/sections/HeroSection';
import IndustryGrid from '../../components/sections/IndustryGrid';
import IntroSplit from '../../components/sections/IntroSplit';
import ServiceGrid from '../../components/sections/ServiceGrid';
import { PATHS } from '../../config/paths';
import { getIndustryBySlug, industries } from '../../content/industries';
import { services } from '../../content/services';
import { useSiteContent } from '../../context/SiteContentContext';
import { useContent } from '../../hooks/useContent';
import { fetchContentOrNull } from '../../services/contentService';
import { industryCards } from '../../utils/homeContent';
import { toAction } from '../../utils/siteContent';
import NotFoundPage from './NotFoundPage';
import { brand } from '../../config/brand';

const paragraphs = (value) => String(value ?? '').split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
const crumbs = (name) => [{ label: 'Home', to: PATHS.home }, { label: 'Industries', to: PATHS.industries }, { label: name }];
// The four industries that follow this one in the list (wrapping round), so a page never lists itself.
const nextIndustries = (all, slug) => {
  const index = all.findIndex((item) => item.slug === slug);
  return [...all.slice(index + 1), ...all.slice(0, Math.max(index, 0))].filter((item) => item.slug !== slug).slice(0, 4);
};

// One reusable template for every /industries/:slug page; CMS record first, built-in content until the CMS has any industry.
export default function IndustryDetailPage() {
  const { slug } = useParams();
  const site = useSiteContent();
  const list = useContent('/industries');
  const detail = useContent(`/industries/${slug}`, undefined, () => fetchContentOrNull(`/industries/${slug}`));
  const { data: cmsHome } = useContent('/homepage');
  const builtIn = getIndustryBySlug(slug);
  // The picture a Super Admin chose for this industry's homepage card is reused here; nothing is chosen on their behalf.
  const industryCardImages = Object.fromEntries((cmsHome?.configured ? cmsHome.industries?.cardImages ?? [] : []).map((c) => [c.slug, c.image]));
  const serviceCardImages = Object.fromEntries((cmsHome?.configured ? cmsHome.services?.cardImages ?? [] : []).map((c) => [c.slug, c.image]));
  const cardImage = (cmsHome?.configured ? cmsHome.industries?.cardImages ?? [] : []).find((card) => card.slug === slug)?.image;

  if (list.status === 'loading' || detail.status === 'loading') {
    return (
      <>
        <Seo title="Loading industry" robots="noindex,follow" />
        <HeroSection title="Industries" scene="warehouse" />
        <Container><LoadingState label="Loading industry" /></Container>
      </>
    );
  }

  const cms = detail.data;
  const cmsConfigured = list.status === 'ready' && Boolean(list.data?.configured);
  const quote = { label: site?.company.primaryCta ?? brand.primaryCta, to: PATHS.requestQuote };

  if (cms) {
    const cta = toAction(cms.cta) ?? quote;
    const others = nextIndustries(cmsConfigured ? industryCards(list.data.items) : industries, cms.slug);
    return (
      <>
        <Seo title={`${cms.name} Freight`} description={cms.shortDescription ?? undefined} path={`${PATHS.industries}/${cms.slug}`} seo={cms.seo} />
        <HeroSection eyebrow="Industries" title={`${cms.name} Freight`} description={cms.shortDescription ?? undefined} scene="warehouse" cms={{ heroImage: cms.image }} breadcrumbs={crumbs(cms.name)} actions={[cta, { label: 'All Industries', to: PATHS.industries, variant: 'secondary' }]} />
        {cms.description && <IntroSplit id="overview" eyebrow="Industry" title="Overview" paragraphs={paragraphs(cms.description)} media={{ image: cms.image ?? cardImage, scene: 'warehouse', alt: cms.name }} />}
        {cms.benefits.length > 0 && <BulletSection id="benefits" tone="muted" eyebrow="Benefits" title="Benefits" items={cms.benefits} />}
        <IndustryGrid showcase industries={others} cardImages={industryCardImages} id="other-industries" eyebrow="Explore more" title="Other Industries" tone="default" />
        <CTASection title={`Moving ${cms.name} Freight?`} text="Tell us what you need to move and our team will help coordinate the right transportation solution." />
      </>
    );
  }

  if (!builtIn || cmsConfigured) return <NotFoundPage title="Industry not found" message="We could not find that industry. Browse all industries instead." />;

  const relevant = services.filter((s) => builtIn.services.includes(s.slug));
  return (
    <>
      <Seo title={`${builtIn.title} Freight`} description={builtIn.short} path={`${PATHS.industries}/${builtIn.slug}`} />
      <HeroSection eyebrow="Industries" title={`${builtIn.title} Freight`} description={builtIn.short} scene={builtIn.scene} breadcrumbs={crumbs(builtIn.title)} actions={[quote, { label: 'All Industries', to: PATHS.industries, variant: 'secondary' }]} />
      <IntroSplit id="overview" eyebrow="Industry" title="Overview" paragraphs={[builtIn.overview]} media={{ image: cardImage, scene: builtIn.scene, alt: builtIn.title }} />
      <BulletSection id="typical-freight" tone="muted" eyebrow="Freight" title="Typical Freight" items={builtIn.typical} />
      <BulletSection id="considerations" eyebrow="Planning" title="Transportation Considerations" description="General points worth sharing when you request a quote." items={builtIn.considerations} />
      <ServiceGrid services={relevant} cardImages={serviceCardImages} id="relevant-services" title="Relevant Services" tone="muted" />
      <IndustryGrid showcase industries={nextIndustries(industries, builtIn.slug)} cardImages={industryCardImages} id="other-industries" eyebrow="Explore more" title="Other Industries" tone="default" />
      <CTASection title={`Moving ${builtIn.title} Freight?`} text="Tell us what you need to move and our team will help coordinate the right transportation solution." />
    </>
  );
}
