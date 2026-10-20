import { useState } from 'react';
import { useSubmitState } from '../../hooks/useSubmitState';
import { changePassword } from '../../services/customerService';
import { focusFirstInvalid } from '../../utils/focus';
import Alert from '../common/Alert';
import Button from '../common/Button';
import TextInput from './TextInput';

const EMPTY = { currentPassword: '', password: '', passwordConfirmation: '' };

// Strength rules live on the server (the same policy as registration and reset); the client only checks the basics.
export default function ChangePasswordForm({ change = changePassword }) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const submission = useSubmitState();
  const merged = { ...errors, ...submission.fieldErrors };
  const set = (name) => (event) => setValues((current) => ({ ...current, [name]: event.target.value }));

  const onSubmit = async (event) => {
    event.preventDefault();
    const found = {
      currentPassword: values.currentPassword ? '' : 'Enter your current password.',
      password: values.password.length >= 10 ? '' : 'Password must be at least 10 characters.',
      passwordConfirmation: values.passwordConfirmation === values.password ? '' : 'Passwords do not match.',
    };
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      focusFirstInvalid();
      return;
    }
    const ok = await submission.run(() => change(values));
    if (ok) setValues(EMPTY);
    else focusFirstInvalid();
  };

  return (
    <form noValidate aria-label="Change password" onSubmit={onSubmit} className="max-w-xl space-y-6">
      {submission.status === 'error' && <Alert>{submission.error}</Alert>}
      {submission.status === 'success' && <Alert tone="success">{submission.result}</Alert>}
      <TextInput label="Current password" type="password" name="currentPassword" autoComplete="current-password" required value={values.currentPassword} onChange={set('currentPassword')} error={merged.currentPassword} />
      <TextInput label="New password" type="password" name="password" autoComplete="new-password" hint="Use at least 10 characters." required value={values.password} onChange={set('password')} error={merged.password} />
      <TextInput label="Confirm new password" type="password" name="passwordConfirmation" autoComplete="new-password" required value={values.passwordConfirmation} onChange={set('passwordConfirmation')} error={merged.passwordConfirmation} />
      <Button type="submit" size="lg" loading={submission.isSubmitting}>{submission.isSubmitting ? 'Changing…' : 'Change password'}</Button>
    </form>
  );
}
