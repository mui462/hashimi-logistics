import { HEX_COLOR } from '../../../config/navbarAppearance';
import { cx } from '../../../utils/cx';

/**
 * Appearance editor fields shared by Website CMS -> Navbar appearance and Website theme: a colour picker with an editable
 * #RRGGBB box, a labelled slider that shows its value, and a switch with a hint.
 */

export function ColorField({ id, label, value, error, onChange }) {
  const hexId = `${id}-hex`;
  const errorId = `${id}-error`;
  const pickerValue = HEX_COLOR.test(value) ? value.toLowerCase() : '#000000';
  return (
    <div>
      <label htmlFor={hexId} className="block text-base font-semibold">{label}</label>
      <div className="mt-2 flex items-center gap-3">
        <input type="color" aria-label={`${label} picker`} value={pickerValue} onChange={(event) => onChange(event.target.value.toUpperCase())} className="h-11 w-14 shrink-0 cursor-pointer rounded-md border border-steel-300 bg-white p-1" />
        <input
          id={hexId}
          type="text"
          inputMode="text"
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          value={value}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.target.value.trim().toUpperCase())}
          className={cx('min-h-11 w-32 rounded-md border px-3 font-mono text-base uppercase', error ? 'border-danger-700' : 'border-steel-300')}
        />
      </div>
      {error && <p id={errorId} className="mt-1 text-base text-danger-700">{error}</p>}
    </div>
  );
}

export function RangeField({ id, label, value, field, unit, hint, error, onChange }) {
  const hintId = `${id}-hint`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-base font-semibold">{label}</label>
        <output htmlFor={id} className="font-mono text-base tabular-nums">{value}{unit}</output>
      </div>
      <input id={id} type="range" min={field.min} max={field.max} step={1} value={value} aria-describedby={hint ? hintId : undefined} aria-valuetext={`${value}${unit}`} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-ink-900" />
      {hint && <p id={hintId} className="mt-1 text-base text-steel-600">{hint}</p>}
      {error && <p className="mt-1 text-base text-danger-700">{error}</p>}
    </div>
  );
}

export function ToggleField({ id, label, hint, checked, onChange }) {
  const hintId = `${id}-hint`;
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" checked={checked} aria-describedby={hint ? hintId : undefined} onChange={(event) => onChange(event.target.checked)} className="mt-1 size-5 shrink-0 accent-ink-900" />
      <div>
        <label htmlFor={id} className="text-base font-semibold">{label}</label>
        {hint && <p id={hintId} className="text-base text-steel-600">{hint}</p>}
      </div>
    </div>
  );
}

/** A small set of named presets as radio buttons (no free-form values). */
export function ChoiceField({ id, label, hint, value, options, onChange }) {
  const hintId = `${id}-hint`;
  return (
    <fieldset aria-describedby={hint ? hintId : undefined}>
      <legend className="text-base font-semibold">{label}</legend>
      {hint && <p id={hintId} className="text-base text-steel-600">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value} className={cx('inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-base', value === option.value ? 'border-ink-900 bg-steel-50 font-semibold' : 'border-steel-300')}>
            <input type="radio" name={id} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="size-4 accent-ink-900" />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
