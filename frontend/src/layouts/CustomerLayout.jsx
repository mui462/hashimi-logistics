import { CustomerProfileProvider, useCustomerProfile } from '../components/customer/CustomerProfileContext';
import { CustomerNotices } from '../components/layout/AccountNotices';
import PortalLayout from '../components/layout/PortalLayout';
import { PATHS } from '../config/paths';
import { useAuth } from '../hooks/useAuth';
import { customerNavGroups } from '../routes/definitions/customerRoutes';

function CustomerShell() {
  const { user } = useAuth();
  const { profile } = useCustomerProfile();
  const name = profile ? `${profile.account.firstName} ${profile.account.lastName}` : user?.fullName;
  const company = profile?.company.companyName;

  return (
    <PortalLayout
      portalName="Customer portal"
      navGroups={customerNavGroups}
      homePath={PATHS.customer}
      displayName={company ? `${company} · ${name}` : name}
      account={{ name, company }}
      notice={<CustomerNotices isEmailVerified={profile?.account.isEmailVerified} profilePath={`${PATHS.customer}/profile`} />}
    />
  );
}

export default function CustomerLayout() {
  return (
    <CustomerProfileProvider>
      <CustomerShell />
    </CustomerProfileProvider>
  );
}
