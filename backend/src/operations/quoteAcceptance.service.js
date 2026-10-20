import { QuoteRequest } from '../models/QuoteRequest.js';
import { selectionFor } from '../models/accessProjections.js';
import { recordActivity } from '../services/activity.service.js';
import { assertOwnsRecord, ownershipFilter } from '../services/ownership.service.js';
import { ApiError } from '../utils/ApiError.js';
import { ACCOUNT_TYPES } from '../utils/constants.js';
import { notifySuperAdmins, notifyUser } from './notifications.service.js';
import { quoteMachine } from './quoteStatus.service.js';

/**
 * Customer response to a quote that staff sent (status `quoted`). Both actions are idempotent: repeating the same answer
 * returns the current state without a second log entry or notification. The quote is found through the customer's own
 * ownership filter, so another customer's quote id is a plain 404, and the status write only matches while the quote is
 * still `quoted`, so an accept racing a decline (or an expiry) has exactly one winner.
 */

const SELECT = selectionFor('QuoteRequest', ACCOUNT_TYPES.CUSTOMER) ?? '';

const findOwnedQuote = async (owner, quoteId) =>
  assertOwnsRecord(owner, await QuoteRequest.findOne({ _id: quoteId, ...ownershipFilter(owner) }).active().select(SELECT).lean());

async function expireIfPastDue(quote, now) {
  if (quote.quoteExpiresAt && new Date(quote.quoteExpiresAt) < now) {
    await QuoteRequest.updateOne({ _id: quote._id, status: 'quoted' }, { $set: { status: 'expired' } });
    throw ApiError.conflict('This quote has expired. Please request a new quote.', 'QUOTE_EXPIRED');
  }
}

async function respond(owner, quoteId, { to, timestampField, reason, context, now = new Date() }) {
  let quote = await findOwnedQuote(owner, quoteId);

  // Idempotent repeat of the same answer.
  if (quote.status === to || (to === 'customer_accepted' && quote.status === 'converted_to_load')) {
    return { quote, changed: false };
  }
  quoteMachine.assertTransition(quote.status, to);
  await expireIfPastDue(quote, now);

  const result = await QuoteRequest.updateOne(
    { _id: quote._id, ...ownershipFilter(owner), status: 'quoted', archivedAt: null },
    { $set: { status: to, [timestampField]: now } }
  );
  if (result.matchedCount !== 1) {
    // Lost a race: report the current truth. The same answer is fine; anything else is a conflict.
    quote = await findOwnedQuote(owner, quoteId);
    if (quote.status === to) return { quote, changed: false };
    quoteMachine.assertTransition(quote.status, to);
    throw ApiError.conflict('This quote was just changed. Reload it and try again.', 'STALE_STATE');
  }

  await recordActivity({
    userId: owner.userId,
    action: to === 'customer_accepted' ? 'customer.quote.accepted' : 'customer.quote.declined',
    module: 'quotes',
    entityId: quote._id,
    description: `Customer ${to === 'customer_accepted' ? 'accepted' : 'declined'} quote ${quote.quoteNumber}.`,
    metadata: { from: 'quoted', to, ...(reason ? { reason } : {}) },
    context,
  });
  await notifySuperAdmins({
    type: 'quote',
    title: to === 'customer_accepted' ? 'A customer accepted a quote' : 'A customer declined a quote',
    message:
      to === 'customer_accepted'
        ? `Quote ${quote.quoteNumber} was accepted and is ready to convert to a load.`
        : `Quote ${quote.quoteNumber} was declined${reason ? `: ${reason}` : '.'}`,
    entityType: 'quote',
    entityId: quote._id,
    eventKey: `quote.${to}:${quote._id}`,
  });
  // Confirmation to the customer who responded (own quote only; no internal pricing, no carrier information).
  await notifyUser(owner.userId, {
    type: 'quote',
    title: to === 'customer_accepted' ? 'You accepted a quote' : 'You declined a quote',
    message:
      to === 'customer_accepted'
        ? `You accepted quote ${quote.quoteNumber}. We will start arranging your freight and keep you updated.`
        : `You declined quote ${quote.quoteNumber}. Request a new quote any time if your plans change.`,
    entityType: 'quote',
    entityId: quote._id,
    eventKey: `quote.${to}.confirmation:${quote._id}`,
  });
  return { quote: await findOwnedQuote(owner, quoteId), changed: true };
}

export const acceptQuote = (owner, quoteId, context) => respond(owner, quoteId, { to: 'customer_accepted', timestampField: 'acceptedAt', context });
export const declineQuote = (owner, quoteId, { reason } = {}, context) => respond(owner, quoteId, { to: 'declined', timestampField: 'declinedAt', reason, context });
