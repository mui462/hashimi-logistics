import { CarrierProfileProvider, useCarrierProfile } from '../components/carrier/CarrierProfileContext';
import { CarrierNotices } from '../components/layout/AccountNotices';
import PortalLayout from '../components/layout/PortalLayout';
import { PATHS } from '../config/paths';
import { useAuth } from '../hooks/useAuth';
import { carrierNavGroups } from '../routes/definitions/carrierRoutes';

function CarrierShell() {
  const { user } = useAuth();
  const { profile } = useCarrierProfile();
  const name = profile ? `${profile.account.firstName} ${profile.account.lastName}` : user?.fullName;
  const company = profile?.company.companyName;

  return (
    <PortalLayout
      portalName="Carrier portal"
      navGroups={carrierNavGroups}
      homePath={PATHS.carrier}
      displayName={company ? `${company} · ${name}` : name}
      account={{ name, company }}
      notice={<CarrierNotices profilePath={`${PATHS.carrier}/profile`} />}
    />
  );
}

export default function CarrierLayout() {
  return (
    <CarrierProfileProvider>
      <CarrierShell />
    </CarrierProfileProvider>
  );
}
