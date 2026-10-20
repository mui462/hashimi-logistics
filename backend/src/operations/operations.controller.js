import { requestContext } from '../services/activity.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getDashboard } from './dashboard.service.js';
import * as loads from './loadOperations.service.js';
import * as quotes from './quoteOperations.service.js';
import * as shipments from './shipmentOperations.service.js';

/**
 * Super Admin only (enforced when the router is mounted). `req.owner.userId` is the acting admin; no handler reads an
 * actor, status or money-derived value from the request. Status changes are named actions, never a client-set status.
 */
const run = (handler, message) => async (req, res) => sendSuccess(res, { data: await handler(req), message });
const actor = (req) => ({ userId: req.user._id });
const ctx = requestContext;
const { params, body, query } = {
  params: (req) => req.validated.params,
  body: (req) => req.validated.body,
  query: (req) => req.validated.query,
};

export const dashboard = run(() => getDashboard());

/* quotes */
export const listQuotes = run((req) => quotes.listQuotes(query(req)));
export const getQuote = run((req) => quotes.getQuote(params(req).id));
export const reviewQuote = run((req) => quotes.reviewQuote(params(req).id, body(req), actor(req), ctx(req)), 'Quote moved to review.');
export const startPricing = run((req) => quotes.startPricing(params(req).id, actor(req), ctx(req)), 'Pricing started.');
export const setQuotePricing = run((req) => quotes.setQuotePricing(params(req).id, body(req), actor(req), ctx(req)), 'Pricing saved.');
export const updateQuoteNotes = run((req) => quotes.updateQuoteNotes(params(req).id, body(req), actor(req), ctx(req)), 'Notes saved.');
export const sendQuote = run((req) => quotes.sendQuote(params(req).id, body(req), actor(req), ctx(req)), 'Quote sent to the customer.');
export const expireQuote = run((req) => quotes.expireQuote(params(req).id, actor(req), ctx(req)), 'Quote expired.');
export const expireOverdue = run((req) => quotes.expireOverdueQuotes(actor(req), ctx(req)), 'Overdue quotes expired.');
export const cancelQuote = run((req) => quotes.cancelQuote(params(req).id, body(req), actor(req), ctx(req)), 'Quote cancelled.');
export const convertQuote = run((req) => quotes.convertQuoteToLoad(params(req).id, actor(req), ctx(req)), 'Quote converted to a load.');

/* loads */
export const listLoads = run((req) => loads.listLoads(query(req)));
export const getLoad = run((req) => loads.getLoad(params(req).id));
export const updateLoad = run((req) => loads.updateLoad(params(req).id, body(req), actor(req), ctx(req)), 'Load updated.');
export const setCarrierRate = run((req) => loads.setCarrierRate(params(req).id, body(req), actor(req), ctx(req)), 'Carrier rate saved.');
export const scheduleLoad = run((req) => loads.scheduleLoad(params(req).id, body(req), actor(req), ctx(req)), 'Schedule saved.');
export const openLoad = run((req) => loads.openLoad(params(req).id, actor(req), ctx(req)), 'Load opened.');
export const startCarrierSearch = run((req) => loads.startCarrierSearch(params(req).id, actor(req), ctx(req)), 'Carrier search started.');
export const carrierMatches = run(async (req) => ({ matching: await loads.getCarrierMatches(params(req).id) }));
export const assignCarrier = run((req) => loads.assignCarrier(params(req).id, body(req), actor(req), ctx(req)), 'Carrier assigned.');
export const reassignCarrier = run((req) => loads.reassignCarrier(params(req).id, body(req), actor(req), ctx(req)), 'Carrier replaced.');
export const unassignCarrier = run((req) => loads.unassignCarrier(params(req).id, body(req), actor(req), ctx(req)), 'Carrier removed.');
export const cancelLoad = run((req) => loads.cancelLoad(params(req).id, body(req), actor(req), ctx(req)), 'Load cancelled.');
export const archiveLoad = run((req) => loads.archiveLoad(params(req).id, actor(req), ctx(req)), 'Load archived.');
export const createShipment = async (req, res) =>
  sendSuccess(res, { statusCode: 201, message: 'Shipment created.', data: await shipments.createShipment(params(req).id, actor(req), ctx(req)) });

/* shipments */
export const listShipments = run((req) => shipments.listShipments(query(req)));
export const getShipment = run((req) => shipments.getShipment(params(req).id));
export const shipmentAction = (name, message) => run((req) => shipments.runAction(params(req).id, name, body(req), actor(req), ctx(req)), message);
export const addBorderEvent = run((req) => shipments.addBorderEvent(params(req).id, body(req), actor(req), ctx(req)), 'Border event recorded.');
export const addTrackingUpdate = run((req) => shipments.addTrackingUpdate(params(req).id, body(req), actor(req), ctx(req)), 'Location updated.');
export const raiseException = run((req) => shipments.raiseException(params(req).id, body(req), actor(req), ctx(req)), 'Exception recorded.');
export const resolveException = run((req) => shipments.resolveException(params(req).id, params(req).exceptionId, body(req), actor(req), ctx(req)), 'Exception resolved.');
export const cancelShipment = run((req) => shipments.cancelShipment(params(req).id, body(req), actor(req), ctx(req)), 'Shipment cancelled.');
