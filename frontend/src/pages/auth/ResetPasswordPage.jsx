import { Link, useSearchParams } from 'react-router-dom';
import Alert from '../../components/common/Alert';
import AuthPageShell from '../../components/layout/AuthPageShell';
import ResetPasswordForm from '../../components/forms/ResetPasswordForm';
import { PATHS } from '../../config/paths';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  return (
    <AuthPageShell
      title="Choose a new password"
      footer={
        <Link to={PATHS.login} className="font-semibold underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Alert>This reset link is incomplete. Request a new link from the sign in page.</Alert>
      )}
    </AuthPageShell>
  );
}
