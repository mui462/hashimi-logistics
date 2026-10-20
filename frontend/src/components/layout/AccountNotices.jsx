import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, MailWarning, ShieldAlert } from 'lucide-react';
import Button from '../common/Button';
import { resendVerification } from '../../services/authService';
import { getAccountStatus } from '../../services/carrierService';
import { cx } from '../../utils/cx';

const TONES = {
  info: 'border-signal-400 bg-white text-ink-900 shadow-sm',
  danger: 'border-danger-700 bg-danger-50 text-danger-700',
};

function Notice({ tone = 'info', Icon, title, children, action }) {
  return (
    <section role="status" aria-label={title} className={cx('mb-6 flex flex-wrap items-start gap-3 rounded-md border-l-4 p-4 text-base', TONES[tone])}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">{title}</p>
        <div className="mt-1 font-medium">{children}</div>
      </div>
      {action}
    </section>
  );
}

/** Offers the existing resend-confirmation call; the answer comes from the server (email delivery may not be configured). */
function EmailVerificationNotice({ profilePath, lockedFeatures }) {
  const [state, setState] = useState({ busy: false, message: '', error: false });
  const resend = async () => {
    setState({ busy: true, message: '', error: false });
    try {
      setState({ busy: false, message: await resendVerification(), error: false });
    } catch (error) {
      setState({ busy: false, message: error.message, error: true });
    }
  };
  return (
    <Notice
      Icon={MailWarning}
      title="Email verification required"
      action={<Button variant="secondary" size="sm" loading={state.busy} onClick={resend}>Resend confirmation email</Button>}
    >
      <p>{lockedFeatures} Open the confirmation link we emailed you to unlock it. You can also see your status on your <Link to={profilePath} className="font-semibold underline underline-offset-4">profile</Link>.</p>
      {state.message && <p role={state.error ? 'alert' : 'status'} className="mt-2">{state.message}</p>}
    </Notice>
  );
}

/** Shown above every customer page until the email address is confirmed. */
export function CustomerNotices({ isEmailVerified, profilePath }) {
  if (isEmailVerified !== false) return null;
  return <EmailVerificationNotice profilePath={profilePath} lockedFeatures="Requesting and accepting quotes is locked until your email address is confirmed." />;
}

const CARRIER_TEXT = {
  pending: { tone: 'info', Icon: Clock, title: 'Pending approval', body: 'Your carrier account is waiting for approval by our team. You can complete your profile and see your documents now. Available loads unlock once your authority and compliance are approved.' },
  rejected: { tone: 'danger', Icon: ShieldAlert, title: 'Not approved', body: 'Your carrier application was not approved, so available loads stay locked. Please contact support if you have updated information or believe this is a mistake.' },
  suspended: { tone: 'danger', Icon: ShieldAlert, title: 'Account suspended', body: 'Your carrier account is suspended and portal data is unavailable. Please contact support.' },
  deactivated: { tone: 'danger', Icon: ShieldAlert, title: 'Account deactivated', body: 'Your carrier account is not active and portal data is unavailable. Please contact support.' },
};

/** Shown above every carrier page: the real approval state (read from the server), and the email notice when it applies. */
export function CarrierNotices({ profilePath }) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let current = true;
    getAccountStatus().then((data) => current && setStatus(data)).catch(() => {});
    return () => {
      current = false;
    };
  }, []);
  if (!status) return null;
  const copy = CARRIER_TEXT[status.approvalStatus];
  return (
    <>
      {copy && <Notice tone={copy.tone} Icon={copy.Icon} title={copy.title}>{copy.body}</Notice>}
      {status.isEmailVerified === false && <EmailVerificationNotice profilePath={profilePath} lockedFeatures="Please confirm your email address to keep your account in good standing." />}
    </>
  );
}
