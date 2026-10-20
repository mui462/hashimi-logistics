import FormField from './FormField';
import { FIELD_CLASSES } from './fieldStyles';

export default function SelectInput({ label, hint, error, options, placeholder, ...selectProps }) {
  return (
    <FormField label={label} hint={hint} error={error}>
      {(fieldProps) => (
        <select className={FIELD_CLASSES} {...fieldProps} {...selectProps}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}
