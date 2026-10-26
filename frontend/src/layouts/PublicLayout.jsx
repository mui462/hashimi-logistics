import { Suspense, lazy } from 'react';
import { Outlet } from 'react-router-dom';
import { SiteJsonLd } from '../components/seo/JsonLd';
import SkipLink from '../components/common/SkipLink';
import AnalyticsLoader from '../components/consent/AnalyticsLoader';
import CookieBanner from '../components/consent/CookieBanner';
import Footer from '../components/layout/Footer';
import Navbar from '../components/layout/Navbar';
import { ConsentProvider } from '../context/ConsentContext';
import { SiteContentProvider, useSiteContent } from '../context/SiteContentContext';
import { themeCssVars } from '../config/themeAppearance';

// The AI assistant is loaded after the page, so it never slows the first paint.
const ChatWidget = lazy(() => import('../components/chatbot/ChatWidget'));

/** Applies the Super Admin's website theme (or the defaults) as CSS variables on the public site only. */
function ThemedSite({ children }) {
  const site = useSiteContent();
  return (
    <div data-site-theme="" style={themeCssVars(site?.themeAppearance)} className="flex min-h-screen flex-col bg-[var(--color-surface)] text-ink-900">
      {children}
    </div>
  );
}

export default function PublicLayout() {
  return (
    <SiteContentProvider>
      <ConsentProvider>
      <ThemedSite>
        <SiteJsonLd />
        <SkipLink />
        <Navbar />
        <main id="main-content" className="flex-1">
          <Outlet />
        </main>
        <Footer />
        <Suspense fallback={null}>
          <ChatWidget />
        </Suspense>
        <CookieBanner />
        <AnalyticsLoader />
      </ThemedSite>
      </ConsentProvider>
    </SiteContentProvider>
  );
}
