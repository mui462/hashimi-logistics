import { useState } from 'react';
import { resetPassword } from '../../services/authService';
import { useApiForm } from '../../hooks/useApiForm';
import Alert from '../common/Alert';
import Button from '../common/Button';
import TextInput from './TextInput';

export default function ResetPasswordForm({ token }) {
  const [successMessage, setSuccessMessage] = useState('');
  const { values, fieldErrors, formError, isSubmitting, handleChange, handleSubmit } = useApiForm(
    { password: '', passwordConfirmation: '' },
    async ({ password, passwordConfirmation }) =>
      setSuccessMessage(await resetPassword({ token, password, passwordConfirmation }))
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {formError && <Alert>{formError}</Alert>}
      {successMessage && <Alert tone="success">{successMessage}</Alert>}
      {fieldErrors.token && <Alert>{fieldErrors.token}</Alert>}

      <TextInput
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Use at least 10 characters."
        required
        value={values.password}
        onChange={handleChange}
        error={fieldErrors.password}
      />
      <TextInput
        label="Confirm new password"
        name="passwordConfirmation"
        type="password"
        autoComplete="new-password"
        required
        value={values.passwordConfirmation}
        onChange={handleChange}
        error={fieldErrors.passwordConfirmation}
      />

      <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
        Set new password
      </Button>
    </form>
  );
}
