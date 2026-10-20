import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import AdminAsyncView from '../../../components/admin/AdminAsyncView';
import AdminConfirmDialog from '../../../components/admin/AdminConfirmDialog';
import AdminPage from '../../../components/admin/AdminPage';
import { useAdminToast } from '../../../components/admin/AdminToast';
import { ColorField, RangeField, ToggleField } from '../../../components/admin/cms/AppearanceFields';
import UnsavedGuard from '../../../components/admin/cms/UnsavedGuard';
import Alert from '../../../components/common/Alert';
import Button from '../../../components/common/Button';
import Panel from '../../../components/customer/Panel';
import Logo from '../../../components/common/Logo';
import { NAV_STYLES } from '../../../components/layout/Navbar';
import { brand } from '../../../config/brand';
import { headerNavItems } from '../../../config/navigation';
import { HEX_COLOR, NAVBAR_APPEARANCE_SPEC, navbarCssVars } from '../../../config/navbarAppearance';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { getCmsSettings, getNavbarAppearance, resetNavbarAppearance, saveNavbarAppearance } from '../../../services/adminService';
import { ApiRequestError } from '../../../utils/apiRequestError';
import { cx } from '../../../utils/cx';
import { formatDateTime } from '../../../utils/format';

/**
 * Website CMS -> Navbar appearance. Everything on this page is a local draft: the preview shows the draft, and nothing reaches
 * the public website (or any other visitor) until Save changes succeeds. Colours are #RRGGBB; numbers have the same limits
 * the API enforces, so the server never has to guess.
 */

const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const LABELS = {
  hero: {
    transparentEnabled: 'Transparent glass over the hero',
    backgroundColor: 'Glass colour',
    backgroundOpacity: 'Glass opacity',
    textColor: 'Link text colour',
    iconColor: 'Icon colour (menu and dropdown arrows)',
    borderColor: 'Bottom border colour',
    borderOpacity: 'Bottom border opacity',
    blur: 'Background blur',
    shadow: 'Shadow under the navbar',
  },
  scrolled: {
    solidEnabled: 'Turn solid after scrolling',
    backgroundColor: 'Background colour',
    textColor: 'Link text colour',
    iconColor: 'Icon colour (menu and dropdown arrows)',
    borderColor: 'Bottom border colour',
    shadow: 'Shadow under the navbar',
    transitionMs: 'Transition speed',
    scrollThreshold: 'Scroll distance before it turns solid',
  },
  links: {
    hoverColor: 'Link hover colour',
    activeColor: 'Current page link colour',
    dropdownBackgroundColor: 'Dropdown background',
    dropdownTextColor: 'Dropdown text',
    dropdownHoverBackgroundColor: 'Dropdown hover background',
    dropdownHoverTextColor: 'Dropdown hover text',
  },
  button: {
    textColor: 'Text colour',
    backgroundColor: 'Background colour',
    backgroundOpacity: 'Background opacity',
    borderColor: 'Border colour',
    hoverTextColor: 'Hover text colour',
    hoverBackgroundColor: 'Hover background colour',
    hoverBackgroundOpacity: 'Hover background opacity',
  },
};
const UNITS = { backgroundOpacity: '%', borderOpacity: '%', hoverBackgroundOpacity: '%', blur: 'px', transitionMs: 'ms', scrollThreshold: 'px' };
const HINTS = {
  'hero.transparentEnabled': 'Off: the navbar is always solid, using the scrolled colours below.',
  'hero.backgroundOpacity': 'Only the navbar background becomes see-through. The logo, links and buttons stay fully visible.',
  'hero.blur': 'Softens the hero behind the glass. 0 turns it off.',
  'scrolled.solidEnabled': 'Off: the navbar keeps its hero look while the visitor scrolls.',
  'scrolled.transitionMs': 'How long the change from glass to solid takes. Visitors who prefer reduced motion see no animation.',
  'trackButton.backgroundOpacity': '0% gives an outlined button.',
};

function validateDraft(draft) {
  const errors = {};
  for (const [group, fields] of Object.entries(NAVBAR_APPEARANCE_SPEC)) {
    for (const [key, field] of Object.entries(fields)) {
      const value = draft[group][key];
      const name = `${group}.${key}`;
      if (field.type === 'color' && !HEX_COLOR.test(value)) errors[name] = 'Use a 6-digit hex colour such as #D8AD54.';
      if (field.type === 'number' && !(Number.isInteger(value) && value >= field.min && value <= field.max)) errors[name] = `Use a whole number from ${field.min} to ${field.max}.`;
    }
  }
  return errors;
}

function GroupFields({ group, labels, draft, errors, setField }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {Object.entries(NAVBAR_APPEARANCE_SPEC[group]).map(([key, field]) => {
        const name = `${group}.${key}`;
        const id = `navbar-${group}-${key}`;
        const props = { id, label: labels[key], error: errors[name], onChange: (value) => setField(group, key, value) };
        if (field.type === 'color') return <ColorField key={key} value={draft[group][key]} {...props} />;
        if (field.type === 'number') return <RangeField key={key} value={draft[group][key]} field={field} unit={UNITS[key] ?? ''} hint={HINTS[name]} {...props} />;
        return <div key={key} className="sm:col-span-2"><ToggleField id={id} label={labels[key]} hint={HINTS[name]} checked={draft[group][key]} onChange={props.onChange} /></div>;
      })}
    </div>
  );
}

/**
 * A non-interactive copy of the public two-row navbar over a neutral hero. It uses the same class names (NAV_STYLES), the same
 * Logo, link list and login buttons as the public Navbar, plus the draft's CSS variables, so only the layout shell is repeated.
 * The preview is `inert`: nothing in it navigates, focuses or submits.
 */
function PreviewBar({ draft, solid, title, note, branding }) {
  const links = headerNavItems.filter((item) => !item.children);
  const more = headerNavItems.find((item) => item.children);
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 text-base font-semibold">{title}</figcaption>
      <div className="overflow-x-auto rounded-md border border-steel-300">
        <div
          inert
          aria-hidden="true"
          className="relative min-w-[76rem] bg-[linear-gradient(120deg,#8a8178_0%,#5b5650_45%,#2b2a28_100%)] pb-28"
        >
          <div style={navbarCssVars(draft, solid)} className={NAV_STYLES.header}>
            <div className="flex min-h-[5.25rem] items-center justify-between gap-6 border-b px-8 [border-color:var(--nav-border)]">
              <Logo tone="light" name={branding.name} image={branding.logo} tagline={branding.tagline} />
              <div className="flex items-center gap-3">
                <span className={cx(NAV_STYLES.action, NAV_STYLES.login, 'gap-2')}>Sign In <ChevronDown className="size-4" /></span>
                <span className={cx(NAV_STYLES.action, NAV_STYLES.track)}>Track Shipment</span>
                <span className={cx(NAV_STYLES.action, NAV_STYLES.quote)}>Request a Quote</span>
              </div>
            </div>
            <ul className="flex min-h-12 items-center justify-center gap-x-6 px-8">
              {links.map((item, index) => (
                <li key={item.label} className={cx(NAV_STYLES.link, index === 0 ? NAV_STYLES.linkActive : NAV_STYLES.linkIdle, item.label === 'Contact' && '[border-color:transparent] [color:var(--nav-link-hover)]')}>
                  {item.label}{item.label === 'Contact' && ' (hover)'}
                </li>
              ))}
              <li className={cx(NAV_STYLES.link, NAV_STYLES.linkIdle, 'relative gap-1')}>
                {more.label} <ChevronDown className={cx('size-4', NAV_STYLES.icon)} />
                {solid && (
                  <ul className={cx(NAV_STYLES.dropdown, 'absolute right-0 top-full z-10 mt-2')}>
                    {more.children.map((child, index) => (
                      <li key={child.label} className={cx(NAV_STYLES.dropdownItem, index === 1 && '[background-color:var(--nav-dd-hover-bg)] [color:var(--nav-dd-hover-text)]')}>{child.label}{index === 1 && ' (hover)'}</li>
                    ))}
                  </ul>
                )}
              </li>
            </ul>
          </div>
          <p className="px-8 pt-10 text-2xl font-extrabold text-white">Hero image area</p>
        </div>
      </div>
      <p className="mt-2 text-base text-steel-600">Preview only: links and buttons here do not navigate.{note ? ` ${note}` : ''}</p>
    </figure>
  );
}

function AppearanceForm({ data, onSaved }) {
  const toast = useAdminToast();
  const [saved, setSaved] = useState(() => clone(data.appearance));
  const [draft, setDraft] = useState(() => clone(data.appearance));
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
      const result = await saveNavbarAppearance(draft);
      setSaved(clone(result.appearance));
      setDraft(clone(result.appearance));
      setStatus({ busy: false, error: '' });
      toast.success('Navbar appearance saved. The public website uses it on the next page load.');
      onSaved?.(result);
    } catch (error) {
      const fieldErrors = Object.fromEntries((error instanceof ApiRequestError ? error.errors ?? [] : []).filter((item) => item.field).map((item) => [item.field, item.message]));
      setErrors(fieldErrors);
      setStatus({ busy: false, error: error instanceof ApiRequestError && error.message ? error.message : 'The navbar appearance could not be saved. Please try again.' });
    }
  };

  const reset = async () => {
    const result = await resetNavbarAppearance();
    setSaved(clone(result.appearance));
    setDraft(clone(result.appearance));
    setErrors({});
    setStatus({ busy: false, error: '' });
    setConfirmReset(false);
    toast.success('Navbar appearance reset to the defaults.');
    onSaved?.(result);
  };

  // Saved company name, tagline and logo (Website settings -> Company); the built-in defaults while loading or if unavailable.
  const [branding, setBranding] = useState({ name: brand.name, tagline: brand.tagline, logo: null });
  useEffect(() => {
    let active = true;
    getCmsSettings().then((saved) => {
      if (active && saved?.exists !== false) setBranding({ name: saved.companyName || brand.name, tagline: saved.tagline || brand.tagline, logo: saved.logo?.url ? saved.logo : null });
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const transparentOn = draft.hero.transparentEnabled;
  const previewNote = useMemo(
    () => (!transparentOn ? 'Transparent glass is off, so the navbar is solid over the hero too.' : !draft.scrolled.solidEnabled ? 'Solid-on-scroll is off, so the navbar keeps the glass look while scrolling.' : null),
    [transparentOn, draft.scrolled.solidEnabled]
  );

  return (
    <>
    <UnsavedGuard dirty={dirty} dirtyRef={dirtyRef} />
    <form onSubmit={save} noValidate aria-label="Navbar appearance" className="space-y-6">

      <Panel title="Preview" description="Shows your unsaved changes. Visitors keep seeing the saved navbar until you press Save changes.">
        <div className="space-y-6">
          <PreviewBar branding={branding} draft={draft} solid={!transparentOn} title="1. Over the hero (transparent glass)" note={!transparentOn ? previewNote : null} />
          <PreviewBar branding={branding} draft={draft} solid={draft.scrolled.solidEnabled || !transparentOn} title="2. After scrolling (solid)" note={transparentOn ? previewNote : null} />
        </div>
      </Panel>

      <Panel title="Hero state" description="How the navbar looks at the top of the page, over the hero image or video.">
        <GroupFields group="hero" labels={LABELS.hero} draft={draft} errors={errors} setField={setField} />
      </Panel>
      <Panel title="Scrolled state" description="How the navbar looks once the visitor scrolls down.">
        <GroupFields group="scrolled" labels={LABELS.scrolled} draft={draft} errors={errors} setField={setField} />
      </Panel>
      <Panel title="Navigation links" description="Hover and current-page colours, and the Solutions dropdown. Link names and destinations are not changed here.">
        <GroupFields group="links" labels={LABELS.links} draft={draft} errors={errors} setField={setField} />
      </Panel>
      <Panel title="Action buttons" description="Keep the text readable against its background in both states.">
        <div className="space-y-8">
          <section aria-labelledby="track-button-heading">
            <h3 id="track-button-heading" className="mb-4 text-lg font-bold">Track Shipment</h3>
            <GroupFields group="trackButton" labels={LABELS.button} draft={draft} errors={errors} setField={setField} />
          </section>
          <section aria-labelledby="quote-button-heading">
            <h3 id="quote-button-heading" className="mb-4 text-lg font-bold">Request a Quote</h3>
            <GroupFields group="quoteButton" labels={LABELS.button} draft={draft} errors={errors} setField={setField} />
          </section>
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
        title="Reset the navbar to the default design?"
        description={<p>This replaces the saved navbar colours and settings with the approved defaults straight away. Other website settings are not changed.</p>}
        confirmLabel="Reset to defaults"
        tone="danger"
        onConfirm={reset}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  );
}

export default function CmsNavbarAppearancePage() {
  const [version, setVersion] = useState(0);
  const state = useAsyncData(useCallback(() => getNavbarAppearance(), [version]));
  return (
    <AdminPage
      title="Navbar appearance"
      trail={[{ label: 'Settings', to: '/admin/settings' }, { label: 'Appearance: Navbar' }]}
      description="Colours, transparency and scrolling behaviour of the public website's navigation bar. Link names and destinations stay as they are."
    >
      <AdminAsyncView state={state} label="Loading navbar appearance" errorTitle="We could not load the navbar appearance">
        {(data) => (
          <>
            <p className="mb-6 text-base text-steel-600">
              {data.isDefault ? 'The website uses the default navbar design.' : `Customised${data.updatedAt ? `; settings last saved ${formatDateTime(data.updatedAt)}` : ''}.`}
            </p>
            <AppearanceForm key={version} data={data} onSaved={() => setVersion((current) => current + 1)} />
          </>
        )}
      </AdminAsyncView>
    </AdminPage>
  );
}
