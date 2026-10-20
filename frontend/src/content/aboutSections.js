import { brand } from '../config/brand';

// The built-in sections of the About page, in the fixed order they appear under the banner. Each one is a "slot": the Super Admin's
// published About page (Pages -> About -> Sections) can replace its heading, text and image, or hide it. Anything left empty keeps
// the built-in text below. The copy makes no statistics, certifications, customer numbers or delivery guarantees.
//
// Text for "Our Approach" and "Our Commitment to Customers" is a list: a paragraph written as "Title: text" becomes a numbered
// step / a pillar, and any other paragraph is plain introduction text (see utils/aboutContent.js).
export const ABOUT_SLOTS = [
  {
    key: 'who',
    label: 'Who We Are',
    heading: 'Who We Are',
    body: [
      `${brand.name} is a freight brokerage providing transportation solutions for shippers and carriers across North America.`,
      'We coordinate domestic and cross-border truck freight within the United States and between the U.S., Canada and Mexico, working with a network of carriers to move our customers’ shipments.',
    ].join('\n\n'),
  },
  {
    key: 'mission',
    label: 'Our Mission',
    heading: 'Our Mission',
    body: 'To simplify freight coordination through dependable service, clear communication and professional carrier relationships.',
  },
  {
    key: 'approach',
    label: 'Our Approach',
    heading: 'Our Approach',
    body: [
      'Every shipment is different. We keep the process simple and built around what your freight needs.',
      'Understand the shipment: We start by learning what is being moved, where it needs to go and the equipment, timing and handling it requires.',
      'Coordinate the right carrier: We work with appropriate carriers from our network, matched to your freight, lane and equipment.',
      'Stay in communication: We keep you informed while your freight moves, from pickup through delivery.',
    ].join('\n\n'),
  },
  {
    key: 'apart',
    label: 'What Sets Us Apart (heading and introduction)',
    heading: 'What Sets Us Apart',
    body: 'A carrier network, broad coverage and a responsive team, built around the needs of each shipment.',
  },
  { key: 'card-capacity', label: 'What Sets Us Apart: card 1', heading: 'Reliable Capacity', body: 'A carrier network built around dependable coverage.', icon: 'shield' },
  { key: 'card-coverage', label: 'What Sets Us Apart: card 2', heading: 'Nationwide Coverage', body: 'Freight coordination across the United States.', icon: 'map' },
  { key: 'card-border', label: 'What Sets Us Apart: card 3', heading: 'Cross-Border Expertise', body: 'Transportation between the U.S., Canada and Mexico.', icon: 'globe' },
  { key: 'card-service', label: 'What Sets Us Apart: card 4', heading: 'Responsive Service', body: 'Communication from our team while your freight moves.', icon: 'headset' },
  {
    key: 'commitment',
    label: 'Our Commitment to Customers',
    heading: 'Our Commitment to Customers',
    body: [
      'We treat every shipment as a responsibility and aim to make the process straightforward for the people who depend on us.',
      'Clear communication: We keep you informed with straightforward updates while your freight moves.',
      'Thoughtful coordination: We take the time to understand your freight and plan each move with care.',
      'Customer-focused service: We start with what your shipment needs and build the move around it.',
    ].join('\n\n'),
  },
  {
    key: 'cta',
    label: 'Call to action (the two buttons always go to Request a Quote and Become a Carrier)',
    heading: 'Let\'s Move Freight Forward',
    body: 'Tell us what you need to move and our team will help coordinate the right transportation solution.',
  },
];

export const ABOUT_KEYS = Object.fromEntries(ABOUT_SLOTS.map((slot, index) => [slot.key, index]));
