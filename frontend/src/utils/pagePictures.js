/** The built-in pages that sit in the website's menus, and which of them also have an introduction picture. */
export const PICTURE_PAGES = [
  { key: 'about', title: 'About Us' },
  { key: 'services', title: 'Services', intro: true },
  { key: 'industries', title: 'Industries', intro: true },
  { key: 'service-areas', title: 'Service Areas' },
  { key: 'for-shippers', title: 'For Shippers', intro: true },
  { key: 'for-carriers', title: 'For Carriers', intro: true },
  { key: 'how-it-works', title: 'How It Works' },
  { key: 'resources', title: 'Resources' },
  { key: 'contact', title: 'Contact' },
  { key: 'become-a-carrier', title: 'Become a Carrier' },
  { key: 'faq', title: 'FAQ' },
];

/** A library item as the picture a page field stores. */
export const asPicture = (media, fallbackAlt) => ({ url: media.url, altText: (media.altText || fallbackAlt || '').slice(0, 200), mediaId: media.id });

/**
 * Which empty picture slots get which library picture. Only empty slots are filled (a picture someone chose is never replaced);
 * pictures are handed out in library order and reused only when there are fewer pictures than slots.
 * `pages` maps a page key to the saved page (admin shape); a key is missing when the page was never customised.
 */
export function planPictureFill(images, pages) {
  if (images.length === 0) return [];
  let next = 0;
  const take = () => images[next++ % images.length];
  const plan = [];
  for (const spec of PICTURE_PAGES) {
    const page = pages[spec.key];
    const banner = page?.heroImage?.url ? null : take();
    const intro = spec.intro && !page?.introImage?.url ? take() : null;
    if (banner || intro) plan.push({ ...spec, page: page ?? null, banner, intro });
  }
  return plan;
}
