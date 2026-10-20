import { useCallback, useState } from 'react';
import AdminAsyncView from '../../../components/admin/AdminAsyncView';
import AdminPage from '../../../components/admin/AdminPage';
import CmsForm from '../../../components/admin/cms/CmsForm';
import { CmsButton, CmsList, CmsMedia, CmsRepeater, CmsSelect, CmsSeo, CmsText, CmsTextArea, CmsToggle } from '../../../components/admin/cms/CmsFields';
import { buttonBody, buttonValue, mediaBody, mediaValue, seoBody, seoValue, str, trimmed, useCmsForm } from '../../../components/admin/cms/useCmsForm';
import { ICON_NAMES } from '../../../components/common/IconByName';
import Button from '../../../components/common/Button';
import Panel from '../../../components/customer/Panel';
import { useAsyncData } from '../../../hooks/useAsyncData';
import { getCmsHomepage, saveCmsHomepage } from '../../../services/adminService';
import { services as builtInServices } from '../../../content/services';
import { industries as builtInIndustries } from '../../../content/industries';
import { serviceAreas as builtInAreas, trustItems as builtInTrust } from '../../../content/home';
import { SECTION_ANIMATIONS, SECTION_APPEARANCE_CAPABILITIES, SECTION_CARD_STYLES, SECTION_SPACINGS, resolveSectionAppearance } from '../../../config/sectionAppearance';

/** Homepage section keys, in the website's default order, with where each one lives in the saved document. */
export const HOME_SECTIONS = [
  { key: 'trust', field: 'trust', label: 'Trust strip', list: 'items', itemLabel: 'Trust point' },
  { key: 'services', field: 'servicesSection', label: 'Services' },
  { key: 'whyChooseUs', field: 'whyChooseUs', label: 'Why choose us', list: 'items', itemLabel: 'Reason' },
  { key: 'howItWorks', field: 'howItWorks', label: 'How it works', list: 'steps', itemLabel: 'Step' },
  { key: 'industries', field: 'industries', label: 'Industries' },
  { key: 'crossBorder', field: 'crossBorder', label: 'Cross-border', highlights: true },
  { key: 'serviceAreas', field: 'serviceAreas', label: 'Service areas' },
  { key: 'stats', field: 'statsSection', label: 'Statistics', stats: true },
  { key: 'testimonials', field: 'testimonials', label: 'Testimonials' },
  { key: 'faq', field: 'faq', label: 'FAQ' },
  { key: 'finalCTA', field: 'finalCTA', label: 'Final call to action', buttons: true },
];

const header = (section) => ({ title: str(section?.title), subtitle: str(section?.subtitle), description: str(section?.description), isActive: section?.isActive !== false, image: mediaValue(section?.image), button: buttonValue(section?.button) });
const item = (entry) => ({ title: str(entry.title), description: str(entry.description), icon: str(entry.icon), isActive: entry.isActive !== false });
/** The website's built-in trust cards, in the shape of a saved item, so they can be edited here before anything is saved. */
const builtInTrustItems = builtInTrust.map((card) => ({ title: card.title, description: card.text, icon: card.icon }));
/** A trust-strip card also carries its own optional background picture. */
const trustItem = (entry) => ({ ...item(entry), image: mediaValue(entry.image) });

function initialValues(data) {
  const hero = data.hero ?? {};
  const sections = {};
  for (const s of HOME_SECTIONS) {
    const saved = data[s.field] ?? {};
    sections[s.field] = {
      ...header(saved),
      appearance: resolveSectionAppearance(s.field, saved.appearance),
      ...(s.list ? { [s.list]: (s.field === 'trust' ? (saved.items?.length ? saved.items : builtInTrustItems).map(trustItem) : (saved[s.list] ?? []).map(item)) } : {}),
      ...(s.field === 'servicesSection' ? { cardImages: Object.fromEntries(builtInServices.map((svc) => [svc.slug, mediaValue((saved.cardImages ?? []).find((c) => c.slug === svc.slug)?.image)])) } : {}),
      ...(s.field === 'industries' ? { cardImages: Object.fromEntries(builtInIndustries.map((ind) => [ind.slug, mediaValue((saved.cardImages ?? []).find((c) => c.slug === ind.slug)?.image)])) } : {}),
      ...(s.field === 'serviceAreas' ? { cardImages: Object.fromEntries(builtInAreas.map((area) => [area.slug, mediaValue((saved.cardImages ?? []).find((c) => c.slug === area.slug)?.image)])) } : {}),
      ...(s.highlights ? { highlights: (saved.highlights ?? []).map(str) } : {}),
      ...(s.buttons ? { primaryButton: buttonValue(saved.primaryButton), secondaryButton: buttonValue(saved.secondaryButton) } : {}),
    };
  }
  return {
    hero: {
      eyebrow: str(hero.eyebrow), title: str(hero.title), subtitle: str(hero.subtitle), description: str(hero.description),
      backgroundVideo: mediaValue(hero.backgroundVideo), fallbackImage: mediaValue(hero.fallbackImage), poster: mediaValue(hero.poster),
      primaryButton: buttonValue(hero.primaryButton), secondaryButton: buttonValue(hero.secondaryButton),
      overlay: { color: hero.overlay?.color ?? '#000000', opacity: String(hero.overlay?.opacity ?? 0.5), isActive: hero.overlay?.isActive !== false },
      autoplay: hero.autoplay !== false, muted: hero.muted !== false, loop: hero.loop !== false, isActive: hero.isActive !== false,
    },
    sectionOrder: data.sectionOrder,
    sections,
    stats: (data.stats ?? []).map((s) => ({ label: str(s.label), value: str(s.value), description: str(s.description), isActive: s.isActive !== false })),
    SEO: seoValue(data.SEO),
  };
}

const sectionBody = (section) => ({
  title: trimmed(section.title), subtitle: trimmed(section.subtitle), description: trimmed(section.description), isActive: section.isActive, image: mediaBody(section.image), button: buttonBody(section.button),
});
/** Only the presets this section supports are sent (the API refuses anything else). */
function appearanceBody(field, appearance) {
  const caps = SECTION_APPEARANCE_CAPABILITIES[field] ?? {};
  const out = {};
  if (caps.backgrounds) out.background = appearance.background;
  if (caps.spacing) out.spacing = appearance.spacing;
  if (caps.animation) out.animation = appearance.animation;
  if (caps.cardStyle) out.cardStyle = appearance.cardStyle;
  return out;
}
const itemsBody = (list, withImage) => list.map((entry, index) => ({ title: trimmed(entry.title), description: trimmed(entry.description), icon: trimmed(entry.icon), ...(withImage ? { image: mediaBody(entry.image) } : {}), displayOrder: index * 10, isActive: entry.isActive }));

function buildBody(v) {
  const hero = v.hero;
  const body = {
    hero: {
      eyebrow: trimmed(hero.eyebrow), title: trimmed(hero.title), subtitle: trimmed(hero.subtitle), description: trimmed(hero.description),
      backgroundVideo: mediaBody(hero.backgroundVideo), fallbackImage: mediaBody(hero.fallbackImage), poster: mediaBody(hero.poster),
      primaryButton: buttonBody(hero.primaryButton), secondaryButton: buttonBody(hero.secondaryButton),
      overlay: { color: trimmed(hero.overlay.color), opacity: Number(hero.overlay.opacity), isActive: hero.overlay.isActive },
      autoplay: hero.autoplay, muted: true, loop: hero.loop, isActive: hero.isActive,
    },
    sectionOrder: v.sectionOrder,
    stats: v.stats.map((s, index) => ({ label: trimmed(s.label), value: trimmed(s.value), description: trimmed(s.description), isActive: s.isActive, displayOrder: index * 10 })),
    SEO: seoBody(v.SEO),
  };
  for (const s of HOME_SECTIONS) {
    const section = v.sections[s.field];
    body[s.field] = {
      ...sectionBody(section),
      // A section is saved as a whole, so its appearance always travels with its content.
      appearance: appearanceBody(s.field, section.appearance),
      ...(s.list ? { [s.list]: itemsBody(section[s.list], s.field === 'trust') } : {}),
      ...(s.field === 'servicesSection' ? { cardImages: Object.entries(section.cardImages ?? {}).filter(([, image]) => image?.url).map(([slug, image]) => ({ slug, image: mediaBody(image) })) } : {}),
      ...(s.field === 'industries' ? { cardImages: Object.entries(section.cardImages ?? {}).filter(([, image]) => image?.url).map(([slug, image]) => ({ slug, image: mediaBody(image) })) } : {}),
      ...(s.field === 'serviceAreas' ? { cardImages: Object.entries(section.cardImages ?? {}).filter(([, image]) => image?.url).map(([slug, image]) => ({ slug, image: mediaBody(image) })) } : {}),
      ...(s.highlights ? { highlights: section.highlights.map((line) => line.trim()).filter(Boolean) } : {}),
      ...(s.buttons ? { primaryButton: buttonBody(section.primaryButton), secondaryButton: buttonBody(section.secondaryButton) } : {}),
    };
  }
  return body;
}

function validate(v) {
  const found = {};
  const opacity = Number(v.hero.overlay.opacity);
  if (v.hero.overlay.opacity === '' || Number.isNaN(opacity) || opacity < 0 || opacity > 1) found['hero.overlay.opacity'] = 'Enter a number from 0 (clear) to 1 (solid).';
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.hero.overlay.color.trim())) found['hero.overlay.color'] = 'Use a hex colour such as #000000.';
  for (const s of HOME_SECTIONS) {
    if (s.list) v.sections[s.field][s.list].forEach((entry, index) => { if (!entry.title.trim()) found[`sections.${s.field}.${s.list}.${index}.title`] = 'Enter a title.'; });
  }
  v.stats.forEach((stat, index) => {
    if (!stat.label.trim()) found[`stats.${index}.label`] = 'Enter a label.';
    if (!stat.value.trim()) found[`stats.${index}.value`] = 'Enter a value.';
  });
  return found;
}

/** The API reports errors as trust.items.0.title; the form keeps sections under `sections.`, so map the paths before they are shown. */
function mapServerErrors(error) {
  if (Array.isArray(error?.errors)) {
    error.errors = error.errors.map((entry) => ({ ...entry, field: HOME_SECTIONS.some((s) => entry.field?.startsWith(`${s.field}.`)) ? `sections.${entry.field}` : entry.field }));
  }
  throw error;
}

function ItemFields({ form, prefix, withImage }) {
  return (
    <div className="space-y-4">
      <CmsText form={form} name={`${prefix}.title`} label="Title" maxLength={150} />
      <CmsTextArea form={form} name={`${prefix}.description`} label="Description" rows={3} maxLength={1000} />
      <CmsText form={form} name={`${prefix}.icon`} label="Icon name (optional)" hint={`One of: ${ICON_NAMES.join(", ")}.`} maxLength={60} />
      {withImage && <CmsMedia form={form} name={`${prefix}.image`} label="Card background picture (optional)" hint="Shown behind this card on the homepage with a dark overlay so the text stays readable. Choose or upload a picture; remove it to go back to the plain card. Save the homepage to publish the change." />}
      <CmsToggle form={form} name={`${prefix}.isActive`} label="Show" />
    </div>
  );
}

const APPEARANCE_LABELS = {
  background: { default: 'Built-in', light: 'Light', muted: 'Muted', dark: 'Dark', glass: 'Glass' },
  spacing: { compact: 'Compact', standard: 'Standard', spacious: 'Spacious' },
  animation: { default: 'Built-in', none: 'None', fade: 'Fade in', up: 'Fade and rise' },
  cardStyle: { default: 'Built-in', glass: 'Glass' },
};
const options = (kind, values) => values.map((value) => ({ value, label: APPEARANCE_LABELS[kind][value] }));

/** Look of one section: named presets only, and only those this section can show safely. */
function AppearanceFields({ form, spec }) {
  const caps = SECTION_APPEARANCE_CAPABILITIES[spec.field] ?? {};
  const prefix = `sections.${spec.field}.appearance`;
  return (
    <fieldset className="space-y-4 rounded-md border border-steel-200 p-4">
      <legend className="px-1 text-base font-bold">Appearance</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {caps.backgrounds && <CmsSelect form={form} name={`${prefix}.background`} label="Background" options={options('background', caps.backgrounds)} hint={spec.key === 'faq' ? 'Light backgrounds only, so the questions stay readable.' : undefined} />}
        {caps.spacing && <CmsSelect form={form} name={`${prefix}.spacing`} label="Spacing" options={options('spacing', SECTION_SPACINGS)} />}
        {caps.animation && <CmsSelect form={form} name={`${prefix}.animation`} label="Animation" options={options('animation', SECTION_ANIMATIONS)} />}
        {caps.cardStyle && <CmsSelect form={form} name={`${prefix}.cardStyle`} label="Cards" options={options('cardStyle', SECTION_CARD_STYLES)} />}
      </div>
    </fieldset>
  );
}

function SectionPanel({ form, spec }) {
  const prefix = `sections.${spec.field}`;
  return (
    <Panel title={spec.label} description="Leave a field empty to keep the website’s built-in text for it.">
      <div className="space-y-5">
        <CmsText form={form} name={`${prefix}.title`} label="Heading" maxLength={150} />
        <CmsText form={form} name={`${prefix}.subtitle`} label="Subheading" maxLength={200} />
        <CmsTextArea form={form} name={`${prefix}.description`} label="Introduction" rows={3} maxLength={1500} />
        {spec.key === 'services' ? (
          <CmsMedia form={form} name={`${prefix}.image`} label="Section background image (optional)" hint="Shown behind the Services cards on the homepage with a dark overlay for readability. Choose or upload a picture to replace it; remove it to restore the built-in background. Save the homepage to publish the change." />
        ) : spec.key !== 'trust' && (
          <CmsMedia form={form} name={`${prefix}.image`} label="Section image (optional)" />
        )}
        {!spec.buttons && <CmsButton form={form} name={`${prefix}.button`} label="Section button (optional)" />}
        {spec.buttons && (<><CmsButton form={form} name={`${prefix}.primaryButton`} label="Main button" /><CmsButton form={form} name={`${prefix}.secondaryButton`} label="Second button (optional)" /></>)}
        {spec.key === 'services' && (
          <fieldset className="space-y-4 rounded-md border border-steel-200 p-4">
            <legend className="px-1 text-base font-bold">Service card pictures</legend>
            <p className="text-base text-steel-600">Each card on the homepage shows its picture behind the text. Choose or upload a picture to replace the built-in one; remove it to restore the built-in picture. Save the homepage to publish.</p>
            {builtInServices.map((svc) => <CmsMedia key={svc.slug} form={form} name={`${prefix}.cardImages.${svc.slug}`} label={`${svc.title} card picture`} />)}
          </fieldset>
        )}
        {spec.key === 'serviceAreas' && (
          <fieldset className="space-y-4 rounded-md border border-steel-200 p-4">
            <legend className="px-1 text-base font-bold">Service area card pictures</legend>
            <p className="text-base text-steel-600">Each card on the homepage and the Service Areas page shows its picture behind the text. Choose or upload a picture to add one; remove it to go back to the built-in look. Save the homepage to publish.</p>
            {builtInAreas.map((area) => <CmsMedia key={area.slug} form={form} name={`${prefix}.cardImages.${area.slug}`} label={`${area.country} card picture`} />)}
          </fieldset>
        )}
        {spec.key === 'industries' && (
          <fieldset className="space-y-4 rounded-md border border-steel-200 p-4">
            <legend className="px-1 text-base font-bold">Industry card pictures</legend>
            <p className="text-base text-steel-600">Each card on the homepage and the Industries page shows its picture behind the text. Choose or upload a picture to replace the built-in one; remove it to restore the built-in picture. Save the homepage to publish.</p>
            {builtInIndustries.map((ind) => <CmsMedia key={ind.slug} form={form} name={`${prefix}.cardImages.${ind.slug}`} label={`${ind.title} card picture`} />)}
          </fieldset>
        )}
        {spec.list && <CmsRepeater form={form} name={`${prefix}.${spec.list}`} label={spec.itemLabel} addLabel={`Add a ${spec.itemLabel.toLowerCase()}`} max={spec.key === 'trust' ? 8 : 12} blank={() => ({ title: '', description: '', icon: '', ...(spec.key === 'trust' ? { image: null } : {}), isActive: true })} render={(p) => <ItemFields form={form} prefix={p} withImage={spec.key === 'trust'} />} />}
        {spec.highlights && <CmsList form={form} name={`${prefix}.highlights`} label="Highlight" max={10} addLabel="Add a highlight" hint="Cross-border service is U.S. to Canada and U.S. to Mexico only." />}
        {spec.stats && (
          <>
            <p className="rounded-md border border-steel-300 bg-steel-50 p-4 text-base">Only enter figures you can support. Invented numbers damage trust. With no statistics here, the section stays off the website.</p>
            <CmsRepeater form={form} name="stats" label="Statistic" addLabel="Add a statistic" max={12} blank={() => ({ label: '', value: '', description: '', isActive: true })} render={(p) => (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2"><CmsText form={form} name={`${p}.value`} label="Value" maxLength={40} /><CmsText form={form} name={`${p}.label`} label="Label" maxLength={80} /></div>
                <CmsText form={form} name={`${p}.description`} label="Note (optional)" maxLength={200} />
                <CmsToggle form={form} name={`${p}.isActive`} label="Show" />
              </div>
            )} />
          </>
        )}
        {spec.key === 'testimonials' && <p className="text-base text-steel-600">This section appears only when at least one testimonial is visible.</p>}
        <AppearanceFields form={form} spec={spec} />
        <CmsToggle form={form} name={`${prefix}.isActive`} label={`Show the ${spec.label.toLowerCase()} section`} />
      </div>
    </Panel>
  );
}

function OrderPanel({ form }) {
  const order = form.get('sectionOrder');
  const label = (key) => HOME_SECTIONS.find((s) => s.key === key).label;
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    form.set('sectionOrder', next);
  };
  return (
    <Panel title="Section order and visibility" description="The hero is always first and the footer always last. Hidden sections are skipped on the website.">
      <ol className="space-y-2">
        {order.map((key, index) => {
          const spec = HOME_SECTIONS.find((s) => s.key === key);
          const on = form.get(`sections.${spec.field}.isActive`);
          return (
            <li key={key} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-steel-200 p-3">
              <span className="text-base font-semibold">{index + 1}. {label(key)} <span className="font-normal text-steel-600">({on ? 'shown' : 'hidden'})</span></span>
              <span className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={index === 0} aria-label={`Move ${label(key)} up`} onClick={() => move(index, -1)}>Up</Button>
                <Button variant="secondary" size="sm" disabled={index === order.length - 1} aria-label={`Move ${label(key)} down`} onClick={() => move(index, 1)}>Down</Button>
                <Button variant="secondary" size="sm" aria-pressed={on} aria-label={`${on ? 'Hide' : 'Show'} ${label(key)}`} onClick={() => form.set(`sections.${spec.field}.isActive`, !on)}>{on ? 'Hide' : 'Show'}</Button>
              </span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

function HeroPanel({ form }) {
  return (
    <Panel title="Hero" description="The large banner at the top of the homepage. Empty fields keep the built-in hero text and picture.">
      <div className="space-y-5">
        <CmsText form={form} name="hero.eyebrow" label="Small line above the heading" maxLength={100} />
        <CmsText form={form} name="hero.title" label="Heading" maxLength={200} />
        <CmsText form={form} name="hero.subtitle" label="Subheading" maxLength={250} />
        <CmsTextArea form={form} name="hero.description" label="Supporting text" rows={3} maxLength={1500} />
        <CmsButton form={form} name="hero.primaryButton" label="Main button" />
        <CmsButton form={form} name="hero.secondaryButton" label="Second button (optional)" />
        <CmsMedia form={form} name="hero.fallbackImage" label="Fallback image" hint="Shown when there is no video, on slow connections and for people who prefer reduced motion." />
        <CmsMedia form={form} name="hero.backgroundVideo" label="Background video (optional)" type="video" />
        <CmsMedia form={form} name="hero.poster" label="Video poster image (optional)" />
        <div className="grid gap-4 sm:grid-cols-2">
          <CmsText form={form} name="hero.overlay.color" label="Overlay colour" hint="Hex, such as #000000." maxLength={9} />
          <CmsText form={form} name="hero.overlay.opacity" label="Overlay strength" hint="0 is clear, 1 is solid. Keep text readable." inputMode="decimal" />
        </div>
        <CmsToggle form={form} name="hero.overlay.isActive" label="Use the overlay" />
        <CmsToggle form={form} name="hero.autoplay" label="Play the video automatically" hint="The video is always muted, and visitors who prefer reduced motion see the picture instead." />
        <CmsToggle form={form} name="hero.loop" label="Loop the video" />
        <CmsToggle form={form} name="hero.isActive" label="Use the custom hero media" hint="Turn off to fall back to the built-in picture." />
      </div>
    </Panel>
  );
}

function HomepageForm({ data, onSaved }) {
  const form = useCmsForm({
    initial: initialValues(data), validate,
    submit: (v) => saveCmsHomepage(buildBody(v)).catch(mapServerErrors),
    success: 'Homepage saved.', onSaved,
  });
  return (
    <CmsForm form={form} label="Homepage editor" saveLabel="Save homepage">
      <HeroPanel form={form} />
      <OrderPanel form={form} />
      {HOME_SECTIONS.map((spec) => <SectionPanel key={spec.key} form={form} spec={spec} />)}
      <Panel title="Search engines"><CmsSeo form={form} /></Panel>
    </CmsForm>
  );
}

export default function CmsHomepagePage() {
  const [version, setVersion] = useState(0);
  const state = useAsyncData(useCallback(() => getCmsHomepage(), [version]));
  return (
    <AdminPage title="Homepage" description="Change the hero, the order of sections, their text and calls to action. Saved changes appear on the website within about a minute.">
      <AdminAsyncView state={state} label="Loading homepage" errorTitle="We could not load the homepage content">
        {(data) => (
          <>
            {!data.exists && <p role="note" className="mb-6 rounded-md border border-steel-300 bg-steel-50 p-4 text-base">The homepage has not been customised yet, so the website shows its built-in content. Saving creates your version.</p>}
            <HomepageForm key={data.updatedAt ?? 'new'} data={data} onSaved={() => setVersion((current) => current + 1)} />
          </>
        )}
      </AdminAsyncView>
    </AdminPage>
  );
}
