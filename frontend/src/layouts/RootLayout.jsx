import { Outlet, ScrollRestoration } from 'react-router-dom';
import AnalyticsLoader from '../components/consent/AnalyticsLoader';
import CookieBanner from '../components/consent/CookieBanner';
import { ConsentProvider } from '../context/ConsentContext';

export default function RootLayout() {
  return (
    <ConsentProvider>
      <Outlet />
      <ScrollRestoration />
      <CookieBanner />
      <AnalyticsLoader />
    </ConsentProvider>
  );
}
