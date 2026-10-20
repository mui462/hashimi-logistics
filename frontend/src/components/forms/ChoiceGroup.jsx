import { useId } from 'react';
import { cx } from '../../utils/cx';

// Accessible fieldset of radio buttons or checkboxes rendered as selectable tiles.
// `value` is a string (radio) or array of strings (checkbox).
export default function ChoiceGroup({ legend, hint, error, name, type = 'radio', options, value, onChange, columns = 2 }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const selected = Array.isArray(value) ? value : [value];
  const cols = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3' }[columns];

  const handle = (optionValue) => {
    if (type === 'radio') onChange(optionValue);
    else onChange(selected.includes(optionValue) ? selected.filter((v) => v !== optionValue) : [...selected, optionValue]);
  };

  return (
    <fieldset aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined} data-invalid={error ? 'true' : undefined}>
      <legend className="text-base font-semibold">{legend}</legend>
      {hint && <p id={hintId} className="mt-1 text-base text-steel-600">{hint}</p>}
      <div className={cx('mt-3 grid gap-3', cols)}>
        {options.map((option) => {
          const checked = selected.includes(option.value);
          const optionId = `${id}-${option.value}`;
          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className={cx(
                'flex min-h-12 cursor-pointer items-center gap-3 border px-4 py-2 text-base has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                checked ? 'border-ink-900 bg-steel-50 font-semibold' : 'border-steel-500 bg-white'
              )}
            >
              <input
                id={optionId}
                type={type}
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => handle(option.value)}
                className="size-5 shrink-0 accent-ink-900"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {error && <p id={errorId} className="mt-2 text-base font-medium text-danger-700">{error}</p>}
    </fieldset>
  );
}
