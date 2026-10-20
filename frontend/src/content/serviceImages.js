// Predefined card pictures for the built-in services. To add or change one, put an image named after the service slug in
// src/assets/services/ (full-truckload, ltl, dry-van, reefer, flatbed, expedited, specialized, cross-border; .jpg, .jpeg, .webp,
// .png, .avif or .svg). Vite bundles whatever is there, so no URL is hardcoded and a missing file simply leaves that card plain.
// A picture chosen for the service in the Super Admin's Services collection always takes priority over these.
const files = import.meta.glob('../assets/services/*.{jpg,jpeg,webp,png,avif,svg}', { eager: true, query: '?url', import: 'default' });

export const serviceImages = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.split('/').pop().replace(/\.[^.]+$/, ''), url])
);

// Priority: the picture the Super Admin chose for this card (Homepage -> Services), then the service's own CMS image, then the predefined one.
export const serviceImageFor = (service, overrides) => overrides?.[service.slug]?.url ?? service.image?.url ?? serviceImages[service.slug] ?? null;
