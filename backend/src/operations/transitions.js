import { ApiError } from '../utils/ApiError.js';

/**
 * A tiny explicit state machine. `transitions` maps a status to the statuses it may move to; anything not listed is
 * refused with 409 INVALID_STATUS_TRANSITION. Services call assertTransition before every status write, and clients
 * never send a status: they trigger named actions (review, send, assign, dispatch ...) that each map to one edge.
 */
export function createStateMachine({ entity, transitions, terminal = [] }) {
  const statuses = Object.freeze(Object.keys(transitions));
  const canTransition = (from, to) => Boolean(transitions[from]?.includes(to));

  function assertTransition(from, to) {
    if (!canTransition(from, to)) {
      throw ApiError.conflict(
        `A ${entity} that is "${from}" cannot move to "${to}".`,
        'INVALID_STATUS_TRANSITION',
        [{ field: 'status', message: `Allowed next statuses: ${nextStatuses(from).join(', ') || 'none (final)'}.` }]
      );
    }
  }

  const nextStatuses = (from) => [...(transitions[from] ?? [])];
  const isTerminal = (status) => terminal.includes(status);

  return Object.freeze({ entity, statuses, transitions, canTransition, assertTransition, nextStatuses, isTerminal });
}
