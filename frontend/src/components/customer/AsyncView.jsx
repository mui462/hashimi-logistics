import { ApiRequestError } from '../../utils/apiRequestError';
import ErrorState from '../common/ErrorState';
import LoadingState from '../common/LoadingState';

const GENERIC = 'We could not load this right now. Please try again.';

// Never shows anything but a short, safe message: server messages are already sanitized, anything else is generic.
export const safeMessage = (error) => (error instanceof ApiRequestError && error.message ? error.message : GENERIC);

/**
 * One place for the loading / error / empty / data states of a page section.
 * `state` is the object returned by useAsyncData. `isEmpty(data)` decides when to show `empty`.
 */
export default function AsyncView({ state, label = 'Loading', errorTitle = 'We could not load this', isEmpty, empty, children }) {
  if (state.error) {
    return <ErrorState title={errorTitle} titleAs="h2" message={safeMessage(state.error)} onRetry={state.reload} />;
  }
  if (!state.data) {
    return <LoadingState label={label} />;
  }
  if (isEmpty?.(state.data)) {
    return empty;
  }
  return (
    <div aria-busy={state.isLoading || undefined} className={state.isLoading ? 'opacity-70 transition-opacity' : undefined}>
      {children(state.data)}
    </div>
  );
}
