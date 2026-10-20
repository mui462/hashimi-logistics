import { useId, useState } from 'react';
import { ImageOff, Plus, Trash2 } from 'lucide-react';
import Button from '../../common/Button';
import SelectInput from '../../forms/SelectInput';
import TextArea from '../../forms/TextArea';
import TextInput from '../../forms/TextInput';
import MediaPickerDialog from './MediaPickerDialog';

/* Thin wrappers that bind the shared form controls to `form` (from useCmsForm) by API field path. */
export function CmsText({ form, name, label, hint, ...rest }) {
  return <TextInput label={label} hint={hint} value={form.get(name) ?? ''} onChange={(event) => form.set(name, event.target.value)} error={form.errors[name]} {...rest} />;
}
export function CmsTextArea({ form, name, label, hint, rows = 4, ...rest }) {
  return <TextArea label={label} hint={hint} rows={rows} value={form.get(name) ?? ''} onChange={(event) => form.set(name, event.target.value)} error={form.errors[name]} {...rest} />;
}
export function CmsSelect({ form, name, label, hint, options, placeholder }) {
  return <SelectInput label={label} hint={hint} options={options} placeholder={placeholder} value={form.get(name) ?? ''} onChange={(event) => form.set(name, event.target.value)} error={form.errors[name]} />;
}

export function CmsToggle({ form, name, label, hint }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 text-base font-semibold">
        <input id={id} type="checkbox" checked={Boolean(form.get(name))} onChange={(event) => form.set(name, event.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} className="h-10 w-10 shrink-0" />
        <span className="pt-2">{label}</span>
      </label>
      {hint && <p id={`${id}-hint`} className="ml-[3.25rem] text-base text-steel-600">{hint}</p>}
      {form.errors[name] && <p className="ml-[3.25rem] text-base font-medium text-danger-700">{form.errors[name]}</p>}
    </div>
  );
}

/** A call-to-action: a label and a destination. Both empty means "no button". */
export function CmsButton({ form, name, label }) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-steel-200 p-4">
      <legend className="px-1 text-base font-semibold">{label}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <CmsText form={form} name={`${name}.label`} label="Button text" maxLength={60} />
        <CmsText form={form} name={`${name}.url`} label="Button link" hint="A site path such as /quote, or a full https:// address." maxLength={2048} />
      </div>
    </fieldset>
  );
}

/** A repeatable list of plain-text lines (benefits, features, highlights). */
export function CmsList({ form, name, label, hint, max = 20, addLabel = 'Add item' }) {
  const items = form.get(name) ?? [];
  const update = (next) => form.set(name, next);
  return (
    <fieldset className="space-y-3">
      <legend className="text-base font-semibold">{label}</legend>
      {hint && <p className="text-base text-steel-600">{hint}</p>}
      {items.map((item, index) => (
        <div key={index} className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <TextInput label={`${label} ${index + 1}`} value={item} onChange={(event) => update(items.map((value, i) => (i === index ? event.target.value : value)))} error={form.errors[`${name}.${index}`]} maxLength={200} />
          </div>
          <Button variant="secondary" aria-label={`Remove ${label} ${index + 1}`} onClick={() => update(items.filter((_, i) => i !== index))}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>
        </div>
      ))}
      {items.length < max && <Button variant="secondary" size="sm" onClick={() => update([...items, ''])}><Plus aria-hidden="true" className="h-4 w-4" />{addLabel}</Button>}
    </fieldset>
  );
}

/** Image or video chosen from the media library, with a preview, alt text, a remove button and a fallback when it cannot load. */
export function CmsMedia({ form, name, label, hint, type = 'image' }) {
  const value = form.get(name);
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const pick = (media) => {
    form.set(name, { url: media.url, altText: media.altText ?? '', mediaId: media.id });
    setBroken(false);
    setOpen(false);
  };
  return (
    <fieldset className="space-y-3 rounded-lg border border-steel-200 p-4">
      <legend className="px-1 text-base font-semibold">{label}</legend>
      {hint && <p className="text-base text-steel-600">{hint}</p>}
      {value?.url ? (
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex h-32 w-full shrink-0 items-center justify-center overflow-hidden rounded-md bg-steel-100 sm:w-48">
            {broken ? (
              <p className="flex items-center gap-2 p-2 text-base text-steel-600"><ImageOff aria-hidden="true" className="h-5 w-5" />Preview unavailable</p>
            ) : type === 'video' ? (
              <video src={value.url} muted preload="metadata" className="h-full w-full object-cover" onError={() => setBroken(true)} aria-label={`Preview of ${label}`} />
            ) : (
              <img src={value.url} alt={`Preview of ${label}`} className="h-full w-full object-cover" onError={() => setBroken(true)} />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="break-all text-base text-steel-600">{value.url}</p>
            <CmsText form={form} name={`${name}.altText`} label="Alt text" hint="Describe the picture for people who cannot see it. Leave empty only for decoration." maxLength={200} />
          </div>
        </div>
      ) : (
        <p className="text-base text-steel-600">Nothing selected. The website uses its built-in picture.</p>
      )}
      {form.errors[name] && <p className="text-base font-medium text-danger-700">{form.errors[name]}</p>}
      {form.errors[`${name}.url`] && <p className="text-base font-medium text-danger-700">{form.errors[`${name}.url`]}</p>}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>{value?.url ? 'Change' : 'Choose from library'}</Button>
        {value?.url && <Button variant="secondary" size="sm" onClick={() => { form.set(name, null); setBroken(false); }}>Remove</Button>}
      </div>
      <MediaPickerDialog open={open} type={type} onSelect={pick} onClose={() => setOpen(false)} />
    </fieldset>
  );
}

/** Search-engine fields for any record. `name` is the object path ("SEO"). */
export function CmsSeo({ form, name = 'SEO' }) {
  const title = form.get(`${name}.title`) ?? '';
  const description = form.get(`${name}.description`) ?? '';
  return (
    <div className="space-y-4">
      <CmsText form={form} name={`${name}.title`} label="SEO title" hint={`${title.length} characters. About 50 to 60 is a good length.`} maxLength={120} />
      <CmsTextArea form={form} name={`${name}.description`} label="SEO description" rows={3} hint={`${description.length} characters. About 120 to 160 is a good length.`} maxLength={320} />
      <div className="grid gap-4 sm:grid-cols-2">
        <CmsText form={form} name={`${name}.canonicalUrl`} label="Canonical address" hint="Optional. A full https:// address or a path." maxLength={2048} />
        <CmsText form={form} name={`${name}.ogImage`} label="Social sharing image address" hint="Optional. A full https:// address." maxLength={2048} />
      </div>
      <CmsText form={form} name={`${name}.keywords`} label="Keywords" hint="Optional, separated by commas." />
      <CmsToggle form={form} name={`${name}.noIndex`} label="Ask search engines not to list this page" hint="Use only for pages that should stay out of search results." />
    </div>
  );
}

/** A repeatable group of fields (page sections, steps, statistics). Items can be moved with buttons and removed. `render(prefix, index)` draws one item's fields. */
/** `locked` keeps the first N items in place (no moving, removing or reordering past them); `itemTitle(index)` names an item. */
export function CmsRepeater({ form, name, label, addLabel, max = 12, blank, render, locked = 0, itemTitle }) {
  const items = form.get(name) ?? [];
  const update = (next) => form.set(name, next);
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= items.length || index < locked || target < locked) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  };
  return (
    <fieldset className="space-y-4">
      <legend className="text-lg font-bold">{label}</legend>
      {items.length === 0 && <p className="text-base text-steel-600">None added yet.</p>}
      {items.map((_, index) => (
        <div key={index} role="group" aria-label={`${label} ${index + 1}`} className="space-y-4 rounded-lg border border-steel-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-base font-bold">{label} {index + 1}{itemTitle?.(index) ? `: ${itemTitle(index)}` : ''}</p>
            {index >= locked && (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={index === locked} aria-label={`Move ${label} ${index + 1} up`} onClick={() => move(index, -1)}>Up</Button>
                <Button variant="secondary" size="sm" disabled={index === items.length - 1} aria-label={`Move ${label} ${index + 1} down`} onClick={() => move(index, 1)}>Down</Button>
                <Button variant="secondary" size="sm" aria-label={`Remove ${label} ${index + 1}`} onClick={() => update(items.filter((_, i) => i !== index))}>Remove</Button>
              </div>
            )}
          </div>
          {render(`${name}.${index}`, index)}
        </div>
      ))}
      {items.length < max && <Button variant="secondary" size="sm" onClick={() => update([...items, blank()])}><Plus aria-hidden="true" className="h-4 w-4" />{addLabel}</Button>}
    </fieldset>
  );
}
