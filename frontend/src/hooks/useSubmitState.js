import { useCallback, useRef, useState } from 'react';
import { toFieldErrors } from '../utils/apiRequestError';

// Tracks idle / submitting / success / error for an API submission. Never reports success unless
// the request actually resolved.
export function useSubmitState() {
  const [state, setState] = useState({ status: 'idle', error: '', fieldErrors: {}, result: null });

  const inFlight = useRef(false);

  const run = useCallback(async (action) => {
    if (inFlight.current) return false; // ignore a second submit while one is already in flight
    inFlight.current = true;
    setState({ status: 'submitting', error: '', fieldErrors: {}, result: null });
    try {
      const result = await action();
      setState({ status: 'success', error: '', fieldErrors: {}, result });
      return true;
    } catch (error) {
      setState({
        status: 'error',
        error: error?.message || 'Something went wrong. Please try again.',
        fieldErrors: toFieldErrors(error?.errors),
        result: null,
      });
      return false;
    } finally {
      inFlight.current = false;
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle', error: '', fieldErrors: {}, result: null }), []);

  return { ...state, isSubmitting: state.status === 'submitting', run, reset };
}
