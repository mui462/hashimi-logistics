import { useState } from 'react';
import AuthPageShell from '../layout/AuthPageShell';
import Alert from '../common/Alert';
import Button from '../common/Button';
import { ACCOUNT_TYPE_LABELS } from '../../config/constants';
import { ROLE_HOME_PATHS } from '../../config/paths';
import { useAuth } from '../../hooks/useAuth';

/**
 * Shown on a sign-in or register page when this browser is already signed in as a different kind of account (for example the
 * Super Admin opens the Customer sign-in). A browser holds one session, so instead of silently sending the person to the other
 * dashboard they choose: keep the current account, or sign out and continue to the page they asked for.
 */
export default function SignedInElsewhere({ wantedLabel }) {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = ACCOUNT_TYPE_LABELS[user.role] ?? 'another account';

  const switchAccount = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await logout();
    } catch {
      setError('We could not sign you out. Please try again.');
      setBusy(false);
    }
  };

  return (
    <AuthPageShell
      title="You are already signed in"
      description={`This browser is signed in as ${current}. To use the ${wantedLabel} page, sign out first. A browser keeps one account at a time, so use a private window if you need both open together.`}
    >
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Button onClick={switchAccount} disabled={busy} size="lg">{busy ? 'Signing out…' : `Sign out and continue to ${wantedLabel}`}</Button>
          <Button to={ROLE_HOME_PATHS[user.role]} variant="secondary" size="lg">Stay signed in as {current}</Button>
        </div>
      </div>
    </AuthPageShell>
  );
}
