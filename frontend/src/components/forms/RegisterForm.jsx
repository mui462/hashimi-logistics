import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useApiForm } from '../../hooks/useApiForm';
import { ACCOUNT_TYPES } from '../../config/constants';
import Alert from '../common/Alert';
import Button from '../common/Button';
import GoogleAuthButton from './GoogleAuthButton';
import SelectInput from './SelectInput';
import TextInput from './TextInput';

const ACCOUNT_TYPE_OPTIONS = [
  { value: ACCOUNT_TYPES.CUSTOMER, label: 'Customer: I ship freight' },
  { value: ACCOUNT_TYPES.CARRIER, label: 'Carrier: I haul freight' },
];

function toRegistrationPayload({ phone, ...values }) {
  const trimmedPhone = phone.trim();
  return trimmedPhone ? { ...values, phone: trimmedPhone } : values;
}

// Only the two self-service types can be chosen; anything else in the address falls back to customer.
const startingType = (type) => (type === ACCOUNT_TYPES.CARRIER ? ACCOUNT_TYPES.CARRIER : ACCOUNT_TYPES.CUSTOMER);

// `lockType` (set when the page was opened for one portal) hides the type chooser so the form can only create that account type.
export default function RegisterForm({ initialType, lockType = false }) {
  const { register, googleRegister } = useAuth();
  const [googleState, setGoogleState] = useState({ busy: false, error: '' });
  const { values, fieldErrors, formError, isSubmitting, handleChange, handleSubmit } = useApiForm(
    {
      accountType: startingType(initialType),
      firstName: '',
      lastName: '',
      companyName: '',
      email: '',
      phone: '',
      password: '',
      passwordConfirmation: '',
    },
    (formValues) => register(toRegistrationPayload(formValues))
  );

  // Google supplies the name and email; the company name and account type come from this form. The server checks the token.
  const companyReady = values.companyName.trim().length > 0;
  const onGoogle = async (credential) => {
    setGoogleState({ busy: true, error: '' });
    try {
      const phone = values.phone.trim();
      await googleRegister({ accountType: values.accountType, credential, companyName: values.companyName.trim(), ...(phone ? { phone } : {}) });
    } catch (error) {
      setGoogleState({ busy: false, error: error.message });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate aria-busy={isSubmitting || googleState.busy || undefined}>
      {formError && <Alert>{formError}</Alert>}

      {lockType ? (
        <p className="rounded-md border border-steel-200 bg-steel-50 px-4 py-3 text-base font-semibold">
          {values.accountType === ACCOUNT_TYPES.CARRIER ? 'Carrier account: I haul freight' : 'Customer account: I ship freight'}
        </p>
      ) : (
        <SelectInput
          label="Account type"
          name="accountType"
          options={ACCOUNT_TYPE_OPTIONS}
          value={values.accountType}
          onChange={handleChange}
          error={fieldErrors.accountType}
        />
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <TextInput
          label="First name"
          name="firstName"
          autoComplete="given-name"
          required
          value={values.firstName}
          onChange={handleChange}
          error={fieldErrors.firstName}
        />
        <TextInput
          label="Last name"
          name="lastName"
          autoComplete="family-name"
          required
          value={values.lastName}
          onChange={handleChange}
          error={fieldErrors.lastName}
        />
      </div>

      <TextInput
        label="Company name"
        name="companyName"
        autoComplete="organization"
        required
        value={values.companyName}
        onChange={handleChange}
        error={fieldErrors.companyName}
      />
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
      <TextInput
        label="Phone number (optional)"
        name="phone"
        type="tel"
        autoComplete="tel"
        value={values.phone}
        onChange={handleChange}
        error={fieldErrors.phone}
      />
      <TextInput
        label="Password"
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
        label="Confirm password"
        name="passwordConfirmation"
        type="password"
        autoComplete="new-password"
        required
        value={values.passwordConfirmation}
        onChange={handleChange}
        error={fieldErrors.passwordConfirmation}
      />

      <Button type="submit" size="lg" loading={isSubmitting} disabled={googleState.busy} className="w-full">
        Create account
      </Button>

      <div className="space-y-4">
        <div className="flex items-center gap-4 text-sm font-semibold uppercase tracking-wide text-steel-600" role="separator" aria-label="or">
          <span className="h-px flex-1 bg-steel-200" />
          Or
          <span className="h-px flex-1 bg-steel-200" />
        </div>
        {googleState.error && <Alert>{googleState.error}</Alert>}
        {companyReady ? (
          <GoogleAuthButton text="signup_with" label="Sign up with Google" onCredential={onGoogle} busy={googleState.busy || isSubmitting} />
        ) : (
          <p className="text-base text-steel-600">Enter your company name above to sign up with Google instead of a password.</p>
        )}
      </div>
    </form>
  );
}
