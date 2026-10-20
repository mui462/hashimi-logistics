import { useEffect } from 'react';
import { seoDefaults } from '../../config/seo';
import { useSiteContent } from '../../context/SiteContentContext';

function setMeta(attr, key, content) {
  let element = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!content) {
    element?.remove();
    return;
  }
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attr, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function setCanonical(href) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!href) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

// Reusable SEO head manager: title, description, canonical, Open Graph and robots.
// Order of precedence for every field: the page's own CMS SEO (`seo`), then what the page passes in, then the CMS global
// defaults (Super Admin > SEO), then the built-in defaults. Canonical and og:url/og:image are only emitted when a site
// address / image is configured (CMS or VITE_SITE_URL / VITE_OG_IMAGE): nothing is guessed.
export default function Seo({ title, description, path, image, robots, type = 'website', seo }) {
  const site = useSiteContent();
  const settings = site?.settings ?? null;
  const globalSeo = settings?.seo ?? null;
  const siteName = clean(settings?.companyName) || seoDefaults.siteName;
  const baseUrl = (clean(settings?.canonicalBaseUrl) || seoDefaults.siteUrl).replace(/\/+$/, '');
  const pageTitle = clean(seo?.title) || title;
  const fullTitle = pageTitle ? `${pageTitle} | ${siteName}` : clean(settings?.websiteTitle) || clean(globalSeo?.title) || siteName;
  const desc = clean(seo?.description) || description || clean(globalSeo?.description) || clean(settings?.description) || seoDefaults.description;
  const robotsValue = robots || (seo?.noIndex || globalSeo?.noIndex ? 'noindex,follow' : seoDefaults.robots);
  const customCanonical = clean(seo?.canonicalUrl);
  const canonical = customCanonical
    ? /^https?:\/\//i.test(customCanonical) ? customCanonical : baseUrl ? `${baseUrl}${customCanonical}` : ''
    : baseUrl && path !== undefined ? `${baseUrl}${path === '/' ? '/' : path}` : '';
  const ogImage = clean(seo?.ogImage) || image || clean(globalSeo?.ogImage) || seoDefaults.ogImage;
  const keywords = [...(seo?.keywords ?? []), ...(!seo?.keywords?.length ? globalSeo?.keywords ?? [] : [])].join(', ');

  useEffect(() => {
    document.title = fullTitle;
    setMeta('name', 'description', desc);
    setMeta('name', 'keywords', keywords);
    setMeta('name', 'robots', robotsValue);
    setCanonical(canonical);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:site_name', siteName);
    setMeta('property', 'og:url', canonical);
    setMeta('property', 'og:image', ogImage);
    setMeta('name', 'twitter:card', ogImage ? 'summary_large_image' : 'summary');
  }, [fullTitle, desc, keywords, robotsValue, canonical, ogImage, type, siteName]);

  return null;
}
