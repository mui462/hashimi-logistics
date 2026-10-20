import { Lock, SearchX } from 'lucide-react';
import { ApiRequestError } from '../../utils/apiRequestError';
import AsyncView from '../customer/AsyncView';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import LoadingState from '../common/LoadingState';

const GENERIC = 'We could not load this right now. Please try again.';

/** The message an admin sees for a failed load. 401 never reaches here: the layout signs the session out first. */
export function adminErrorMessage(error) {
  if (!(error instanceof ApiRequestError)) return GENERIC;
  if (error.status === 403) return 'You do not have permission to access this area.';
  if (error.status === 429) return 'Too many requests. Wait a moment, then try again.';
  if (error.status && error.status >= 500) return GENERIC;
  return error.message || GENERIC;
}

/**
 * Loading / error / empty / data for an admin section. 400 and 404 on a detail page both mean "no such record";
 * 403 explains the permission problem and offers no retry; everything else offers Retry.
 */
export default function AdminAsyncView({ state, label = 'Loading', errorTitle = 'We could not load this', notFound, isEmpty, empty, children }) {
  const error = state.error;
  const status = error instanceof ApiRequestError ? error.status : null;
  // `notFound` ("quote", "load"…) marks a detail page: a 404, or a 400 for a malformed id, means there is no such record.
  if (notFound && (status === 404 || status === 400)) {
    return <EmptyState icon={SearchX} title={`That ${notFound} was not found`} description="It may have been removed, or the link may be wrong." />;
  }
  if (status === 403) {
    return <EmptyState icon={Lock} title="Access denied" description="You do not have permission to access this area." />;
  }
  if (error) {
    return <ErrorState title={errorTitle} titleAs="h2" message={adminErrorMessage(error)} onRetry={state.reload} />;
  }
  if (!state.data) return <LoadingState label={label} />;
  return <AsyncView state={state} label={label} isEmpty={isEmpty} empty={empty}>{children}</AsyncView>;
}
