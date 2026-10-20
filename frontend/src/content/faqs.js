import { brand } from '../config/brand';

// FAQ content. Deliberately makes no promises the client has not confirmed: no payment terms,
// response times, transit times, guarantees or regulatory claims. The CMS can replace it later.
export const faqCategories = ['Shippers', 'Carriers', 'Quotes', 'Tracking', 'Cross-Border', 'General'];

export const faqs = [
  { id: 'what-freight', category: 'General', q: `What kind of freight can ${brand.shortName} help move?`, a: 'We coordinate truck transportation, including full truckload, LTL, dry van, reefer, flatbed, expedited, specialized and cross-border freight. If your shipment does not fit one of those, describe it in a quote request and our team will review it and confirm available options.', preview: true },
  { id: 'how-quote', category: 'Quotes', q: 'How do I request a quote?', a: 'Use the Request a Quote form and tell us about pickup and delivery, your freight, the service you need and how to reach you. Our team will review your shipment details and confirm available options.', preview: true },
  { id: 'cross-border', category: 'Cross-Border', q: 'Do you coordinate freight between the U.S., Canada and Mexico?', a: 'Yes. We coordinate truck transportation between the United States and Canada and between the United States and Mexico. This website does not offer customs brokerage or legal advice.', preview: true },
  { id: 'tracking', category: 'Tracking', q: 'How can I track my shipment?', a: 'The Track Shipment page lets you look up a shipment with the tracking number provided by our team. Online tracking depends on the shipment being set up for it, so if you cannot find a shipment, contact us.', preview: true },
  { id: 'carriers', category: 'Carriers', q: `How do carriers work with ${brand.shortName}?`, a: 'Carriers can apply through the Become a Carrier page. Our team will review the application and contact the carrier about next steps.', preview: true },
  { id: 'quote-info', category: 'Quotes', q: 'What information should I include in a quote request?', a: 'Pickup and delivery locations, dates, a description of the freight, weight and quantity, the equipment you need, and any temperature or handling requirements. The more detail you share, the easier it is to coordinate the right transportation.' },
  { id: 'quote-response', category: 'Quotes', q: 'How quickly will I hear back about my quote?', a: 'Response times may vary depending on shipment details and operational requirements. If your shipment is urgent, say so in your request or contact our team directly.' },
  { id: 'shipper-equipment', category: 'Shippers', q: 'Can I choose the type of trailer?', a: 'Yes. Tell us which equipment you need in the quote request. If you are unsure, describe the freight and we will help you choose.' },
  { id: 'shipper-ltl', category: 'Shippers', q: 'Do I need a full truckload?', a: 'Not always. Full truckload suits larger shipments, while LTL can suit smaller shipments that do not fill a trailer. Share your freight details and we will help you decide.' },
  { id: 'carrier-docs', category: 'Carriers', q: 'What documents do carriers need to provide?', a: 'Documents such as a W-9, insurance, operating authority and a carrier agreement are requested after we review your application. Our team will confirm which documents are required for your situation and how to send them.' },
  { id: 'carrier-payment', category: 'Carriers', q: 'What are the payment terms for carriers?', a: 'Carrier payment terms are provided according to the applicable agreement. They are not published on this website.' },
  { id: 'track-statuses', category: 'Tracking', q: 'What do the tracking statuses mean?', a: 'Statuses describe where a shipment is in its journey, for example booked, dispatched, picked up, in transit and delivered. Cross-border shipments can also show border statuses; domestic shipments do not.' },
  { id: 'track-missing', category: 'Tracking', q: 'Why can’t I find my tracking number?', a: 'Check the number for typing errors. If it still cannot be found, contact our team and we will help.' },
  { id: 'border-docs', category: 'Cross-Border', q: 'Do you provide customs brokerage?', a: 'No. This website does not offer customs brokerage or legal services. We coordinate the transportation of cross-border freight.' },
  { id: 'general-areas', category: 'General', q: 'Where do you coordinate freight?', a: 'Across the United States, Canada and Mexico: domestic U.S. freight and cross-border freight between the U.S. and Canada and between the U.S. and Mexico.' },
  { id: 'general-contact', category: 'General', q: 'How do I contact the team?', a: 'Use the Contact page to send us a message. Phone and email details are shown on this website once they are published.' },
];
