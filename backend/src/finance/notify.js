import { Carrier } from '../models/Carrier.js';
import { Customer } from '../models/Customer.js';
import { notifyUser } from '../operations/notifications.service.js';

/**
 * Finance notifications reuse the Phase 11 outbox (notifyUser -> queued EMAIL/SMS honoring preferences). Wording is
 * deliberately generic: it names the invoice/payable number but never an amount, balance, method or payment reference, and
 * it says "recorded" because every entry is an administrative record, not a bank-verified transfer. A notification
 * failure never changes the financial result (notifyUser swallows and logs its own errors).
 */
export async function notifyCustomerOfInvoice(customerId, { title, message, invoiceId, eventKey }) {
  const customer = await Customer.findById(customerId).select('userId').lean();
  return notifyUser(customer?.userId, { type: 'payment', title, message, entityType: 'invoice', entityId: invoiceId, eventKey });
}

export async function notifyCarrierOfPayable(carrierId, { title, message, payableId, eventKey }) {
  const carrier = await Carrier.findById(carrierId).select('userId').lean();
  return notifyUser(carrier?.userId, { type: 'payment', title, message, entityType: 'carrier_payable', entityId: payableId, eventKey });
}
