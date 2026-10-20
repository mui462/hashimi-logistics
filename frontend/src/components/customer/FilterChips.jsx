import { cx } from '../../utils/cx';

// A row of toggle buttons for filtering a list. aria-pressed marks the active filter.
export default function FilterChips({ label, options, value, onChange }) {
  const all = [{ value: '', label: 'All' }, ...options];
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {all.map((option) => (
        <button
          key={option.value || 'all'}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            'min-h-11 rounded-full border-2 px-4 text-base font-semibold transition-colors',
            value === option.value ? 'border-ink-900 bg-ink-900 text-white' : 'border-steel-300 bg-white text-ink-900 hover:bg-steel-50'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
