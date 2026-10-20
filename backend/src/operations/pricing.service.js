import { CURRENCIES } from '../models/enums.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * The only place money for a deal is computed. All amounts are integer minor units (cents) in one currency:
 *   customerRate = what the customer pays      carrierRate = what the carrier is paid
 *   brokerMargin = customerRate - carrierRate  (always derived here, never taken from a client)
 * Nothing in the API accepts a brokerMargin; controllers and validators have no field for it.
 */

const isMoney = (value) => Number.isSafeInteger(value) && value > 0;

export function assertMoney(value, field) {
  if (!isMoney(value)) {
    throw ApiError.validation([{ field, message: 'Enter a positive whole number of cents.' }]);
  }
  return value;
}

export function assertCurrency(currency) {
  if (!CURRENCIES.includes(currency)) {
    throw ApiError.validation([{ field: 'currency', message: `Use one of: ${CURRENCIES.join(', ')}.` }]);
  }
  return currency;
}

export function calculateMargin(customerRate, carrierRate) {
  if (!Number.isSafeInteger(customerRate) || !Number.isSafeInteger(carrierRate)) return null;
  const brokerMargin = customerRate - carrierRate;
  return {
    brokerMargin,
    marginPercent: customerRate > 0 ? Math.round((brokerMargin / customerRate) * 10000) / 100 : null,
  };
}

/**
 * Validates a customer/carrier rate pair and derives the margin. A carrier rate is optional until a carrier is known;
 * when both exist a negative margin (paying a carrier more than the customer pays) is refused unless the operator says
 * explicitly that the loss is intended.
 */
export function buildPricing({ customerRate, carrierRate, currency = 'USD', allowNegativeMargin = false }) {
  assertCurrency(currency);
  if (customerRate != null) assertMoney(customerRate, 'customerRate');
  if (carrierRate != null) assertMoney(carrierRate, 'carrierRate');

  const margin = customerRate != null && carrierRate != null ? calculateMargin(customerRate, carrierRate) : null;
  if (margin && margin.brokerMargin < 0 && !allowNegativeMargin) {
    throw ApiError.conflict(
      'The carrier rate is higher than the customer rate, which would sell this freight at a loss.',
      'NEGATIVE_MARGIN',
      [{ field: 'carrierRate', message: 'Lower the carrier rate, raise the customer rate, or confirm the loss explicitly.' }]
    );
  }
  return {
    customerRate: customerRate ?? null,
    carrierRate: carrierRate ?? null,
    brokerMargin: margin?.brokerMargin ?? null,
    marginPercent: margin?.marginPercent ?? null,
    currency,
  };
}
