import { useCallback, useEffect, useState } from 'react';

export function useAsyncData(loadFn) {
  const [state, setState] = useState({ data: null, error: null, isLoading: true });
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    setState((previous) => ({ ...previous, error: null, isLoading: true }));

    loadFn()
      .then((data) => isCurrent && setState({ data, error: null, isLoading: false }))
      .catch((error) => isCurrent && setState({ data: null, error, isLoading: false }));

    return () => {
      isCurrent = false;
    };
  }, [loadFn, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, reload };
}
