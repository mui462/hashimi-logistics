import { createStateMachine } from './transitions.js';

/**
 * Load lifecycle. Stored value `assigned` is the operations stage "carrier_assigned".
 * After `assigned` the status follows the shipment (dispatch, pickup, transit, delivery, completion) so a load and its
 * shipment can never disagree; see shipmentOperations.service.js.
 */
export const loadMachine = createStateMachine({
  entity: 'load',
  transitions: {
    draft: ['open', 'cancelled'],
    open: ['carrier_search', 'assigned', 'cancelled'],
    carrier_search: ['open', 'assigned', 'cancelled'],
    assigned: ['dispatched', 'open', 'carrier_search', 'cancelled'],
    dispatched: ['picked_up', 'cancelled'],
    picked_up: ['in_transit'],
    in_transit: ['delivered'],
    delivered: ['completed'],
    completed: [],
    cancelled: [],
  },
  terminal: ['completed', 'cancelled'],
});

/** Loads that may still be cancelled: nothing has been picked up yet. */
export const CANCELLABLE_LOAD_STATUSES = Object.freeze(['draft', 'open', 'carrier_search', 'assigned', 'dispatched']);
/** Loads whose commercial terms (rates, requirements, schedule) may still be edited. */
export const EDITABLE_LOAD_STATUSES = Object.freeze(['draft', 'open', 'carrier_search', 'assigned']);
/** Loads that may be assigned (or re-assigned) to a carrier. */
export const ASSIGNABLE_LOAD_STATUSES = Object.freeze(['open', 'carrier_search']);
export const REASSIGNABLE_LOAD_STATUSES = Object.freeze(['assigned', 'dispatched']);
/** Loads that count as "waiting for a carrier" on the board and dashboard. */
export const BOARD_LOAD_STATUSES = Object.freeze(['open', 'carrier_search']);
/** Archiving is for finished or never-started records only. */
export const ARCHIVABLE_LOAD_STATUSES = Object.freeze(['draft', 'cancelled', 'completed']);

export const LOAD_OPERATIONS_NAMES = Object.freeze({ assigned: 'carrier_assigned' });
export const loadOperationsStatus = (status) => LOAD_OPERATIONS_NAMES[status] ?? status;
