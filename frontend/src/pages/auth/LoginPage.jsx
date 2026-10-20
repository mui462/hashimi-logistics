import { Link, useSearchParams } from 'react-router-dom';
import AuthPageShell from '../../components/layout/AuthPageShell';
import LoginForm from '../../components/forms/LoginForm';
import { PATHS } from '../../config/paths';

const PORTALS = {
  carrier: {
    title: 'Carrier sign in',
    description: 'Carriers sign in here to reach the Carrier Dashboard.',
    register: 'Register as a Carrier',
    registerPrompt: 'Register as a Carrier',
    entryTitle: 'Carrier access',
    entryDescription: 'New to HASHIMI LOGISTICS INC.? Register your carrier company. Already registered? Sign in.',
    signIn: 'Carrier Sign In',
    other: { label: 'Customer Login', portal: 'customer', question: 'Shipping freight instead?' },
  },
  customer: {
    title: 'Customer sign in',
    description: 'Customers sign in here to reach the Customer Dashboard.',
    register: 'Create a Customer Account',
    registerPrompt: 'Register as a Customer',
    entryTitle: 'Customer access',
    entryDescription: 'New to HASHIMI LOGISTICS INC.? Create your customer account. Already have one? Sign in.',
    signIn: 'Sign In to Your Account',
    other: { label: 'Carrier Login', portal: 'carrier', question: 'Hauling freight instead?' },
  },
};

// The portal in the address only selects the wording and which accounts this page accepts. It is never proof of a role:
// the server checks the account's own role at sign-in, and every dashboard route and API checks it again.
export default function LoginPage() {
  const [params] = useSearchParams();
  const portal = Object.hasOwn(PORTALS, params.get('portal')) ? params.get('portal') : null;
  const copy = portal ? PORTALS[portal] : null;
  // The navbar opens ?portal=...&step=choose. Without step=choose the sign-in form opens directly, so existing links keep working.
  const isEntry = Boolean(portal) && params.get('step') === 'choose';

  return (
    <AuthPageShell
      title={isEntry ? copy.entryTitle : copy?.title ?? 'Sign in'}
      description={isEntry ? copy.entryDescription : copy?.description ?? 'Choose the portal that matches your account.'}
      footer={
        <div className="space-y-3">
        {copy ? (
          <div className="space-y-3">
            {!isEntry && (
              <p>
                Don&apos;t have an account?{' '}
                <Link to={`${PATHS.register}?type=${portal}`} className="font-semibold underline underline-offset-4">
                  {copy.registerPrompt}
                </Link>
              </p>
            )}
            <p>
              {copy.other.question}{' '}
              <Link to={`${PATHS.login}?portal=${copy.other.portal}`} className="font-semibold underline underline-offset-4">
                {copy.other.label}
              </Link>
            </p>
          </div>
        ) : (
          <p>
            New to HASHIMI LOGISTICS INC.?{' '}
            <Link to={PATHS.register} className="font-semibold underline underline-offset-4">
              Create an account
            </Link>
          </p>
        )}
        <p className="text-sm text-steel-600">
          Website staff?{' '}
          <Link to={PATHS.adminLogin} className="font-semibold underline underline-offset-4">
            Super Admin sign in
          </Link>
        </p>
        </div>
      }
    >
      {isEntry ? (
        <div className="grid gap-4">
          <Link
            to={`${PATHS.register}?type=${portal}`}
            className="inline-flex min-h-14 items-center justify-center rounded-md border-2 border-[#D8AD54] bg-[#D8AD54] px-6 text-lg font-bold text-ink-900 transition-colors hover:bg-[#E6C27A] active:translate-y-px"
          >
            {copy.register}
          </Link>
          <Link
            to={`${PATHS.login}?portal=${portal}`}
            className="inline-flex min-h-14 items-center justify-center rounded-md border-2 border-ink-900 px-6 text-lg font-semibold transition-colors hover:bg-steel-50 active:translate-y-px"
          >
            {copy.signIn}
          </Link>
        </div>
      ) : portal ? (
        <LoginForm portal={portal} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <Link to={`${PATHS.login}?portal=customer`} className="inline-flex min-h-12 items-center justify-center rounded-md border-2 border-ink-900 px-6 text-lg font-semibold hover:bg-steel-50">
              Customer Login
            </Link>
            <Link to={`${PATHS.login}?portal=carrier`} className="inline-flex min-h-12 items-center justify-center rounded-md border-2 border-ink-900 px-6 text-lg font-semibold hover:bg-steel-50">
              Carrier Login
            </Link>
          </div>
          <LoginForm />
        </div>
      )}
    </AuthPageShell>
  );
}
