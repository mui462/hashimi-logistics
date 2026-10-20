import { ACCOUNT_TYPES } from './constants';

export const PATHS = Object.freeze({
  home: '/',
  about: '/about',
  services: '/services',
  industries: '/industries',
  serviceAreas: '/service-areas',
  forShippers: '/for-shippers',
  forCarriers: '/for-carriers',
  howItWorks: '/how-it-works',
  trackShipment: '/track-shipment',
  requestQuote: '/request-quote',
  becomeCarrier: '/become-a-carrier',
  carrierResources: '/carrier-resources',
  resources: '/resources',
  faq: '/faq',
  contact: '/contact',
  privacy: '/privacy-policy',
  terms: '/terms',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  verifyEmail: '/verify-email',
  adminLogin: '/admin/login',
  customer: '/customer',
  carrier: '/carrier',
  admin: '/admin',
});

export const ROLE_HOME_PATHS = Object.freeze({
  [ACCOUNT_TYPES.SUPER_ADMIN]: PATHS.admin,
  [ACCOUNT_TYPES.CUSTOMER]: PATHS.customer,
  [ACCOUNT_TYPES.CARRIER]: PATHS.carrier,
});
