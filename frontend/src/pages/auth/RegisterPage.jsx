import { Link, useSearchParams } from 'react-router-dom';
import AuthPageShell from '../../components/layout/AuthPageShell';
import RegisterForm from '../../components/forms/RegisterForm';
import { PATHS } from '../../config/paths';

const TITLES = { carrier: 'Register as a Carrier', customer: 'Create a Customer Account' };

export default function RegisterPage() {
  const [params] = useSearchParams();
  const type = Object.hasOwn(TITLES, params.get('type')) ? params.get('type') : null;

  return (
    <AuthPageShell
      title={type ? TITLES[type] : 'Create your account'}
      description={
        type === 'carrier'
          ? 'New carrier accounts are reviewed and approved before they get load access.'
          : 'Choose the account type that matches how you work with us.'
      }
      footer={
        <p>
          Already have an account?{' '}
          <Link to={type ? `${PATHS.login}?portal=${type}` : PATHS.login} className="font-semibold underline underline-offset-4">
            Sign In
          </Link>
        </p>
      }
    >
      <RegisterForm initialType={type} lockType={Boolean(type)} />
    </AuthPageShell>
  );
}
