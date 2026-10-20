import { Customer } from '../models/Customer.js';
import { Load } from '../models/Load.js';
import { QuoteRequest } from '../models/QuoteRequest.js';
import { selectionFor } from '../models/accessProjections.js';
import { recordActivity } from '../services/activity.service.js';
import { nextLoadNumber } from '../services/numbering.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ACCOUNT_TYPES } from '../utils/constants.js';
import { assertApplied, escapeRegex, laneLabel, pagination, skipFor } from './common.js';
import { notifyUser } from './notifications.service.js';
import { presentQuote, presentQuoteSummary } from './operations.presenters.js';
import { buildPricing } from './pricing.service.js';
import { quoteMachine } from './quoteStatus.service.js';

const ADMIN = selectionFor('QuoteRequest', ACCOUNT_TYPES.SUPER_ADMIN);
const DAY_MS = 24 * 60 * 60 * 1000;

const dayStart = (value) => new Date(`${value}T00:00:00.000Z`);
const dayEnd = (value) => new Date(`${value}T23:59:59.999Z`);

/* ---------- reads ---------- */

async function customersById(ids) {
  // Guest quotes from the public website have no customer, so missing ids are skipped rather than queried.
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (unique.length === 0) return new Map();
  const customers = await Customer.find({ _id: { $in: unique } }).select('companyName contactPerson email phone userId').lean();
  return new Map(customers.map((customer) => [String(customer._id), customer]));
}

async function findQuote(id) {
  const quote = await QuoteRequest.findOne({ _id: id }).active().select(ADMIN).lean();
  if (!quote) throw ApiError.notFound('Quote not found.', 'QUOTE_NOT_FOUND');
  return quote;
}

async function detail(quote) {
  const [customers, load] = await Promise.all([
    customersById([quote.customerId]),
    quote.loadId ? Load.findOne({ _id: quote.loadId }).select('loadNumber status').lean() : null,
  ]);
  return presentQuote(quote, { customer: customers.get(String(quote.customerId)), load });
}

export async function listQuotes({ page, limit, status, source, customerId, crossBorder, equipmentType, originCountry, destinationCountry, q, createdFrom, createdTo, sort, order }) {
  const filter = { archivedAt: null };
  if (status) filter.status = status;
  if (customerId) filter.customerId = customerId;
  // Quotes saved before guest requests existed have no `source`; they all came from the customer portal.
  if (source === 'public') filter.source = 'public';
  if (source === 'customer') filter.source = { $ne: 'public' };
  if (crossBorder) filter.isCrossBorder = crossBorder === 'true';
  if (equipmentType) filter.equipmentType = equipmentType;
  if (originCountry) filter['origin.country'] = originCountry;
  if (destinationCountry) filter['destination.country'] = destinationCountry;
  if (createdFrom || createdTo) {
    filter.createdAt = { ...(createdFrom ? { $gte: dayStart(createdFrom) } : {}), ...(createdTo ? { $lte: dayEnd(createdTo) } : {}) };
  }
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ quoteNumber: pattern }, { commodity: pattern }, { 'origin.city': pattern }, { 'destination.city': pattern }, { 'contactInformation.name': pattern }, { 'contactInformation.email': pattern }, { 'contactInformation.company': pattern }];
  }
  const direction = order === 'asc' ? 1 : -1;
  const [quotes, total] = await Promise.all([
    QuoteRequest.find(filter).select(ADMIN).sort({ [sort]: direction, _id: direction }).skip(skipFor(page, limit)).limit(limit).lean(),
    QuoteRequest.countDocuments(filter),
  ]);
  const customers = await customersById(quotes.map((quote) => quote.customerId));
  return {
    items: quotes.map((quote) => presentQuoteSummary(quote, { customer: customers.get(String(quote.customerId)) })),
    pagination: pagination(page, limit, total),
  };
}

export async function getQuote(id) {
  return { quote: await detail(await findQuote(id)) };
}

/* ---------- guarded transition ---------- */

/**
 * Moves a quote along one allowed edge. The write only matches while the quote still has the status that was read, so a
 * concurrent change makes this a 409 instead of a silent overwrite. (No multi-document transactions are available
 * on a standalone database, so each write is a single guarded document update.)
 */
async function moveQuote(quote, to, actor, set = {}) {
  quoteMachine.assertTransition(quote.status, to);
  const result = await QuoteRequest.updateOne(
    { _id: quote._id, status: quote.status, archivedAt: null },
    { $set: { status: to, updatedBy: actor.userId, ...set } }
  );
  assertApplied(result);
}

const audit = (actor, context, action, quote, description, metadata = {}) =>
  recordActivity({ userId: actor.userId, action: `operations.quote.${action}`, module: 'quotes', entityId: quote._id, description, metadata, context });

/** Guest quotes (public website, no account) cannot be sent through the portal or become a load: there is no customer. */
function assertHasCustomer(quote, action) {
  if (!quote.customerId) {
    throw ApiError.conflict(
      `This is a guest quote request from the website with no customer account, so it cannot be ${action}. Contact the requester directly using the details on the quote.`,
      'QUOTE_HAS_NO_CUSTOMER'
    );
  }
}

async function customerUserId(customerId) {
  const customer = await Customer.findById(customerId).select('userId').lean();
  return customer?.userId;
}

/* ---------- actions ---------- */

export async function reviewQuote(id, { internalNote }, actor, context) {
  const quote = await findQuote(id);
  await moveQuote(quote, 'reviewing', actor, {
    reviewedBy: actor.userId,
    ...(internalNote ? { internalNotes: internalNote } : {}),
  });
  await audit(actor, context, 'review_started', quote, `Quote ${quote.quoteNumber} moved to review.`, { from: quote.status, to: 'reviewing' });
  return getQuote(id);
}

export async function startPricing(id, actor, context) {
  const quote = await findQuote(id);
  await moveQuote(quote, 'pricing', actor);
  await audit(actor, context, 'pricing_started', quote, `Pricing started for quote ${quote.quoteNumber}.`, { from: quote.status, to: 'pricing' });
  return getQuote(id);
}

/**
 * Sets the customer rate (quotedRate), the carrier cost estimate (estimatedRate) and the derived margin. Only while the
 * quote is in `pricing`; the customer cannot see any of it until the quote is sent (status `quoted`).
 */
export async function setQuotePricing(id, input, actor, context) {
  const quote = await findQuote(id);
  if (quote.status !== 'pricing') {
    throw ApiError.conflict('Pricing can only be set while the quote is in the pricing stage.', 'INVALID_STATUS_TRANSITION', [
      { field: 'status', message: `The quote is "${quote.status}".` },
    ]);
  }
  const pricing = buildPricing({
    customerRate: input.customerRate,
    carrierRate: input.carrierRate,
    currency: input.currency ?? quote.currency ?? 'USD',
    allowNegativeMargin: input.allowNegativeMargin,
  });
  const result = await QuoteRequest.updateOne(
    { _id: quote._id, status: 'pricing', archivedAt: null },
    {
      $set: {
        quotedRate: pricing.customerRate,
        estimatedRate: pricing.carrierRate,
        brokerMargin: pricing.brokerMargin,
        currency: pricing.currency,
        updatedBy: actor.userId,
        ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
      },
    }
  );
  assertApplied(result);
  await audit(actor, context, 'priced', quote, `Pricing recorded for quote ${quote.quoteNumber}.`, {
    customerRate: pricing.customerRate,
    carrierRate: pricing.carrierRate,
    brokerMargin: pricing.brokerMargin,
    currency: pricing.currency,
  });
  return getQuote(id);
}

export async function updateQuoteNotes(id, { internalNotes }, actor, context) {
  const quote = await findQuote(id);
  if (quoteMachine.isTerminal(quote.status)) {
    throw ApiError.conflict('Notes cannot be changed on a finished quote.', 'INVALID_STATUS_TRANSITION');
  }
  assertApplied(await QuoteRequest.updateOne({ _id: quote._id, archivedAt: null }, { $set: { internalNotes, updatedBy: actor.userId } }));
  await audit(actor, context, 'notes_updated', quote, `Internal notes updated on quote ${quote.quoteNumber}.`);
  return getQuote(id);
}

/** Sends the priced quote to the customer: pricing -> quoted, with an expiry. */
export async function sendQuote(id, { validForDays }, actor, context) {
  const quote = await findQuote(id);
  assertHasCustomer(quote, 'sent through the customer portal');
  quoteMachine.assertTransition(quote.status, 'quoted');
  if (!Number.isSafeInteger(quote.quotedRate) || quote.quotedRate <= 0) {
    throw ApiError.conflict('Set the customer rate before sending the quote.', 'QUOTE_NOT_PRICED', [{ field: 'customerRate', message: 'No customer rate has been set.' }]);
  }
  const quotedAt = new Date();
  const quoteExpiresAt = new Date(quotedAt.getTime() + validForDays * DAY_MS);
  await moveQuote(quote, 'quoted', actor, { quotedAt, quoteExpiresAt });
  await audit(actor, context, 'sent', quote, `Quote ${quote.quoteNumber} was sent to the customer.`, { validForDays, quoteExpiresAt: quoteExpiresAt.toISOString() });
  await notifyUser(await customerUserId(quote.customerId), {
    type: 'quote',
    title: 'Your quote is ready',
    message: `Quote ${quote.quoteNumber} is ready for your review. It is valid until ${quoteExpiresAt.toISOString().slice(0, 10)} (UTC).`,
    entityType: 'quote',
    entityId: quote._id,
    eventKey: `quote.sent:${quote._id}:${quoteExpiresAt.toISOString()}`,
  });
  return getQuote(id);
}

export async function expireQuote(id, actor, context) {
  const quote = await findQuote(id);
  await moveQuote(quote, 'expired', actor);
  await audit(actor, context, 'expired', quote, `Quote ${quote.quoteNumber} expired.`);
  await notifyUser(await customerUserId(quote.customerId), {
    type: 'quote',
    title: 'Your quote has expired',
    message: `Quote ${quote.quoteNumber} is no longer valid. Request a new quote if you still need this freight moved.`,
    entityType: 'quote',
    entityId: quote._id,
    eventKey: `quote.expired:${quote._id}`,
  });
  return getQuote(id);
}

/** Expires every sent quote whose validity has passed. Safe to run repeatedly. */
export async function expireOverdueQuotes(actor, context, now = new Date()) {
  const overdue = await QuoteRequest.find({ status: 'quoted', quoteExpiresAt: { $lt: now }, archivedAt: null }).select('quoteNumber customerId status').limit(200).lean();
  let expired = 0;
  for (const quote of overdue) {
    const result = await QuoteRequest.updateOne({ _id: quote._id, status: 'quoted' }, { $set: { status: 'expired', updatedBy: actor.userId } });
    if (result.matchedCount === 1) {
      expired += 1;
      await audit(actor, context, 'expired', quote, `Quote ${quote.quoteNumber} expired (validity passed).`, { automatic: true });
    }
  }
  return { expired, checked: overdue.length };
}

export async function cancelQuote(id, { reason }, actor, context) {
  const quote = await findQuote(id);
  await moveQuote(quote, 'cancelled', actor, { cancelledReason: reason });
  await audit(actor, context, 'cancelled', quote, `Quote ${quote.quoteNumber} was cancelled.`, { from: quote.status });
  await notifyUser(await customerUserId(quote.customerId), {
    type: 'quote',
    title: 'Your quote request was cancelled',
    message: `Quote request ${quote.quoteNumber} has been cancelled. Contact us if you have questions.`,
    entityType: 'quote',
    entityId: quote._id,
    eventKey: `quote.cancelled:${quote._id}`,
  });
  return getQuote(id);
}

/* ---------- conversion ---------- */

/**
 * Turns an accepted quote into a draft load, once. The database enforces "one load per quote" (unique sparse
 * Load.quoteId and QuoteRequest.loadId), so two concurrent conversions can create at most one load; the loser gets a
 * 409 pointing at it. If a previous attempt created the load but died before updating the quote, the next attempt
 * finishes the quote update instead of creating a second load.
 */
export async function convertQuoteToLoad(id, actor, context) {
  const quote = await findQuote(id);
  assertHasCustomer(quote, 'converted to a load');

  if (quote.status === 'converted_to_load' || quote.loadId) {
    throw ApiError.conflict('This quote has already been converted to a load.', 'QUOTE_ALREADY_CONVERTED', [
      { field: 'loadId', message: String(quote.loadId ?? '') },
    ]);
  }
  quoteMachine.assertTransition(quote.status, 'converted_to_load');

  let load = await Load.findOne({ quoteId: quote._id }).select('_id loadNumber').lean();
  let created = false;
  if (!load) {
    try {
      const document = await Load.create({
        loadNumber: await nextLoadNumber(),
        quoteId: quote._id,
        customerId: quote.customerId,
        origin: quote.origin,
        destination: quote.destination,
        pickup: { earliest: quote.pickupDate },
        delivery: quote.deliveryDate ? { earliest: quote.deliveryDate } : undefined,
        equipmentType: quote.equipmentType,
        commodity: quote.commodity,
        weight: quote.weight,
        specialInstructions: quote.specialInstructions,
        currency: quote.currency ?? 'USD',
        rate: quote.quotedRate,
        carrierRate: quote.estimatedRate,
        brokerMargin: quote.quotedRate != null && quote.estimatedRate != null ? quote.quotedRate - quote.estimatedRate : undefined,
        status: 'draft',
        createdBy: actor.userId,
        convertedBy: actor.userId,
      });
      load = { _id: document._id, loadNumber: document.loadNumber };
      created = true;
    } catch (error) {
      if (error.code === 11000) {
        throw ApiError.conflict('This quote has already been converted to a load.', 'QUOTE_ALREADY_CONVERTED');
      }
      throw error;
    }
  }

  const result = await QuoteRequest.updateOne(
    { _id: quote._id, status: 'customer_accepted', archivedAt: null },
    { $set: { status: 'converted_to_load', loadId: load._id, convertedAt: new Date(), updatedBy: actor.userId } }
  );
  assertApplied(result);

  await recordActivity({
    userId: actor.userId,
    action: 'operations.quote.converted',
    module: 'quotes',
    entityId: quote._id,
    description: `Quote ${quote.quoteNumber} was converted to load ${load.loadNumber}.`,
    metadata: { loadId: String(load._id), loadNumber: load.loadNumber, recoveredPriorAttempt: !created },
    context,
  });
  await recordActivity({
    userId: actor.userId,
    action: 'operations.load.created',
    module: 'loads',
    entityId: load._id,
    description: `Load ${load.loadNumber} was created from quote ${quote.quoteNumber}.`,
    metadata: { quoteId: String(quote._id) },
    context,
  });
  await notifyUser(await customerUserId(quote.customerId), {
    type: 'quote',
    title: 'Your freight is being arranged',
    message: `Your accepted quote ${quote.quoteNumber} is now being arranged for shipping (${laneLabel(quote)}).`,
    entityType: 'quote',
    entityId: quote._id,
    eventKey: `quote.converted:${quote._id}`,
  });
  return { quote: await detail(await findQuote(id)), load: { id: String(load._id), loadNumber: load.loadNumber } };
}
