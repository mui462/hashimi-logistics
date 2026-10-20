import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export const PAGE_SIZES = [10, 20, 50, 100];

/**
 * List state lives in the URL (?q=…&status=…&page=2) so a filtered view survives reload, back/forward and sharing.
 * Only keys named in `keys` are read; anything else in the URL is ignored and never sent to the API.
 */
export function useListParams(keys) {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(() => {
    const out = {};
    for (const key of keys) {
      const value = searchParams.get(key);
      if (value) out[key] = value;
    }
    const page = Number.parseInt(searchParams.get('page') ?? '', 10);
    const limit = Number.parseInt(searchParams.get('limit') ?? '', 10);
    if (Number.isInteger(page) && page > 1 && page <= 10000) out.page = page;
    if (PAGE_SIZES.includes(limit)) out.limit = limit;
    return out;
    // `keys` is a constant list per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const update = useCallback(
    (patch, { resetPage = true } = {}) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(patch)) {
            if (value === '' || value === undefined || value === null) next.delete(key);
            else next.set(key, String(value));
          }
          if (resetPage && !('page' in patch)) next.delete('page');
          if (next.get('page') === '1') next.delete('page');
          return next;
        },
        { replace: false }
      );
    },
    [setSearchParams]
  );

  const reset = useCallback(() => setSearchParams(new URLSearchParams()), [setSearchParams]);

  return { params, update, reset };
}
