import { useEffect, useState } from 'react';
import { contentKey, fetchContent, peekContent } from '../services/contentService';

/**
 * Loads one public CMS resource. Never throws into the page: `status` is 'loading' | 'ready' | 'error', and `data` is
 * null unless ready, so the caller can render the built-in content when the CMS is empty or unreachable.
 */
export function useContent(path, params, loader = () => fetchContent(path, params)) {
  const key = contentKey(path, params);
  const [state, setState] = useState(() => {
    const hit = peekContent(key);
    return hit !== undefined ? { key, status: 'ready', data: hit } : { key, status: 'loading', data: null };
  });

  useEffect(() => {
    let current = true;
    const hit = peekContent(key);
    if (hit !== undefined) setState({ key, status: 'ready', data: hit });
    else setState({ key, status: 'loading', data: null });
    loader().then(
      (data) => current && setState({ key, status: 'ready', data }),
      () => current && setState({ key, status: 'error', data: null })
    );
    return () => {
      current = false;
    };
    // The key identifies the request; `loader` is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (state.key !== key) {
    const hit = peekContent(key);
    return hit !== undefined ? { status: 'ready', data: hit } : { status: 'loading', data: null };
  }
  return { status: state.status, data: state.data };
}
