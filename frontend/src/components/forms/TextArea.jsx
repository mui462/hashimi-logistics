import FormField from './FormField';
import { FIELD_CLASSES } from './fieldStyles';

export default function TextArea({ label, hint, error, rows = 5, ...props }) {
  return (
    <FormField label={label} hint={hint} error={error}>
      {(fieldProps) => <textarea rows={rows} className={`${FIELD_CLASSES} py-3`} {...fieldProps} {...props} />}
    </FormField>
  );
}
