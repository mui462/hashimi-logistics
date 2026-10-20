import { brand } from '../config/brand';

export const about = {
  who: [
    `${brand.name} is a freight brokerage providing transportation solutions for shippers and carriers across North America.`,
    'We coordinate domestic and cross-border truck freight and work with a network of carriers to move our customers’ shipments.',
  ],
  mission: 'To simplify freight transportation through reliable carrier relationships, responsive service and practical logistics solutions.',
  vision: 'To become a trusted transportation partner for businesses that value reliability, transparency and service.',
  values: [
    { icon: 'shield', title: 'Reliability', text: 'We aim to be dependable in how we plan, communicate and follow through.' },
    { icon: 'scale', title: 'Integrity', text: 'We are honest with shippers and carriers about what we can and cannot do.' },
    { icon: 'message', title: 'Communication', text: 'We keep people informed before, during and after the move.' },
    { icon: 'gauge', title: 'Efficiency', text: 'We keep processes simple so freight gets moving.' },
    { icon: 'handshake', title: 'Partnership', text: 'We build working relationships with the shippers and carriers we serve.' },
  ],
};

export const shipperSections = [
  { icon: 'network', title: 'Carrier Network', text: 'Access to a network of carriers matched to your freight, equipment and lanes.' },
  { icon: 'clipboard', title: 'Freight Coordination', text: 'Our team coordinates the move from quote request through delivery.' },
  { icon: 'eye', title: 'Shipment Visibility', text: 'Look up a shipment with its tracking number on the Track Shipment page.' },
  { icon: 'route', title: 'Flexible Transportation', text: 'Full truckload, LTL and specialized equipment for different kinds of freight.' },
  { icon: 'globe', title: 'Cross-Border Support', text: 'Transportation between the U.S., Canada and Mexico.' },
  { icon: 'message', title: 'Responsive Communication', text: 'Clear communication with a team that is easy to reach.' },
];

export const carrierSections = [
  { icon: 'truck', title: 'Freight Opportunities', text: 'Opportunities to haul freight across domestic and cross-border lanes.' },
  { icon: 'headset', title: 'Professional Support', text: 'A coordination team that supports carriers during the move.' },
  { icon: 'file', title: 'Digital Documentation', text: 'Submit onboarding and shipment documents online.' },
  { icon: 'clipboard', title: 'Shipment Coordination', text: 'Clear pickup and delivery details for each load.' },
  { icon: 'globe', title: 'Cross-Border Opportunities', text: 'Opportunities for carriers capable of crossing the border.' },
  { icon: 'eye', title: 'Transparent Process', text: 'A clear process from application to hauling freight.' },
];

export const carrierRequirements = [
  'Active operating authority',
  'Valid insurance coverage',
  'A completed W-9',
  'A signed carrier agreement',
  'Contact and equipment details',
];

export const carrierResourceCards = [
  { icon: 'clipboard', title: 'Carrier Onboarding Guide', text: 'Apply through the Become a Carrier page. Our team will review your application and contact you about next steps.' },
  { icon: 'file', title: 'Document Requirements', text: 'Documents such as a W-9, insurance, operating authority and a carrier agreement may be requested. Our team will confirm what is required.' },
  { icon: 'dollar', title: 'Payment Information', text: 'Carrier payment terms are provided according to the applicable agreement. They are not published on this website.' },
  { icon: 'check', title: 'POD Instructions', text: 'Proof of delivery instructions are provided to carriers by our team.' },
  { icon: 'help', title: 'Carrier FAQ', text: 'Answers to common questions from carriers.', to: '/faq' },
  { icon: 'headset', title: 'Support', text: 'Questions about onboarding or a load? Contact our team.', to: '/contact' },
];

export const articleCategories = ['Freight', 'Transportation', 'Cross-Border', 'Carrier Resources', 'Industry', 'Company News'];

export const legal = {
  notice:
    'This page is a placeholder structure and not legal advice. The final text must be prepared or reviewed by a qualified legal professional before the site goes live.',
  privacy: [
    { title: 'Introduction', text: 'This section will explain who operates this website and how this policy applies to you.' },
    { title: 'Information We Collect', text: 'This section will describe the categories of information collected through forms and other interactions on the website.' },
    { title: 'How We Use Information', text: 'This section will describe the purposes for which information is used.' },
    { title: 'Sharing of Information', text: 'This section will describe if and when information is shared with others.' },
    { title: 'Data Retention and Security', text: 'This section will describe retention and security practices once they are confirmed.' },
    { title: 'Your Choices and Rights', text: 'This section will describe the choices and rights available to you.' },
    { title: 'Changes to This Policy', text: 'This section will describe how updates to the policy are communicated.' },
    { title: 'Contact', text: 'This section will tell you how to contact the company about privacy questions.' },
  ],
  terms: [
    { title: 'Acceptance of Terms', text: 'This section will describe how use of the website relates to these terms.' },
    { title: 'Use of the Website', text: 'This section will describe acceptable use of the website.' },
    { title: 'Quotes and Services', text: 'This section will describe how quote requests and services are handled, once confirmed by the company.' },
    { title: 'Carrier Applications', text: 'This section will describe how carrier applications are handled, once confirmed by the company.' },
    { title: 'Intellectual Property', text: 'This section will describe ownership of website content.' },
    { title: 'Disclaimers and Limitation of Liability', text: 'This section will be completed with the company’s legal counsel.' },
    { title: 'Changes to These Terms', text: 'This section will describe how updates to the terms are communicated.' },
    { title: 'Contact', text: 'This section will tell you how to contact the company about these terms.' },
  ],
};
