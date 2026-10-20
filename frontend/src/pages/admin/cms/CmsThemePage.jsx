import { useCallback, useEffect, useRef, useState } from 'react';
import AdminAsyncView from '../../../components/admin/AdminAsyncView';
import AdminConfirmDialog from '../../../components/admin/AdminConfirmDialog';
import AdminPage from '../../../components/admin/AdminPage';
import { useAdminToast } from '../../../components/admin/AdminToast';
import { ChoiceField, ColorField, RangeField } from '../../../components/admin/cms/AppearanceFields';
import UnsavedGuard from '../../../components/admin/cms/UnsavedGuard';
import Alert from '../../../components/common/Alert';
import Button from '../../../components/common/Button';
import Reveal from '../../../components/common/Reveal';
import Panel from '../../../components/customer/Panel';
import { HEX_COLOR, THEME_APPEARANCE_SPEC, themeCssVars } from '../../../config/themeAppearance';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { getThemeAppearance, resetThemeAppearance, saveThemeAppearance } from '../../../services/adminService';
import { ApiRequestError } from '../../../utils/apiRequestError';
import { formatDateTime } from '../../../utils/format';

/**
 * Website CMS -> Website theme. A local draft with a live preview: nothing reaches the public website until Save changes.
 * Only the listed colours, presets and ranges exist (the API enforces the same). The navbar and the homepage hero keep their
 * own settings (Navbar appearance, Homepage) and are not changed here.
 */

const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const COLOR_LABELS = {
  accentColor: 'Gold accent (buttons, icons, highlights)',
  accentHoverColor: 'Gold accent on hover',
  darkColor: 'Text and dark sections',
  darkestColor: 'Darkest sections (footer, closing call to action)',
  darkRaisedColor: 'Raised dark surfaces',
  darkBorderColor: 'Borders on dark sections',
  surfaceColor: 'Page background',
  mutedSurfaceColor: 'Muted section background',
  borderColor: 'Borders and dividers',
  mutedTextColor: 'Secondary text',
};
const OPTION_LABELS = {
  contentWidth: { narrow: 'Narrow (1152px)', standard: 'Standard (1280px)', wide: 'Wide (1440px)' },
  cornerRadius: { sharp: 'Sharp (current look)', soft: 'Soft', rounded: 'Rounded' },
  preset: { off: 'Off', subtle: 'Subtle', standard: 'Standard' },
};
const HINTS = {
  contentWidth: 'The maximum width of page content on large screens.',
  cornerRadius: 'Corners of cards and buttons. The navbar buttons keep their own settings.',
  preset: 'Off shows everything at once. Visitors who prefer reduced motion never see animation.',
  durationMs: 'How long each section takes to appear.',
  staggerMs: 'The pause between cards in a row.',
};

function validateDraft(draft) {
  const errors = {};
  for (const [group, fields] of Object.entries(THEME_APPEARANCE_SPEC)) {
    for (const [key, field] of Object.entries(fields)) {
      const value = draft[group][key];
      const name = `${group}.${key}`;
      if (field.type === 'color' && !HEX_COLOR.test(value)) errors[name] = 'Use a 6-digit hex colour such as #D8AD54.';
      if (field.type === 'enum' && !field.options.includes(value)) errors[name] = 'Choose one of the listed options.';
      if (field.type === 'number' && !(Number.isInteger(value) && value >= field.min && value <= field.max)) errors[name] = `Use a whole number from ${field.min} to ${field.max}.`;
    }
  }
  return errors;
}

/** WCAG contrast of two #RRGGBB colours; invalid input counts as fine (the field shows its own error). */
function contrast(a, b) {
  if (!HEX_COLOR.test(a) || !HEX_COLOR.test(b)) return 21;
  const lum = (hex) => {
    const [r, g, b2] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function readabilityWarnings(c) {
  const checks = [
    ['Text on the page background', c.darkColor, c.surfaceColor],
    ['Secondary text on the page background', c.mutedTextColor, c.surfaceColor],
    ['Secondary text on muted sections', c.mutedTextColor, c.mutedSurfaceColor],
    ['White text on dark sections', '#FFFFFF', c.darkColor],
    ['White text on the darkest sections', '#FFFFFF', c.darkestColor],
    ['Dark text on gold buttons', c.darkestColor, c.accentColor],
  ];
  return checks.map(([label, fg, bg]) => ({ label, ratio: contrast(fg, bg) })).filter((check) => check.ratio < 4.5);
}

/** The draft theme on sample content, using the real classes and components. Changes nothing outside this box. */
function ThemePreview({ draft }) {
  const [replay, setReplay] = useState(0);
  return (
    <div className="space-y-3">
      <div inert aria-hidden="true" style={themeCssVars(draft)} className="overflow-hidden rounded-md border border-steel-300">
        <div key={replay} className="bg-[var(--color-surface)] p-6 text-ink-900">
          <Reveal>
            <p className="mb-2 flex items-center gap-3 text-base font-bold uppercase tracking-widest text-steel-600"><span className="h-1 w-8 bg-signal-500" />Services</p>
            <p className="text-2xl font-extrabold">Freight solutions built around your shipment</p>
            <p className="mt-2 text-base text-steel-600">Secondary text explains the details.</p>
          </Reveal>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {['Full Truckload', 'Less-Than-Truckload', 'Cross-Border'].map((title, index) => (
              <Reveal key={title} delay={index * 80}>
                <div className="h-full rounded-[var(--site-card-radius,0px)] border border-steel-200 bg-white p-4">
                  <span className="flex size-10 items-center justify-center bg-ink-900 text-signal-400">★</span>
                  <p className="mt-3 font-bold">{title}</p>
                  <p className="text-base text-steel-600">A short card description.</p>
                </div>
              </Reveal>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3 bg-steel-50 p-4">
            <Button>Primary button</Button>
            <Button variant="secondary">Secondary button</Button>
          </div>
        </div>
        <div data-surface="dark" className="bg-ink-900 p-6 text-white">
          <p className="text-xl font-extrabold">Dark section</p>
          <div className="glass-panel mt-3 p-4">
            <p className="font-bold">Glass card</p>
            <p className="text-base text-steel-200">Readable text on a translucent card.</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button tone="dark">Request a Quote</Button>
            <Button tone="dark" variant="secondary">Become a Carrier</Button>
          </div>
        </div>
        <div className="bg-ink-950 p-4 text-base text-steel-200">Darkest section (footer)</div>
      </div>
      <Button variant="secondary" size="sm" onClick={() => setReplay((n) => n + 1)}>Replay animation</Button>
    </div>
  );
}

function ThemeForm({ data, onSaved }) {
  const toast = useAdminToast();
  const [saved, setSaved] = useState(() => clone(data.theme));
  const [draft, setDraft] = useState(() => clone(data.theme));
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ busy: false, error: '' });
  const [confirmReset, setConfirmReset] = useState(false);
  const dirty = !same(draft, saved);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const setField = useCallback((group, key, value) => {
    setDraft((current) => ({ ...current, [group]: { ...current[group], [key]: value } }));
    setErrors((current) => {
      if (!current[`${group}.${key}`]) return current;
      const next = { ...current };
      delete next[`${group}.${key}`];
      return next;
    });
  }, []);

  const save = async (event) => {
    event.preventDefault();
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length) {
      setStatus({ busy: false, error: 'Some values need attention before they can be saved.' });
      return;
    }
    setStatus({ busy: true, error: '' });
    try {
      const result = await saveThemeAppearance(draft);
      setSaved(clone(result.theme));
      setDraft(clone(result.theme));
      setStatus({ busy: false, error: '' });
      toast.success('Website theme saved. The public website uses it on the next page load.');
      onSaved?.(result);
    } catch (error) {
      const fieldErrors = Object.fromEntries((error instanceof ApiRequestError ? error.errors ?? [] : []).filter((item) => item.field).map((item) => [item.field, item.message]));
      setErrors(fieldErrors);
      setStatus({ busy: false, error: error instanceof ApiRequestError && error.message ? error.message : 'The website theme could not be saved. Please try again.' });
    }
  };

  const reset = async () => {
    const result = await resetThemeAppearance();
    setSaved(clone(result.theme));
    setDraft(clone(result.theme));
    setErrors({});
    setStatus({ busy: false, error: '' });
    setConfirmReset(false);
    toast.success('Website theme reset to the defaults.');
    onSaved?.(result);
  };

  const warnings = readabilityWarnings(draft.colors);
  const choice = (group, key) => {
    const field = THEME_APPEARANCE_SPEC[group][key];
    return (
      <ChoiceField
        id={`theme-${group}-${key}`}
        label={{ contentWidth: 'Content width', cornerRadius: 'Corners', preset: 'Animation' }[key]}
        hint={HINTS[key]}
        value={draft[group][key]}
        options={field.options.map((value) => ({ value, label: OPTION_LABELS[key][value] }))}
        onChange={(value) => setField(group, key, value)}
      />
    );
  };

  return (
    <>
      <UnsavedGuard dirty={dirty} dirtyRef={dirtyRef} />
      <form onSubmit={save} noValidate aria-label="Website theme" className="space-y-6">
        <Panel title="Preview" description="Shows your unsaved changes. Visitors keep seeing the saved theme until you press Save changes.">
          <ThemePreview draft={draft} />
        </Panel>

        {warnings.length > 0 && (
          <div role="status" className="rounded-md border border-danger-700 bg-danger-50 p-4 text-base">
            <p className="font-semibold">Some text may be hard to read:</p>
            <ul className="mt-1 list-disc pl-5">
              {warnings.map((warning) => (
                <li key={warning.label}>{warning.label}: contrast {warning.ratio.toFixed(1)}:1 (aim for at least 4.5:1)</li>
              ))}
            </ul>
          </div>
        )}

        <Panel title="Colours" description="Used across the public website. The navbar and the homepage hero have their own settings.">
          <div className="grid gap-6 sm:grid-cols-2">
            {Object.keys(THEME_APPEARANCE_SPEC.colors).map((key) => (
              <ColorField key={key} id={`theme-colors-${key}`} label={COLOR_LABELS[key]} value={draft.colors[key]} error={errors[`colors.${key}`]} onChange={(value) => setField('colors', key, value)} />
            ))}
          </div>
        </Panel>
        <Panel title="Layout">
          <div className="space-y-6">
            {choice('layout', 'contentWidth')}
            {choice('layout', 'cornerRadius')}
          </div>
        </Panel>
        <Panel title="Animation">
          <div className="space-y-6">
            {choice('motion', 'preset')}
            <div className="grid gap-6 sm:grid-cols-2">
              <RangeField id="theme-motion-durationMs" label="Animation speed" value={draft.motion.durationMs} field={THEME_APPEARANCE_SPEC.motion.durationMs} unit="ms" hint={HINTS.durationMs} error={errors['motion.durationMs']} onChange={(value) => setField('motion', 'durationMs', value)} />
              <RangeField id="theme-motion-staggerMs" label="Card stagger" value={draft.motion.staggerMs} field={THEME_APPEARANCE_SPEC.motion.staggerMs} unit="ms" hint={HINTS.staggerMs} error={errors['motion.staggerMs']} onChange={(value) => setField('motion', 'staggerMs', value)} />
            </div>
          </div>
        </Panel>

        {status.error && <Alert>{status.error}</Alert>}
        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-steel-200 bg-white py-4 sm:flex-row sm:flex-wrap sm:items-center">
          <Button type="submit" loading={status.busy} disabled={!dirty}>{status.busy ? 'Saving…' : 'Save changes'}</Button>
          <Button variant="secondary" disabled={!dirty || status.busy} onClick={() => { setDraft(clone(saved)); setErrors({}); setStatus({ busy: false, error: '' }); }}>Revert unsaved changes</Button>
          <Button variant="secondary" disabled={status.busy} onClick={() => setConfirmReset(true)}>Reset to defaults</Button>
          <p className="text-base text-steel-600 sm:ml-auto" role="status">{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</p>
        </div>
      </form>
      <AdminConfirmDialog
        open={confirmReset}
        title="Reset the website theme to the defaults?"
        description={<p>This replaces the saved colours, layout and animation settings with the default charcoal theme straight away. The navbar, homepage content and other settings are not changed.</p>}
        confirmLabel="Reset to defaults"
        tone="danger"
        onConfirm={reset}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  );
}

export default function CmsThemePage() {
  const [version, setVersion] = useState(0);
  const state = useAsyncData(useCallback(() => getThemeAppearance(), [version]));
  return (
    <AdminPage title="Website theme" description="Colours, content width, corners and animation for the public website. Customer and carrier portals and this admin panel are not affected.">
      <AdminAsyncView state={state} label="Loading the website theme" errorTitle="We could not load the website theme">
        {(data) => (
          <>
            <p className="mb-6 text-base text-steel-600">
              {data.isDefault ? 'The website uses the default theme.' : `Customised${data.updatedAt ? `; settings last saved ${formatDateTime(data.updatedAt)}` : ''}.`}
            </p>
            <ThemeForm key={version} data={data} onSaved={() => setVersion((current) => current + 1)} />
          </>
        )}
      </AdminAsyncView>
    </AdminPage>
  );
}
