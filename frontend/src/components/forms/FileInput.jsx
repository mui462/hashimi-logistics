import FormField from './FormField';
import { FIELD_CLASSES } from './fieldStyles';

export default function FileInput({ label, hint, error, files = [], onFilesChange, multiple = false, accept }) {
  return (
    <FormField label={label} hint={hint} error={error}>
      {(fieldProps) => (
        <div>
          <input
            type="file"
            multiple={multiple}
            accept={accept}
            className={`${FIELD_CLASSES} py-2 file:mr-4 file:border-0 file:bg-ink-900 file:px-4 file:py-2 file:font-semibold file:text-white`}
            onChange={(event) => onFilesChange(Array.from(event.target.files || []))}
            {...fieldProps}
          />
          {files.length > 0 && (
            <ul className="mt-2 text-base text-steel-600">
              {files.map((file) => (
                <li key={`${file.name}-${file.size}`}>{file.name}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </FormField>
  );
}
