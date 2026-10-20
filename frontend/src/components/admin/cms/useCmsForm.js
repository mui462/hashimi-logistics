import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminToast } from '../AdminToast';
import { toFieldErrors } from '../../../utils/apiRequestError';
import { focusFirstInvalid } from '../../../utils/focus';

export const getIn = (object, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), object);
export function setIn(object, path, value) {
  const [head, ...rest] = path.split('.');
  const copy = Array.isArray(object) ? [...object] : { ...object };
  copy[head] = rest.length ? setIn(object?.[head] ?? (/^\d+$/.test(rest[0]) ? [] : {}), rest.join('.'), value) : value;
  return copy;
}

/**
 * Form state for every CMS editor: dirty tracking, field errors from the server (keyed by the API field path), a
 * duplicate-submit guard, no success message unless the request resolved, and the slug-change confirmation round trip.
 *   submit(values, { confirmSlugChange }) -> the saved record      validate(values) -> { field: message }
 */
export function useCmsForm({ initial, validate, submit, onSaved, success = 'Saved.' }) {
  const toast = useAdminToast();
  const [values, setValues] = useState(initial);
  const baseline = useRef(JSON.stringify(initial));
  const dirtyRef = useRef(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [state, setState] = useState({ submitting: false, error: '', errors: {}, confirmSlug: false });
  const dirty = JSON.stringify(values) !== baseline.current;
  dirtyRef.current = dirty;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const set = useCallback((name, value) => setValues((current) => setIn(current, name, value)), []);
  const get = useCallback((name) => getIn(values, name), [values]);

  const run = async (extra = {}) => {
    if (inFlight.current) return;
    const found = validate ? validate(values) : {};
    if (Object.keys(found).length > 0) {
      setState((current) => ({ ...current, errors: found, error: 'Fix the highlighted fields and try again.', confirmSlug: false }));
      focusFirstInvalid();
      return;
    }
    inFlight.current = true;
    setState({ submitting: true, error: '', errors: {}, confirmSlug: false });
    try {
      const result = await submit(values, extra);
      baseline.current = JSON.stringify(values);
      dirtyRef.current = false;
      if (mounted.current) setState({ submitting: false, error: '', errors: {}, confirmSlug: false });
      toast.success(success);
      onSaved?.(result, values);
    } catch (error) {
      if (!mounted.current) return;
      if (error?.code === 'SLUG_CHANGE_NEEDS_CONFIRMATION') setState({ submitting: false, error: '', errors: {}, confirmSlug: true });
      else {
        setState({ submitting: false, error: error?.message || 'Something went wrong. Please try again.', errors: toFieldErrors(error?.errors), confirmSlug: false });
        focusFirstInvalid();
      }
    } finally {
      inFlight.current = false;
    }
  };

  return {
    values, set, get, setValues, dirty, dirtyRef, ...state, errors: state.errors,
    save: (event) => { event?.preventDefault?.(); return run(); },
    confirmSlugChange: () => run({ confirmSlugChange: true }),
    dismissSlugConfirm: () => setState((current) => ({ ...current, confirmSlug: false })),
  };
}

/** Plain value helpers shared by every editor. API nulls become empty strings in forms and empties become null/omitted on save. */
export const str = (value) => (value === null || value === undefined ? '' : String(value));
export const buttonValue = (button) => ({ label: str(button?.label), url: str(button?.url) });
export const buttonBody = (button) => (button?.label?.trim() || button?.url?.trim() ? { label: button.label.trim(), url: button.url.trim() } : null);
export const mediaValue = (media) => (media?.url ? { url: media.url, altText: str(media.altText), mediaId: media.mediaId ?? '' } : null);
export const mediaBody = (media) => (media?.url ? { url: media.url.trim(), altText: str(media.altText).trim(), ...(media.mediaId ? { mediaId: media.mediaId } : {}) } : null);
export const seoValue = (seo) => ({ title: str(seo?.title), description: str(seo?.description), keywords: (seo?.keywords ?? []).join(', '), canonicalUrl: str(seo?.canonicalUrl), ogImage: str(seo?.ogImage), noIndex: Boolean(seo?.noIndex) });
export const seoBody = (seo) => ({
  title: seo.title.trim(), description: seo.description.trim(), canonicalUrl: seo.canonicalUrl.trim(), ogImage: seo.ogImage.trim(), noIndex: Boolean(seo.noIndex),
  keywords: seo.keywords.split(',').map((word) => word.trim()).filter(Boolean),
});
export const trimmed = (value) => str(value).trim();
