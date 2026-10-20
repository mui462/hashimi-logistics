import { ACCOUNT_TYPES } from '../utils/constants.js';

const { SUPER_ADMIN, CUSTOMER, CARRIER } = ACCOUNT_TYPES;

/**
 * What each account type may read from each operational model.
 *
 * Every internal field is declared `select: false` in its schema, so a plain query never
 * returns it. Controllers apply `.select(selectionFor(modelName, role))` to opt in to
 * exactly what that role may see. `null` means the role has no access to the model at all.
 *
 * Customers never see carrier identity or carrier pay; carriers never see customer identity
 * or customer pay. Only the Super Admin sees margins, internal notes, and internal links.
 *
 * Ownership (which records) is separate: always filter by the authenticated user's own
 * customerId / carrierId taken from the session, never from request input.
 */
const SELECTIONS = {
  Customer: { [SUPER_ADMIN]: '+notes', [CUSTOMER]: '', [CARRIER]: null },
  Carrier: { [SUPER_ADMIN]: '+notes +rating', [CUSTOMER]: null, [CARRIER]: '' },
  CarrierApplication: { [SUPER_ADMIN]: '+notes', [CUSTOMER]: null, [CARRIER]: null },
  ContactMessage: { [SUPER_ADMIN]: '+handledBy', [CUSTOMER]: null, [CARRIER]: null },
  QuoteRequest: {
    [SUPER_ADMIN]: '+internalNotes +estimatedRate +assignedTo +brokerMargin +reviewedBy +cancelledReason +createdBy +updatedBy',
    [CUSTOMER]: '',
    [CARRIER]: null,
  },
  Load: {
    [SUPER_ADMIN]:
      '+rate +carrierRate +brokerMargin +assignedBy +internalNotes +cancelledReason +assignmentHistory +createdBy +updatedBy +convertedBy',
    [CUSTOMER]: '+rate -carrierId',
    [CARRIER]: '+carrierRate -customerId -quoteId',
  },
  Shipment: { [SUPER_ADMIN]: '+createdBy +updatedBy', [CUSTOMER]: '-carrierId', [CARRIER]: '-customerId' },
  Document: { [SUPER_ADMIN]: '+storageKey', [CUSTOMER]: '', [CARRIER]: '' },
  Payment: { [SUPER_ADMIN]: '+notes', [CUSTOMER]: '-carrierId', [CARRIER]: '-customerId' },
  Notification: { [SUPER_ADMIN]: '', [CUSTOMER]: '', [CARRIER]: '' },
  ActivityLog: { [SUPER_ADMIN]: '', [CUSTOMER]: null, [CARRIER]: null },
};

export function selectionFor(modelName, role) {
  const selection = SELECTIONS[modelName]?.[role];
  return selection === undefined ? null : selection;
}

export const ACCESS_SELECTIONS = Object.freeze(SELECTIONS);
