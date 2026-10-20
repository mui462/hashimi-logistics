import { useState } from 'react';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import ErrorState from '../../components/common/ErrorState';
import LoadingState from '../../components/common/LoadingState';
import PageHeader from '../../components/common/PageHeader';
import { useCarrierProfile } from '../../components/carrier/CarrierProfileContext';
import { safeMessage } from '../../components/customer/AsyncView';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import ChangePasswordForm from '../../components/forms/ChangePasswordForm';
import CarrierProfileForm from '../../components/forms/CarrierProfileForm';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { resendVerification } from '../../services/authService';
import { changePassword } from '../../services/carrierService';
import { formatDate, formatDateTime } from '../../utils/format';

const STATUS_LABELS = { pending: 'Pending review', active: 'Active', approved: 'Approved', inactive: 'Inactive', revoked: 'Revoked', rejected: 'Rejected', expired: 'Expired', suspended: 'Suspended' };
const label = (value) => STATUS_LABELS[value] ?? value;

// These are managed by our team after review, so they are shown but cannot be edited here.
function Authority({ company }) {
  return (
    <div className="space-y-4">
      <DetailList items={[
        { label: 'MC number', value: company.mcNumber },
        { label: 'DOT number', value: company.dotNumber },
        { label: 'Account status', value: label(company.status) },
        { label: 'Operating authority', value: label(company.authorityStatus) },
        { label: 'Compliance', value: label(company.complianceStatus) },
      ]} />
      <p className="text-base text-steel-600">Authority numbers and review status are managed by our team. Contact us if any of these look wrong.</p>
    </div>
  );
}

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
  const { profile, error, isLoading, reload, setProfile } = useCarrierProfile();

  return (
    <div className="space-y-8">
      <PageHeader title="My profile" description="Your account and company details." />
      {!profile && isLoading && <LoadingState label="Loading your profile" />}
      {!profile && error && <ErrorState title="We could not load your profile" message={safeMessage(error)} onRetry={reload} />}
      {profile && (
        <>
          <Panel title="Sign-in &amp; account"><EmailStatus account={profile.account} /></Panel>
          <Panel title="Authority &amp; compliance"><Authority company={profile.company} /></Panel>
          <Panel title="Edit profile"><CarrierProfileForm profile={profile} onSaved={setProfile} /></Panel>
          <Panel title="Change password"><ChangePasswordForm change={changePassword} /></Panel>
        </>
      )}
    </div>
  );
}
