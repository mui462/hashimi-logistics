import { useEffect } from 'react';
import { seoDefaults } from '../../config/seo';
import { useSiteContent } from '../../context/SiteContentContext';

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const absolute = (baseUrl, value) => (/^https?:\/\//i.test(value) ? value : baseUrl && value.startsWith('/') ? `${baseUrl}${value}` : '');

/**
 * schema.org Organization + WebSite for the whole public site. Only facts the Super Admin has entered are included (phone,
 * e-mail, address, social profiles, logo): nothing is invented, and without a site address nothing is emitted at all.
 */
export function buildSiteSchema({ settings, baseUrl, siteName }) {
  if (!baseUrl) return [];
  const address = settings?.address ?? {};
  const postal = {
    '@type': 'PostalAddress',
    streetAddress: clean(address.street),
    addressLocality: clean(address.city),
    addressRegion: clean(address.state),
    postalCode: clean(address.zipCode),
    addressCountry: clean(address.country),
  };
  const hasAddress = Object.entries(postal).some(([key, value]) => key !== '@type' && value);
  const sameAs = (settings?.socialLinks ?? []).map((link) => clean(link?.url)).filter((url) => /^https?:\/\//i.test(url));
  const logo = absolute(baseUrl, clean(settings?.logo?.url));
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${baseUrl}/#organization`,
    name: siteName,
    url: baseUrl,
    description: clean(settings?.description) || seoDefaults.description,
    ...(logo ? { logo } : {}),
    ...(clean(settings?.phone) ? { telephone: clean(settings.phone) } : {}),
    ...(clean(settings?.email) ? { email: clean(settings.email) } : {}),
    ...(hasAddress ? { address: Object.fromEntries(Object.entries(postal).filter(([, value]) => value)) } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${baseUrl}/#website`,
    url: baseUrl,
    name: siteName,
    publisher: { '@id': `${baseUrl}/#organization` },
  };
  return [organization, website];
}

/** schema.org BlogPosting for one published article. */
export function buildArticleSchema({ article, baseUrl, path }) {
  if (!baseUrl || !article?.title) return [];
  const image = absolute(baseUrl, clean(article.featuredImage?.url));
  return [{
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    ...(clean(article.excerpt) ? { description: clean(article.excerpt) } : {}),
    ...(image ? { image } : {}),
    ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
    ...(article.updatedAt ? { dateModified: article.updatedAt } : {}),
    ...(clean(article.authorName || article.author) ? { author: { '@type': 'Person', name: clean(article.authorName || article.author) } } : {}),
    publisher: { '@id': `${baseUrl}/#organization` },
    mainEntityOfPage: `${baseUrl}${path}`,
    isPartOf: { '@id': `${baseUrl}/#website` },
    inLanguage: 'en',
  }];
}

// "<" is escaped so content can never close the script tag early.
const serialise = (data) => JSON.stringify(data.length === 1 ? data[0] : data).replace(/</g, '\\u003c');

/** Injects JSON-LD into <head> while mounted. `id` keeps each block unique so pages never duplicate one another's data. */
export function JsonLd({ id, data }) {
  const payload = data?.length ? serialise(data) : '';
  useEffect(() => {
    if (!payload) return undefined;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.dataset.jsonld = id;
    script.textContent = payload;
    document.head.appendChild(script);
    return () => script.remove();
  }, [id, payload]);
  return null;
}

/** Site-wide structured data, mounted once in the public layout. */
export function SiteJsonLd() {
  const site = useSiteContent();
  const settings = site?.settings ?? null;
  const siteName = clean(settings?.companyName) || seoDefaults.siteName;
  const baseUrl = (clean(settings?.canonicalBaseUrl) || seoDefaults.siteUrl).replace(/\/+$/, '');
  return <JsonLd id="site" data={buildSiteSchema({ settings, baseUrl, siteName })} />;
}

/** Structured data for one article page. */
export function ArticleJsonLd({ article, path }) {
  const site = useSiteContent();
  const settings = site?.settings ?? null;
  const baseUrl = (clean(settings?.canonicalBaseUrl) || seoDefaults.siteUrl).replace(/\/+$/, '');
  return <JsonLd id="article" data={buildArticleSchema({ article, baseUrl, path })} />;
}
