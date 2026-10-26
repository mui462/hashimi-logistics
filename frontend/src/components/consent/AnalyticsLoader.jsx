import { useEffect } from 'react';
import { useConsent } from '../../context/ConsentContext';

const configuredId = (import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();
const VALID_ID = /^G-[A-Z0-9]{4,20}$/i;

// Google Analytics cookies are _ga and _ga_<id>. They are first-party, so they are removed from this host and its parent domain.
function clearGoogleAnalyticsCookies() {
  const names = document.cookie.split(';').map((part) => part.split('=')[0].trim()).filter((name) => name === '_ga' || name.startsWith('_ga_'));
  const parts = location.hostname.split('.');
  const domains = ['', location.hostname, ...(parts.length > 2 ? [parts.slice(-2).join('.')] : [])];
  for (const name of names) {
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ''}`;
    }
  }
}

/**
 * Loads Google Analytics (GA4) only while the visitor allows the "analytics" category, and only if VITE_GA_MEASUREMENT_ID is
 * set. Without consent nothing is downloaded, no request is made and no cookie is set. If the visitor withdraws consent the
 * script is removed, collection is switched off and the Analytics cookies are deleted.
 * This is the pattern for any optional script: gate it on `useConsent().hasConsent(category)`.
 */
export default function AnalyticsLoader({ measurementId = configuredId }) {
  const consent = useConsent();
  const allowed = Boolean(consent?.hasConsent('analytics'));

  useEffect(() => {
    if (!allowed || !VALID_ID.test(measurementId)) return undefined;
    window[`ga-disable-${measurementId}`] = false;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', measurementId, { anonymize_ip: true });
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.dataset.consentCategory = 'analytics';
    document.head.appendChild(script);
    return () => {
      window[`ga-disable-${measurementId}`] = true;
      script.remove();
      clearGoogleAnalyticsCookies();
    };
  }, [allowed, measurementId]);

  return null;
}
