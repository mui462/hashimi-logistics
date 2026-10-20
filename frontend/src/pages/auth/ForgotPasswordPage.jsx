import { Link } from 'react-router-dom';
import AuthPageShell from '../../components/layout/AuthPageShell';
import ForgotPasswordForm from '../../components/forms/ForgotPasswordForm';
import { PATHS } from '../../config/paths';

export default function ForgotPasswordPage() {
  return (
    <AuthPageShell
      title="Reset your password"
      description="Enter the email address on your account."
      footer={
        <Link to={PATHS.login} className="font-semibold underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthPageShell>
  );
}
