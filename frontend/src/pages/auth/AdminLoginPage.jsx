import AuthPageShell from '../../components/layout/AuthPageShell';
import LoginForm from '../../components/forms/LoginForm';

export default function AdminLoginPage() {
  return (
    <AuthPageShell title="Super Admin sign in" description="This sign in is for the platform administrator only.">
      <LoginForm isAdmin />
    </AuthPageShell>
  );
}
