import { useCallback, useRef, useState } from 'react';
import { useAdminToast } from '../components/admin/AdminToast';
import { ApiRequestError } from '../utils/apiRequestError';

/**
 * Runs one admin mutation at a time (a second click while one is in flight is ignored), reports the outcome in a toast,
 * and reloads the page data afterwards. A 409 means the record changed under the admin, so it is reloaded as well.
 * Returns the action's result, or undefined when it failed.
 */
export function useAdminAction(reload) {
  const toast = useAdminToast();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (action, successMessage) => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setBusy(true);
      try {
        const result = await action();
        if (successMessage) toast.success(successMessage);
        reload?.();
        return result ?? true;
      } catch (error) {
        toast.error(error instanceof ApiRequestError && error.message ? error.message : 'That did not work. Please try again.');
        if (error instanceof ApiRequestError && error.status === 409) reload?.();
        return undefined;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [reload, toast]
  );

  return { run, busy };
}
