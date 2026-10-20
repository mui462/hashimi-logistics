import { text } from './siteContent';

/** Hero props for a built-in page: the CMS banner heading, subtitle and image replace the built-in ones only when set. */
export function heroOverrides(page, defaults = {}) {
  if (!page) return defaults;
  return {
    ...defaults,
    title: text(page.heroHeading, defaults.title),
    description: text(page.heroSubtitle, defaults.description),
    ...(page.heroImage?.url ? { media: { videoSrc: '', posterSrc: page.heroImage.url, posterAlt: page.heroImage.altText ?? '' } } : {}),
  };
}
