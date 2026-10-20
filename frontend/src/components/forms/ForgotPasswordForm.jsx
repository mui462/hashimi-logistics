import { useState } from 'react';
import { requestPasswordReset } from '../../services/authService';
import { useApiForm } from '../../hooks/useApiForm';
import Alert from '../common/Alert';
import Button from '../common/Button';
import TextInput from './TextInput';

export default function ForgotPasswordForm() {
  const [successMessage, setSuccessMessage] = useState('');
  const { values, fieldErrors, formError, isSubmitting, handleChange, handleSubmit } = useApiForm(
    { email: '' },
    async ({ email }) => setSuccessMessage(await requestPasswordReset(email))
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {formError && <Alert>{formError}</Alert>}
      {successMessage && <Alert tone="success">{successMessage}</Alert>}

      <TextInput
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        required
        value={values.email}
        onChange={handleChange}
        error={fieldErrors.email}
      />

      <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
        Send reset link
      </Button>
    </form>
  );
}
