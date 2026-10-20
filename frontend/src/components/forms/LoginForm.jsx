import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useApiForm } from '../../hooks/useApiForm';
import { PATHS } from '../../config/paths';
import Alert from '../common/Alert';
import Button from '../common/Button';
import GoogleAuthButton from './GoogleAuthButton';
import TextInput from './TextInput';

const PORTAL_LABELS = { customer: 'Customer', carrier: 'Carrier' };

/**
 * `portal` (customer or carrier) comes from the sign-in page the person chose. It only narrows which accounts may sign in
 * here and which Google flow is offered; the server decides the real role and the dashboard follows from that.
 */
export default function LoginForm({ isAdmin = false, portal }) {
  const { login, adminLogin, googleLogin } = useAuth();
  const [googleState, setGoogleState] = useState({ busy: false, error: '', code: null });
  const { values, fieldErrors, formError, isSubmitting, handleChange, handleSubmit } = useApiForm(
    { email: '', password: '' },
    isAdmin ? adminLogin : (credentials) => login(portal ? { ...credentials, portal } : credentials)
  );

  const onGoogle = async (credential) => {
    setGoogleState({ busy: true, error: '', code: null });
    try {
      await googleLogin({ credential, portal });
    } catch (error) {
      setGoogleState({ busy: false, error: error.message, code: error.code ?? null });
    }
  };

  const registerPath = `${PATHS.register}?type=${portal}`;
  const busy = isSubmitting || googleState.busy;

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6" noValidate aria-busy={busy || undefined}>
        {formError && (
          <Alert>
            {formError}
            {portal && formError === 'Invalid email or password.' && (
              <span className="mt-1 block text-base">Make sure you are using the {PORTAL_LABELS[portal]} Login that matches your account.</span>
            )}
          </Alert>
        )}

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
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={values.password}
          onChange={handleChange}
          error={fieldErrors.password}
        />

        <Button type="submit" size="lg" loading={isSubmitting} disabled={googleState.busy} className="w-full">
          Sign in
        </Button>

        {!isAdmin && (
          <p className="text-base">
            <Link to={PATHS.forgotPassword} className="font-semibold underline underline-offset-4">
              Forgot your password?
            </Link>
          </p>
        )}
      </form>

      {portal && !isAdmin && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 text-sm font-semibold uppercase tracking-wide text-steel-600" role="separator" aria-label="or">
            <span className="h-px flex-1 bg-steel-200" />
            Or
            <span className="h-px flex-1 bg-steel-200" />
          </div>
          {googleState.error && (
            <Alert>
              {googleState.error}
              {googleState.code === 'ACCOUNT_NOT_FOUND' && (
                <Link to={registerPath} className="mt-1 block font-semibold underline underline-offset-4">
                  {portal === 'carrier' ? 'Register as a Carrier' : 'Create a Customer Account'}
                </Link>
              )}
            </Alert>
          )}
          <GoogleAuthButton onCredential={onGoogle} busy={busy} />
        </div>
      )}
    </div>
  );
}
