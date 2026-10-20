import { CarrierApplication } from '../models/CarrierApplication.js';
import { ContactMessage } from '../models/ContactMessage.js';
import { QuoteRequest } from '../models/QuoteRequest.js';
import { Shipment } from '../models/Shipment.js';
import { crossesBorder } from '../models/helpers/crossBorder.js';
import { presentTracking } from '../customer/customer.presenters.js';
import { notifySuperAdmins } from '../operations/notifications.service.js';
import { recordActivity } from '../services/activity.service.js';
import { nextQuoteNumber } from '../services/numbering.service.js';
import { ApiError } from '../utils/ApiError.js';
import { OPERATING_REGION_LABELS } from './public.validator.js';

/**
 * Public website submissions (no account). Every value stored comes from the validated body; status, ownership and review
 * fields are always set here, never by the visitor. Nothing is e-mailed: the Super Admin is alerted in-app and works the
 * record from the admin panel. A repeat of the same submission within a few minutes (a double click, a retry after a slow
 * network) returns the first record instead of creating a second one.
 */

const REPEAT_WINDOW_MS = 10 * 60 * 1000;
const recent = () => ({ $gte: new Date(Date.now() - REPEAT_WINDOW_MS) });

/* ---------- guest quote request ---------- */

export async function createGuestQuote(input, context) {
  const repeat = await QuoteRequest.findOne({
    source: 'public',
    'contactInformation.email': input.contactInformation.email,
    commodity: input.commodity,
    pickupDate: input.pickupDate,
    'origin.city': input.origin.city,
    'destination.city': input.destination.city,
    createdAt: recent(),
  })
    .select('quoteNumber')
    .lean();
  if (repeat) return { quoteNumber: repeat.quoteNumber };

  const isCrossBorder = crossesBorder(input.origin.country, input.destination.country);
  const quote = await QuoteRequest.create({
    ...input,
    source: 'public',
    quoteNumber: await nextQuoteNumber(),
    status: 'new',
    isCrossBorder,
    originCountry: input.origin.country,
    destinationCountry: input.destination.country,
  });

  await recordActivity({
    action: 'public.quote.requested',
    module: 'quotes',
    entityId: quote._id,
    description: 'A guest submitted a quote request from the website.',
    metadata: { quoteNumber: quote.quoteNumber, isCrossBorder, source: 'public' },
    context,
  });
  await notifySuperAdmins({
    type: 'quote',
    title: 'A new guest quote request arrived',
    message: `Quote request ${quote.quoteNumber} came from the website (no customer account) and is waiting for review.`,
    entityType: 'quote',
    entityId: quote._id,
    eventKey: `quote.created:${quote._id}`,
  });

  return { quoteNumber: quote.quoteNumber };
}

/* ---------- carrier application ---------- */

export async function createCarrierApplication(input, context) {
  const MCNumber = input.mcNumber;
  const DOTNumber = input.dotNumber;
  // One open application per carrier. The answer is the same whether or not one already existed, so the form cannot be
  // used to find out which carriers have applied.
  const open = await CarrierApplication.findOne({
    archivedAt: null,
    status: { $in: ['pending', 'under_review'] },
    $or: [{ MCNumber }, { DOTNumber }, { email: input.email }],
  })
    .select('_id')
    .lean();
  if (open) return { received: true };

  const application = await CarrierApplication.create({
    companyName: input.companyName,
    contactPerson: input.contactPerson,
    email: input.email,
    phone: input.phone,
    address: { street: input.address },
    MCNumber,
    DOTNumber,
    equipmentTypes: input.equipmentTypes,
    operatingRegions: input.operatingRegions.map((region) => OPERATING_REGION_LABELS[region]),
    crossBorderCapability: input.crossBorder === 'yes',
    applicantNotes: input.notes,
    // Always starts at the beginning of review. Approval (authority, insurance, compliance) is the Super Admin's decision.
    status: 'pending',
  });

  await recordActivity({
    action: 'public.carrier_application.submitted',
    module: 'carrier_applications',
    entityId: application._id,
    description: 'A carrier applied from the website.',
    context,
  });
  await notifySuperAdmins({
    type: 'carrier_application',
    title: 'A new carrier application arrived',
    message: 'A carrier applied from the website and is waiting for review.',
    entityType: 'carrier_application',
    entityId: application._id,
    eventKey: `carrier_application.created:${application._id}`,
  });

  return { received: true };
}

/* ---------- contact message ---------- */

export async function createContactMessage(input, context) {
  const repeat = await ContactMessage.findOne({ email: input.email, subject: input.subject, message: input.message, createdAt: recent() })
    .select('_id')
    .lean();
  if (repeat) return { received: true };

  const message = await ContactMessage.create({ ...input, status: 'new' });

  await recordActivity({
    action: 'public.contact.received',
    module: 'contact_messages',
    entityId: message._id,
    description: 'A contact message arrived from the website.',
    metadata: { interest: input.interest },
    context,
  });
  // No sender details in the alert: it may be delivered by e-mail or SMS later. The message is read in the admin inbox.
  await notifySuperAdmins({
    type: 'system',
    title: 'A new contact message arrived',
    message: 'A visitor sent a message through the website contact form. Open Contact messages in the admin panel to read it.',
    eventKey: `contact_message.created:${message._id}`,
  });

  return { received: true };
}

/* ---------- public tracking ---------- */

/**
 * Looks a tracking number up across all active shipments. The answer is the public tracking view only: number, status,
 * cross-border flag and events reduced to status, time and city-level place. No customer, carrier, rate, document,
 * note or free-text event description is ever read or returned.
 */
export async function trackPublicShipment(trackingNumber) {
  const shipment = await Shipment.findOne({ trackingNumber: trackingNumber.toUpperCase() })
    .active()
    .select('trackingNumber status borderStatus trackingEvents.status trackingEvents.timestamp trackingEvents.location')
    .lean();
  if (!shipment) throw ApiError.notFound('No shipment was found for that tracking number.', 'SHIPMENT_NOT_FOUND');
  return presentTracking(shipment);
}
