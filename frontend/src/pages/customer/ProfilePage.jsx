import { useState } from 'react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import ErrorState from '../../components/common/ErrorState';
import LoadingState from '../../components/common/LoadingState';
import PageHeader from '../../components/common/PageHeader';
import { safeMessage } from '../../components/customer/AsyncView';
import { useCustomerProfile } from '../../components/customer/CustomerProfileContext';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import ChangePasswordForm from '../../components/forms/ChangePasswordForm';
import CustomerProfileForm from '../../components/forms/CustomerProfileForm';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { resendVerification } from '../../services/authService';
import { formatDate, formatDateTime } from '../../utils/format';

function EmailStatus({ account }) {
  const [state, setState] = useState({ pending: false, message: '', error: '' });
  const resend = async () => {
    setState({ pending: true, message: '', error: '' });
    try {
      setState({ pending: false, message: await resendVerification(), error: '' });
    } catch (error) {
      setState({ pending: false, message: '', error: safeMessage(error) });
    }
  };
  return (
    <div className="space-y-4">
      <DetailList items={[
        { label: 'Sign-in email', value: account.email },
        { label: 'Email status', value: account.isEmailVerified ? 'Confirmed' : 'Not confirmed yet' },
        { label: 'Member since', value: formatDate(account.memberSince) },
        { label: 'Last sign-in', value: formatDateTime(account.lastLogin) },
      ]} />
      <p className="text-base text-steel-600">Your sign-in email can’t be changed here. Contact our team if you need to use a different address.</p>
      {!account.isEmailVerified && (
        <div className="space-y-3">
          <Button variant="secondary" loading={state.pending} onClick={resend}>Resend confirmation email</Button>
          {state.message && <Alert tone="success">{state.message}</Alert>}
          {state.error && <Alert>{state.error}</Alert>}
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  useDocumentTitle('My profile');
  const { profile, error, isLoading, reload, setProfile } = useCustomerProfile();

  return (
    <div className="space-y-8">
      <PageHeader title="My profile" description="Your account, company and billing contact details." />
      {!profile && isLoading && <LoadingState label="Loading your profile" />}
      {!profile && error && <ErrorState title="We could not load your profile" message={safeMessage(error)} onRetry={reload} />}
      {profile && (
        <>
          <Panel title="Sign-in &amp; account"><EmailStatus account={profile.account} /></Panel>
          <Panel title="Edit profile"><CustomerProfileForm profile={profile} onSaved={setProfile} /></Panel>
          <Panel title="Change password"><ChangePasswordForm /></Panel>
        </>
      )}
    </div>
  );
}
