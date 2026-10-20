import { useEffect, useId, useState } from 'react';
import Button from '../common/Button';
import { FIELD_CLASSES } from '../forms/fieldStyles';

/**
 * Search / Filter / Reset for a list. `fields`: [{ name, label, type: 'search'|'select'|'date', options? }].
 * `values` are the applied (URL) values; edits stay local until "Apply filters". A search shorter than two characters
 * is refused here (the server refuses it too) so the admin gets a clear message instead of an empty or failing list.
 */
export default function AdminFilters({ fields, values, onApply, onReset, label = 'Filter results' }) {
  const formId = useId();
  const [draft, setDraft] = useState(values);
  const [errors, setErrors] = useState({});

  useEffect(() => setDraft(values), [values]);

  const submit = (event) => {
    event.preventDefault();
    const next = {};
    for (const field of fields) {
      const value = String(draft[field.name] ?? '').trim();
      if (field.type === 'search' && value.length === 1) next[field.name] = 'Search needs at least 2 characters.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setTimeout(() => document.getElementById(`${formId}-${Object.keys(next)[0]}`)?.focus(), 0);
      return;
    }
    onApply(Object.fromEntries(fields.map((field) => [field.name, String(draft[field.name] ?? '').trim()])));
  };

  const isFiltered = fields.some((field) => values[field.name]);

  return (
    <form onSubmit={submit} aria-label={label} noValidate className="rounded-lg border border-steel-200 bg-white p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {fields.map((field) => {
          const id = `${formId}-${field.name}`;
          const errorId = `${id}-error`;
          const common = {
            id,
            name: field.name,
            value: draft[field.name] ?? '',
            onChange: (event) => setDraft((current) => ({ ...current, [field.name]: event.target.value })),
            'aria-invalid': errors[field.name] ? 'true' : undefined,
            'aria-describedby': errors[field.name] ? errorId : undefined,
            className: FIELD_CLASSES,
          };
          return (
            <div key={field.name} className="min-w-0">
              <label htmlFor={id} className="block text-base font-semibold">{field.label}</label>
              <div className="mt-1">
                {field.type === 'select' ? (
                  <select {...common}>
                    <option value="">All</option>
                    {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : field.type === 'date' ? (
                  <input type="date" {...common} />
                ) : (
                  <input type="search" autoComplete="off" maxLength={60} {...common} />
                )}
              </div>
              {errors[field.name] && <p id={errorId} className="mt-1 text-base font-medium text-danger-700">{errors[field.name]}</p>}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="submit">Apply filters</Button>
        <Button variant="secondary" onClick={() => { setErrors({}); onReset(); }} disabled={!isFiltered}>Reset</Button>
      </div>
    </form>
  );
}
