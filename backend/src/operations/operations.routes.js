import { Router } from 'express';
import { noStore } from '../middleware/noStore.js';
import { rejectOperators } from '../middleware/rejectOperators.js';
import { validate } from '../middleware/validate.js';
import * as c from './operations.controller.js';
import * as v from './operations.validator.js';

/**
 * Brokerage operations API, mounted at /api/v1/operations behind authenticate + requireSuperAdmin (see routes/index.js):
 * customers and carriers get 403 before any handler runs. Every state change is a POST action that maps to one allowed
 * transition in the state machines; there is no endpoint that accepts a status, a margin or an owner id from a client.
 */
const router = Router();
router.use(noStore);
router.use(rejectOperators);

router.get('/dashboard', validate(v.dashboardSchema), c.dashboard);

/* quotes */
router.get('/quotes', validate(v.listQuotesSchema), c.listQuotes);
router.post('/quotes/expire-overdue', validate(v.expireOverdueSchema), c.expireOverdue);
router.get('/quotes/:id', validate(v.idParamSchema), c.getQuote);
router.post('/quotes/:id/review', validate(v.reviewQuoteSchema), c.reviewQuote);
router.post('/quotes/:id/start-pricing', validate(v.startPricingSchema), c.startPricing);
router.put('/quotes/:id/pricing', validate(v.quotePricingSchema), c.setQuotePricing);
router.patch('/quotes/:id/internal-notes', validate(v.quoteNotesSchema), c.updateQuoteNotes);
router.post('/quotes/:id/send', validate(v.sendQuoteSchema), c.sendQuote);
router.post('/quotes/:id/expire', validate(v.startPricingSchema), c.expireQuote);
router.post('/quotes/:id/cancel', validate(v.cancelSchema), c.cancelQuote);
router.post('/quotes/:id/convert', validate(v.convertQuoteSchema), c.convertQuote);

/* loads */
router.get('/loads', validate(v.listLoadsSchema), c.listLoads);
router.get('/loads/:id', validate(v.idParamSchema), c.getLoad);
router.patch('/loads/:id', validate(v.updateLoadSchema), c.updateLoad);
router.put('/loads/:id/carrier-rate', validate(v.carrierRateSchema), c.setCarrierRate);
router.put('/loads/:id/schedule', validate(v.scheduleLoadSchema), c.scheduleLoad);
router.post('/loads/:id/open', validate(v.openLoadSchema), c.openLoad);
router.post('/loads/:id/carrier-search', validate(v.carrierSearchSchema), c.startCarrierSearch);
router.get('/loads/:id/carrier-matches', validate(v.idParamSchema), c.carrierMatches);
router.post('/loads/:id/assign', validate(v.assignSchema), c.assignCarrier);
router.post('/loads/:id/reassign', validate(v.reassignSchema), c.reassignCarrier);
router.post('/loads/:id/unassign', validate(v.unassignSchema), c.unassignCarrier);
router.post('/loads/:id/cancel', validate(v.cancelSchema), c.cancelLoad);
router.post('/loads/:id/archive', validate(v.archiveSchema), c.archiveLoad);
router.post('/loads/:id/shipment', validate(v.createShipmentSchema), c.createShipment);

/* shipments */
router.get('/shipments', validate(v.listShipmentsSchema), c.listShipments);
router.get('/shipments/:id', validate(v.idParamSchema), c.getShipment);
router.post('/shipments/:id/dispatch', validate(v.shipmentEventSchema), c.shipmentAction('dispatch', 'Shipment dispatched.'));
router.post('/shipments/:id/pickup', validate(v.shipmentEventSchema), c.shipmentAction('pickup', 'Pickup recorded.'));
router.post('/shipments/:id/in-transit', validate(v.shipmentEventSchema), c.shipmentAction('in-transit', 'Shipment in transit.'));
router.post('/shipments/:id/at-border', validate(v.shipmentEventSchema), c.shipmentAction('at-border', 'Arrival at the border recorded.'));
router.post('/shipments/:id/border-cleared', validate(v.shipmentEventSchema), c.shipmentAction('border-cleared', 'Border clearance recorded.'));
router.post('/shipments/:id/out-for-delivery', validate(v.shipmentEventSchema), c.shipmentAction('out-for-delivery', 'Shipment out for delivery.'));
router.post('/shipments/:id/deliver', validate(v.shipmentEventSchema), c.shipmentAction('deliver', 'Delivery recorded.'));
router.post('/shipments/:id/complete', validate(v.shipmentEventSchema), c.shipmentAction('complete', 'Shipment completed.'));
router.post('/shipments/:id/border-events', validate(v.borderEventSchema), c.addBorderEvent);
router.post('/shipments/:id/tracking-updates', validate(v.trackingUpdateSchema), c.addTrackingUpdate);
router.post('/shipments/:id/exceptions', validate(v.raiseExceptionSchema), c.raiseException);
router.post('/shipments/:id/exceptions/:exceptionId/resolve', validate(v.resolveExceptionSchema), c.resolveException);
router.post('/shipments/:id/cancel', validate(v.cancelShipmentSchema), c.cancelShipment);

export default router;
