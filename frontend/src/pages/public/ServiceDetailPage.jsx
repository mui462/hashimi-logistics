import { useParams } from 'react-router-dom';
import Container from '../../components/common/Container';
import LoadingState from '../../components/common/LoadingState';
import Seo from '../../components/seo/Seo';
import BulletSection from '../../components/sections/BulletSection';
import CTASection from '../../components/sections/CTASection';
import FAQSection from '../../components/sections/FAQSection';
import HeroSection from '../../components/sections/HeroSection';
import IndustryGrid from '../../components/sections/IndustryGrid';
import IntroSplit from '../../components/sections/IntroSplit';
import ServiceAreaCards from '../../components/sections/ServiceAreaCards';
import ServiceGrid from '../../components/sections/ServiceGrid';
import StepsSection from '../../components/sections/StepsSection';
import { PATHS } from '../../config/paths';
import { faqs } from '../../content/faqs';
import { howItWorksSteps } from '../../content/home';
import { industries } from '../../content/industries';
import { serviceImageFor } from '../../content/serviceImages';
import { getServiceBySlug, services } from '../../content/services';
import { useSiteContent } from '../../context/SiteContentContext';
import { useContent } from '../../hooks/useContent';
import { fetchContentOrNull } from '../../services/contentService';
import { areaCards, serviceCards } from '../../utils/homeContent';
import { toAction } from '../../utils/siteContent';
import NotFoundPage from './NotFoundPage';
import { brand } from '../../config/brand';

const FAQ_IDS = ['how-quote', 'quote-info', 'tracking'];
const paragraphs = (value) => String(value ?? '').split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
const crumbs = (name) => [{ label: 'Home', to: PATHS.home }, { label: 'Services', to: PATHS.services }, { label: name }];
// The four services that follow this one in the catalogue (wrapping round), so a page never lists itself.
const nextServices = (all, slug) => {
  const index = all.findIndex((item) => item.slug === slug);
  const others = [...all.slice(index + 1), ...all.slice(0, Math.max(index, 0))].filter((item) => item.slug !== slug);
  return others.slice(0, 4);
};

// One reusable template for every /services/:slug page. A service published in the CMS uses that record; until the CMS has
// any service at all, the built-in catalogue (content/services.js) is used. Once the CMS has services it is authoritative,
// so a service that was removed there is not resurrected from the built-in list.
export default function ServiceDetailPage() {
  const { slug } = useParams();
  const site = useSiteContent();
  const list = useContent('/services');
  const { data: cmsHome } = useContent('/homepage');
  const industryCardImages = Object.fromEntries((cmsHome?.configured ? cmsHome.industries?.cardImages ?? [] : []).map((c) => [c.slug, c.image]));
  const cardImages = Object.fromEntries((cmsHome?.configured ? cmsHome.services?.cardImages ?? [] : []).map((c) => [c.slug, c.image]));
  const detail = useContent(`/services/${slug}`, undefined, () => fetchContentOrNull(`/services/${slug}`));
  const builtIn = getServiceBySlug(slug);

  if (list.status === 'loading' || detail.status === 'loading') {
    return (
      <>
        <Seo title="Loading service" robots="noindex,follow" />
        <HeroSection title="Services" scene="highway" />
        <Container><LoadingState label="Loading service" /></Container>
      </>
    );
  }

  const cms = detail.data;
  const cmsConfigured = list.status === 'ready' && Boolean(list.data?.configured);
  const quote = { label: site?.company.primaryCta ?? brand.primaryCta, to: PATHS.requestQuote };

  if (cms) {
    const cta = toAction(cms.cta) ?? quote;
    const related = nextServices(cmsConfigured ? serviceCards(list.data.items) : services, cms.slug);
    return (
      <>
        <Seo title={cms.name} description={cms.shortDescription ?? undefined} path={`${PATHS.services}/${cms.slug}`} seo={cms.seo} />
        <HeroSection eyebrow="Services" title={cms.name} description={cms.shortDescription ?? undefined} scene="highway" cms={{ heroImage: cms.heroImage ?? cms.image }} breadcrumbs={crumbs(cms.name)} actions={[cta, { label: 'All Services', to: PATHS.services, variant: 'secondary' }]} />
        {cms.fullDescription && <IntroSplit id="introduction" eyebrow="Overview" title={`About ${cms.name}`} paragraphs={paragraphs(cms.fullDescription)} media={{ image: cms.image, src: serviceImageFor({ slug: cms.slug }), scene: 'highway', alt: cms.name }} />}
        {cms.features.length > 0 && <BulletSection id="what-we-handle" tone="muted" eyebrow="Details" title="What We Handle" items={cms.features} />}
        {cms.benefits.length > 0 && <BulletSection id="benefits" eyebrow="Benefits" title="Benefits" items={cms.benefits} />}
        <ServiceAreaCards areas={areaCards(cms.serviceAreas)} id="where-offered" title="Where this service is offered" tone="muted" />
        <StepsSection steps={howItWorksSteps} tone="dark" />
        <ServiceGrid services={related} cardImages={cardImages} id="related-services" eyebrow="Explore more" title="Related Services" tone="default" />
        <CTASection title={`Need ${cms.name} Transportation?`} text="Tell us what you need to move and our team will help coordinate the right transportation solution." />
      </>
    );
  }

  if (!builtIn || cmsConfigured) return <NotFoundPage title="Service not found" message="We could not find that service. Browse all of our freight services instead." />;

  const servedIndustries = industries.filter((i) => builtIn.industries.includes(i.slug));
  const serviceFaqs = faqs.filter((f) => FAQ_IDS.includes(f.id));

  return (
    <>
      <Seo title={builtIn.title} description={builtIn.short} path={`${PATHS.services}/${builtIn.slug}`} />
      <HeroSection eyebrow="Services" title={builtIn.title} description={builtIn.short} scene={builtIn.scene} breadcrumbs={crumbs(builtIn.title)} actions={[quote, { label: 'All Services', to: PATHS.services, variant: 'secondary' }]} />
      <IntroSplit id="introduction" eyebrow="Overview" title={`About ${builtIn.title}`} paragraphs={[builtIn.intro]} media={{ src: serviceImageFor(builtIn), scene: builtIn.scene, alt: builtIn.title }} />
      <BulletSection id="what-we-handle" tone="muted" eyebrow="Freight" title="What We Handle" items={builtIn.handles} />
      <BulletSection id="benefits" eyebrow="Benefits" title="Benefits" items={builtIn.benefits} />
      <BulletSection id="equipment" tone="muted" eyebrow="Equipment" title="Equipment" items={builtIn.equipment} />
      <IndustryGrid showcase industries={servedIndustries} cardImages={industryCardImages} id="industries-served" title="Industries Served" tone="default" />
      <StepsSection steps={howItWorksSteps} tone="dark" />
      <FAQSection items={serviceFaqs} id="service-faq" title={`${builtIn.title} Questions`} tone="muted" />
      <ServiceGrid services={nextServices(services, builtIn.slug)} cardImages={cardImages} id="related-services" eyebrow="Explore more" title="Related Services" tone="default" />
      <CTASection title={`Need ${builtIn.title} Transportation?`} text="Tell us what you need to move and our team will help coordinate the right transportation solution." />
    </>
  );
}
