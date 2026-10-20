import { PATHS } from './paths';

// Desktop/mobile primary navigation, in the order requested by the brief.
export const primaryNavLinks = [
  { label: 'Home', to: PATHS.home, end: true },
  { label: 'About', to: PATHS.about },
  { label: 'Services', to: PATHS.services },
  { label: 'Industries', to: PATHS.industries },
  { label: 'Service Areas', to: PATHS.serviceAreas },
  { label: 'For Shippers', to: PATHS.forShippers },
  { label: 'For Carriers', to: PATHS.forCarriers },
  { label: 'Resources', to: PATHS.resources },
  { label: 'Track Shipment', to: PATHS.trackShipment },
];

/**
 * Header navigation (second navbar row). Track Shipment and Request a Quote are header actions in the top row; the
 * less-used pages (Become a Carrier, FAQ) sit in a "More" dropdown so the row stays uncrowded.
 */
export const headerNavItems = [
  { label: 'Home', to: PATHS.home, end: true },
  { label: 'About', to: PATHS.about },
  { label: 'Services', to: PATHS.services },
  { label: 'Industries', to: PATHS.industries },
  { label: 'Service Areas', to: PATHS.serviceAreas },
  { label: 'For Shippers', to: PATHS.forShippers },
  { label: 'For Carriers', to: PATHS.forCarriers },
  { label: 'How It Works', to: PATHS.howItWorks },
  { label: 'Resources', to: PATHS.resources },
  { label: 'Contact', to: PATHS.contact },
  {
    label: 'More',
    children: [
      { label: 'Become a Carrier', to: PATHS.becomeCarrier },
      { label: 'FAQ', to: PATHS.faq },
    ],
  },
];

export const footerLinks = [
  { label: 'About', to: PATHS.about },
  { label: 'Services', to: PATHS.services },
  { label: 'Industries', to: PATHS.industries },
  { label: 'Service Areas', to: PATHS.serviceAreas },
  { label: 'For Shippers', to: PATHS.forShippers },
  { label: 'For Carriers', to: PATHS.forCarriers },
  { label: 'Resources', to: PATHS.resources },
  { label: 'Track Shipment', to: PATHS.trackShipment },
  { label: 'Request a Quote', to: PATHS.requestQuote },
  { label: 'Contact', to: PATHS.contact },
];

export const legalLinks = [
  { label: 'Privacy Policy', to: PATHS.privacy },
  { label: 'Terms', to: PATHS.terms },
];
