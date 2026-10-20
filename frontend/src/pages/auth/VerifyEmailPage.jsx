import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import AuthPageShell from '../../components/layout/AuthPageShell';
import { PATHS } from '../../config/paths';
import { useAuth } from '../../hooks/useAuth';
import { resendVerification, verifyEmail } from '../../services/authService';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { isAuthenticated } = useAuth();
  const [outcome, setOutcome] = useState(null);
  const [isWorking, setIsWorking] = useState(false);

  // The link only fills in the token. Confirming needs a click, so mail scanners that open links
  // cannot use up the one-time token before the person does.
  const run = async (action) => {
    setIsWorking(true);
    try {
      setOutcome({ tone: 'success', message: await action() });
    } catch (error) {
      setOutcome({ tone: 'error', message: error.message });
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <AuthPageShell
      title="Confirm your email address"
      footer={
        <Link to={PATHS.login} className="font-semibold underline underline-offset-4">
          Continue to sign in
        </Link>
      }
    >
      <div className="space-y-6">
        {outcome && <Alert tone={outcome.tone}>{outcome.message}</Alert>}

        {token ? (
          <Button size="lg" loading={isWorking} className="w-full" onClick={() => run(() => verifyEmail(token))}>
            Confirm email address
          </Button>
        ) : (
          <Alert>This confirmation link is incomplete.</Alert>
        )}

        {isAuthenticated && (
          <Button variant="secondary" loading={isWorking} className="w-full" onClick={() => run(resendVerification)}>
            Send me a new confirmation email
          </Button>
        )}
      </div>
    </AuthPageShell>
  );
}
