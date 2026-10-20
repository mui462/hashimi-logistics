import { fetchContentOrNull } from '../services/contentService';
import { useContent } from './useContent';

/** The published CMS version of a built-in page (by its page key), or null when there is none or the CMS is unreachable. */
export function useCmsPage(pageKey) {
  const { data, status } = useContent(`/pages/${pageKey}`, undefined, () => fetchContentOrNull(`/pages/${pageKey}`));
  return { page: data ?? null, status };
}
