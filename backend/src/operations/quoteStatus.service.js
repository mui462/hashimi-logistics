import { createStateMachine } from './transitions.js';

/**
 * Quote lifecycle. Stored value -> operations name:
 *   new = submitted, reviewing = under_review, declined = customer_declined; the others are stored as named.
 * Legacy Phase 2 values (negotiating, approved, booked, completed) remain valid on old records but have no edges.
 */
export const quoteMachine = createStateMachine({
  entity: 'quote',
  transitions: {
    new: ['reviewing', 'cancelled'],
    reviewing: ['pricing', 'cancelled'],
    pricing: ['quoted', 'cancelled'],
    quoted: ['customer_accepted', 'declined', 'expired', 'cancelled'],
    customer_accepted: ['converted_to_load', 'cancelled'],
    converted_to_load: [],
    declined: [],
    expired: [],
    cancelled: [],
    negotiating: [],
    approved: [],
    booked: [],
    completed: [],
  },
  terminal: ['converted_to_load', 'declined', 'expired', 'cancelled', 'completed', 'booked'],
});

export const QUOTE_OPERATIONS_NAMES = Object.freeze({
  new: 'submitted',
  reviewing: 'under_review',
  declined: 'customer_declined',
});

export const quoteOperationsStatus = (status) => QUOTE_OPERATIONS_NAMES[status] ?? status;

/** Statuses in which the customer may see the price. Before `quoted` (and once cancelled) the rate stays private. */
export const QUOTE_RATE_VISIBLE_STATUSES = Object.freeze([
  'quoted',
  'customer_accepted',
  'converted_to_load',
  'declined',
  'expired',
  'negotiating',
  'approved',
  'booked',
  'completed',
]);
