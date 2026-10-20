import { useEffect } from 'react';

// For sign-in screens and portals: ask search engines not to index them and drop any canonical/og:url
// left behind by a previously visited public page. It does not touch the document title.
export default function NoIndex() {
  useEffect(() => {
    let meta = document.head.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'robots');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'noindex,nofollow');
    document.head.querySelector('link[rel="canonical"]')?.remove();
    document.head.querySelector('meta[property="og:url"]')?.remove();
  }, []);
  return null;
}
