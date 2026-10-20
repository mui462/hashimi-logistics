import { createStateMachine } from './transitions.js';

/**
 * Shipment lifecycle. Stored value `booked` is the operations stage "scheduled".
 * `at_border` / `border_cleared` exist only for cross-border shipments (enforced by crossBorderOnly below).
 * `exception` is entered through the exception action and left through its resolution, which returns the shipment to
 * the status it was in; it can also be cancelled.
 */
export const shipmentMachine = createStateMachine({
  entity: 'shipment',
  transitions: {
    booked: ['dispatched', 'cancelled', 'exception'],
    dispatched: ['picked_up', 'cancelled', 'exception'],
    picked_up: ['in_transit', 'exception'],
    in_transit: ['at_border', 'out_for_delivery', 'delivered', 'exception'],
    at_border: ['border_cleared', 'exception'],
    border_cleared: ['in_transit', 'out_for_delivery', 'delivered', 'exception'],
    out_for_delivery: ['delivered', 'exception'],
    delivered: ['completed'],
    completed: [],
    exception: ['booked', 'dispatched', 'picked_up', 'in_transit', 'at_border', 'border_cleared', 'out_for_delivery', 'cancelled'],
    cancelled: [],
  },
  terminal: ['completed', 'cancelled'],
});

export const CROSS_BORDER_ONLY_STATUSES = Object.freeze(['at_border', 'border_cleared']);
/** Statuses from which an exception may be raised (anything live and not yet delivered). */
export const EXCEPTION_ELIGIBLE_STATUSES = Object.freeze(
  Object.keys(shipmentMachine.transitions).filter((from) => shipmentMachine.canTransition(from, 'exception') && from !== 'exception')
);
export const CANCELLABLE_SHIPMENT_STATUSES = Object.freeze(
  Object.keys(shipmentMachine.transitions).filter((from) => shipmentMachine.canTransition(from, 'cancelled'))
);
/** Shipments that are still live (neither finished nor cancelled). */
export const LIVE_SHIPMENT_STATUSES = Object.freeze(
  Object.keys(shipmentMachine.transitions).filter((status) => !shipmentMachine.isTerminal(status))
);

export const SHIPMENT_OPERATIONS_NAMES = Object.freeze({ booked: 'scheduled' });
export const shipmentOperationsStatus = (status) => SHIPMENT_OPERATIONS_NAMES[status] ?? status;
