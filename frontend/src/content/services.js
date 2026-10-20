// Central service catalogue. Drives the homepage grid, /services and /services/:slug.
// Copy is deliberately general: it describes what each mode of transportation is, and makes no
// claims about capacity, transit times, rates or guarantees. The CMS can replace this later.
export const services = [
  {
    slug: 'full-truckload',
    title: 'Full Truckload (FTL)',
    short: 'Dedicated trailer capacity for shipments that fill or nearly fill a truck.',
    icon: 'truck',
    scene: 'highway',
    intro:
      'Full truckload moves one shipper’s freight on one trailer, point to point. It suits shipments with enough volume or weight to justify a dedicated truck, or freight that should not be handled along the way.',
    handles: ['Palletized and floor-loaded freight', 'Large or heavy shipments', 'Time-sensitive, point-to-point moves', 'Recurring lanes and one-time moves'],
    benefits: ['Dedicated trailer for your shipment', 'Direct movement from origin to destination', 'Less handling between pickup and delivery', 'One coordination contact from request to delivery'],
    equipment: ['Dry van trailers', 'Refrigerated (reefer) trailers', 'Flatbed trailers', 'Other equipment on request'],
    industries: ['manufacturing', 'retail', 'consumer-goods', 'industrial'],
  },
  {
    slug: 'ltl',
    title: 'Less-Than-Truckload (LTL)',
    short: 'Share trailer space for smaller shipments that do not need a full truck.',
    icon: 'boxes',
    scene: 'warehouse',
    intro:
      'Less-than-truckload moves smaller shipments by sharing trailer space with other freight. It can be a practical choice when a shipment is too small for a full truck.',
    handles: ['Palletized freight', 'Smaller commercial shipments', 'Shipments that do not fill a trailer', 'Regional and longer-distance moves'],
    benefits: ['Pay for the space your freight uses', 'A practical fit for smaller loads', 'Coordinated by our team from quote to delivery'],
    equipment: ['Dry van trailers', 'Liftgate or special handling when required'],
    industries: ['retail', 'consumer-goods', 'industrial', 'manufacturing'],
  },
  {
    slug: 'dry-van',
    title: 'Dry Van',
    short: 'Enclosed trailers for general freight that needs protection from the weather.',
    icon: 'container',
    scene: 'dryvan',
    intro:
      'Dry van trailers are enclosed and non-refrigerated. They are the common choice for general palletized and boxed freight that should stay protected during transit.',
    handles: ['Palletized and boxed goods', 'Packaged consumer products', 'Non-temperature-controlled freight', 'Dock-to-dock deliveries'],
    benefits: ['Enclosed, weather-protected freight', 'Suited to dock loading and unloading', 'Widely used for general freight'],
    equipment: ['Enclosed dry van trailers'],
    industries: ['retail', 'consumer-goods', 'automotive', 'manufacturing'],
  },
  {
    slug: 'reefer',
    title: 'Reefer (Temperature-Controlled)',
    short: 'Refrigerated trailers for freight that must stay within a set temperature range.',
    icon: 'snowflake',
    scene: 'reefer',
    intro:
      'Reefer trailers carry a refrigeration unit to hold a requested temperature. Tell us the temperature requirements when you request a quote so we can coordinate suitable equipment.',
    handles: ['Chilled and frozen products', 'Temperature-sensitive goods', 'Freight with specific temperature instructions'],
    benefits: ['Temperature requirements captured at quote stage', 'Equipment matched to your instructions', 'Clear communication throughout the move'],
    equipment: ['Refrigerated (reefer) trailers'],
    industries: ['food-beverage', 'agriculture', 'consumer-goods'],
  },
  {
    slug: 'flatbed',
    title: 'Flatbed',
    short: 'Open-deck trailers for oversized, heavy or hard-to-load freight.',
    icon: 'layers',
    scene: 'flatbed',
    intro:
      'Flatbed trailers have an open deck that can be loaded from the top or sides. They suit freight that does not fit inside an enclosed trailer or that needs a crane or forklift to load.',
    handles: ['Building and construction materials', 'Machinery and equipment', 'Steel and other heavy goods', 'Freight that is loaded from the side or top'],
    benefits: ['Flexible loading for awkward freight', 'Suited to heavy or oversized items', 'Securement planned with the carrier'],
    equipment: ['Flatbed trailers', 'Tarps and securement as required'],
    industries: ['construction', 'industrial', 'manufacturing'],
  },
  {
    slug: 'expedited',
    title: 'Expedited Freight',
    short: 'Priority transportation for shipments with tight timelines.',
    icon: 'zap',
    scene: 'highway',
    intro:
      'When a shipment has a tight deadline, expedited service prioritizes speed of coordination and movement. Share your required pickup and delivery dates and we will confirm what is possible.',
    handles: ['Urgent, deadline-driven shipments', 'Production-critical parts and supplies', 'Last-minute or unplanned moves'],
    benefits: ['Prioritized coordination', 'Your required dates are shared with the team up front', 'Direct communication while the shipment moves'],
    equipment: ['Equipment chosen to suit the shipment and timeline'],
    industries: ['automotive', 'manufacturing', 'retail'],
  },
  {
    slug: 'specialized',
    title: 'Specialized Freight',
    short: 'Coordination for freight with unusual size, handling or equipment needs.',
    icon: 'package',
    scene: 'flatbed',
    intro:
      'Some freight needs more than a standard trailer. Describe your shipment and we will work with you and our carrier network to find a suitable way to move it.',
    handles: ['Oversized or unusual freight', 'Freight with special handling instructions', 'Shipments needing non-standard equipment'],
    benefits: ['Requirements reviewed before booking', 'Carrier selection based on the freight', 'Clear communication on what is needed'],
    equipment: ['Equipment discussed per shipment'],
    industries: ['industrial', 'construction', 'manufacturing'],
  },
  {
    slug: 'cross-border',
    title: 'Cross-Border Freight',
    short: 'Transportation between the United States, Canada and Mexico.',
    icon: 'globe',
    scene: 'border',
    intro:
      'We coordinate truck transportation between the United States and Canada, and between the United States and Mexico. This website does not offer customs brokerage or legal advice; border paperwork remains the shipper’s responsibility to arrange with qualified professionals.',
    handles: ['U.S. ↔ Canada truck freight', 'U.S. ↔ Mexico truck freight', 'Freight moving on dry van, reefer or flatbed equipment'],
    benefits: ['Transportation coordinated across borders', 'Cross-border capable carrier relationships', 'Shipment visibility and professional communication'],
    equipment: ['Dry van trailers', 'Reefer trailers', 'Flatbed trailers'],
    industries: ['automotive', 'manufacturing', 'food-beverage', 'retail'],
  },
];

export const getServiceBySlug = (slug) => services.find((service) => service.slug === slug);
