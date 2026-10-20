import { createContext, useContext, useEffect, useMemo } from 'react';
import { useContent } from '../hooks/useContent';
import { mergeSiteSettings } from '../utils/siteContent';

const SiteContentContext = createContext(null);

/** Site-wide CMS settings for the public website (company details, logo, header button, footer text, default SEO). */
export function SiteContentProvider({ children }) {
  const { data } = useContent('/site-settings');
  const value = useMemo(() => mergeSiteSettings(data), [data]);

  useEffect(() => {
    const url = value.settings?.favicon?.url;
    if (!url) return undefined;
    let link = document.head.querySelector('link[rel="icon"]');
    const created = !link;
    const previous = link?.getAttribute('href');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'icon');
      document.head.appendChild(link);
    }
    link.setAttribute('href', url);
    return () => {
      if (created) link.remove();
      else if (previous) link.setAttribute('href', previous);
    };
  }, [value.settings?.favicon?.url]);

  return <SiteContentContext.Provider value={value}>{children}</SiteContentContext.Provider>;
}

/** Null outside the public layout (portals, sign-in), where the built-in defaults apply. */
export const useSiteContent = () => useContext(SiteContentContext);
