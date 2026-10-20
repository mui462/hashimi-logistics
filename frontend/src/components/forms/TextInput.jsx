import FormField from './FormField';
import { FIELD_CLASSES } from './fieldStyles';

export default function TextInput({ label, hint, error, type = 'text', ...inputProps }) {
  return (
    <FormField label={label} hint={hint} error={error}>
      {(fieldProps) => <input type={type} className={FIELD_CLASSES} {...fieldProps} {...inputProps} />}
    </FormField>
  );
}
