import { useId } from 'react';

export default function FormField({ label, hint, error, children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-base font-semibold">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="mt-1 text-base text-steel-600">
          {hint}
        </p>
      )}
      <div className="mt-2">
        {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      </div>
      {error && (
        <p id={errorId} className="mt-2 text-base font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}
