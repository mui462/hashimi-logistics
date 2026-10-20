import { brand } from '../config/brand';

// Shared marketing content used on the homepage and several inner pages.
// Prop-driven section components read from here today; the Phase 9 CMS can supply the same shapes.

export const trustItems = [
  { icon: 'shield', title: 'Reliable Capacity', text: 'A carrier network built around dependable coverage.' },
  { icon: 'map', title: 'Nationwide Coverage', text: 'Freight coordination across the United States.' },
  { icon: 'globe', title: 'Cross-Border Expertise', text: 'Transportation between the U.S., Canada and Mexico.' },
  { icon: 'headset', title: 'Responsive Service', text: 'Communication from our team while your freight moves.' },
];

export const whyItems = [
  { icon: 'network', title: 'Reliable Carrier Network', text: 'We work with carriers who are matched to your freight, lane and equipment needs.' },
  { icon: 'clipboard', title: 'Professional Freight Coordination', text: 'One team coordinates pickup, transit and delivery so you are not chasing details.' },
  { icon: 'message', title: 'Clear Communication', text: 'Straightforward updates from request through delivery.' },
  { icon: 'route', title: 'Flexible Transportation Solutions', text: 'Full truckload, LTL and specialized equipment to suit the shipment in front of you.' },
  { icon: 'globe', title: 'Domestic & Cross-Border Capability', text: 'One partner for freight inside the U.S. and between the U.S., Canada and Mexico.' },
  { icon: 'users', title: 'Customer-Focused Service', text: 'We start with what your shipment needs and build the move around it.' },
];

export const howItWorksSteps = [
  { title: 'Tell Us About Your Shipment', text: 'Share pickup and delivery details, your freight and the service you need.' },
  { title: 'We Coordinate Transportation', text: 'Our team lines up suitable equipment and carrier capacity for your move.' },
  { title: 'Your Freight Moves', text: 'The carrier picks up and transports your freight to its destination.' },
  { title: 'Stay Informed', text: 'We keep you informed while your freight moves.' },
];

// Detailed seven-step process for /how-it-works.
export const detailedSteps = [
  { title: 'Tell Us About Your Shipment', text: 'Submit a quote request with pickup and delivery locations, freight details and any special requirements.' },
  { title: 'We Coordinate Transportation', text: 'Our team reviews your request and works out the right equipment, service type and carrier approach.' },
  { title: 'Carrier Assignment', text: 'A suitable carrier is selected and confirmed for your shipment.' },
  { title: 'Pickup', text: 'The carrier collects the freight from the origin location.' },
  { title: 'In Transit', text: 'Your freight travels to its destination. For cross-border moves, the shipment also passes through the border.' },
  { title: 'Delivery', text: 'The carrier delivers the freight to the destination.' },
  { title: 'Shipment Completion', text: 'Delivery is confirmed and the shipment is closed out with you.' },
];

export const crossBorder = {
  title: 'Cross-Border Freight Across North America',
  intro: 'We coordinate truck transportation between the United States and its neighbours, with the same professional communication on both sides of the border.',
  lanes: [
    { title: 'U.S. ↔ Canada', text: 'Truck freight between the United States and Canada.' },
    { title: 'U.S. ↔ Mexico', text: 'Truck freight between the United States and Mexico.' },
  ],
  items: [
    { icon: 'flag', title: 'Border Coordination', text: 'Transportation planned with the border crossing in mind.' },
    { icon: 'truck', title: 'Cross-Border Carrier Capacity', text: 'Carrier relationships suited to cross-border moves.' },
    { icon: 'eye', title: 'Shipment Visibility', text: 'Status updates, including border statuses on cross-border shipments.' },
    { icon: 'message', title: 'Professional Communication', text: 'Clear contact before, during and after the crossing.' },
  ],
  disclaimer: `${brand.shortName} coordinates transportation. This website does not offer customs brokerage or legal services.`,
};

export const serviceAreas = [
  {
    slug: 'united-states',
    country: 'United States',
    title: 'U.S. Domestic Freight',
    text: 'Truckload and LTL freight coordinated within the United States.',
    regions: [],
  },
  {
    slug: 'canada',
    country: 'Canada',
    title: 'U.S. ↔ Canada',
    text: 'Cross-border truck freight between the United States and Canada.',
    regions: [],
  },
  {
    slug: 'mexico',
    country: 'Mexico',
    title: 'U.S. ↔ Mexico',
    text: 'Cross-border truck freight between the United States and Mexico.',
    regions: [],
  },
];

// Statistics are configurable and placeholder-based. No business figures are shown or implied.
// Every item is a neutral label; an item may carry an optional `value` once the client confirms a real
// figure (the Super Admin CMS will supply it). Set enabled:false to hide the section entirely.
export const stats = {
  enabled: true,
  title: 'Built for North American Freight',
  items: [
    { icon: 'globe', label: 'North American Coverage', text: 'United States, Canada and Mexico.' },
    { icon: 'truck', label: 'Domestic & Cross-Border Lanes', text: 'Freight within the U.S. and across borders.' },
    { icon: 'eye', label: 'Shipment Updates', text: 'We keep you informed while your freight moves.' },
    { icon: 'headset', label: 'Dedicated Coordination', text: 'A team that stays in touch.' },
  ],
};

// No testimonials are published until real, approved customer quotes exist.
export const testimonials = [];

export const finalCta = {
  title: 'Ready to Move Your Freight?',
  text: 'Tell us what you need to move and our team will help coordinate the right transportation solution.',
};
