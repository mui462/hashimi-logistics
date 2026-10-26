// Cookie and tracking consent settings. Strictly necessary cookies (sign-in, security, remembering this choice) never need consent
// and are not listed here. Every category below is OFF until the visitor allows it.
export const CONSENT_STORAGE_KEY = 'hashimi_cookie_consent';

// Set (for this browser session only) when the visitor closes the banner without choosing. The banner then stays away until
// they do something that uses cookies (sign in, register, send a form), or open Cookie settings.
export const CONSENT_DISMISS_KEY = 'hashimi_cookie_banner_dismissed';

// Bump when a category is added, removed or covers something new: everybody is then asked again.
export const CONSENT_VERSION = 1;

// A saved choice is asked again after this long.
export const CONSENT_MAX_AGE_DAYS = 365;

export const NECESSARY_COPY = {
  title: 'Strictly necessary',
  description: 'Keep you signed in and the website secure, and remember this choice. They cannot be turned off.',
};

export const CONSENT_CATEGORIES = [
  { key: 'analytics', title: 'Analytics', description: 'Help us understand how the website is used so we can improve it.' },
  { key: 'marketing', title: 'Marketing', description: 'Show relevant advertising and measure how well campaigns work.' },
];
