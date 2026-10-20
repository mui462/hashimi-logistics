import { useCallback } from 'react';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminPage from '../../components/admin/AdminPage';
import AdminStatusBadge from '../../components/admin/AdminStatusBadge';
import DetailList from '../../components/customer/DetailList';
import Panel from '../../components/customer/Panel';
import StatCard from '../../components/customer/StatCard';
import { humanize } from '../../config/adminStatuses';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getSecurity } from '../../services/adminService';
import { formatDateTime } from '../../utils/format';

export default function SecurityPage() {
  const state = useAsyncData(useCallback(() => getSecurity(), []));
  return (
    <AdminPage title="Security" description="What the system actually records about sign-ins and sessions. Anything it does not track is labelled unavailable.">
      <AdminAsyncView state={state} label="Loading security information" errorTitle="We could not load security information">
        {(s) => (
          <div className="space-y-6">
            <p className="text-base text-steel-600">As of {formatDateTime(s.generatedAt)}.</p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Failed sign-ins, 24 hours" value={s.authEvents.failedSignIns.last24Hours} />
              <StatCard label="Failed sign-ins, 7 days" value={s.authEvents.failedSignIns.last7Days} />
              <StatCard label="Successful sign-ins, 24 hours" value={s.authEvents.successfulSignIns.last24Hours} />
              <StatCard label="Successful sign-ins, 7 days" value={s.authEvents.successfulSignIns.last7Days} />
              <StatCard label="Password resets, 7 days" value={s.authEvents.passwordResetsCompleted.last7Days} />
              <StatCard label="Password changes, 7 days" value={s.authEvents.passwordsChanged.last7Days} />
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <Panel title="Your account">
                <DetailList items={[
                  { label: 'Name', value: s.account.name },
                  { label: 'Email', value: s.account.email },
                  { label: 'Role', value: humanize(s.account.role) },
                  { label: 'Email confirmed', value: s.account.isEmailVerified ? 'Yes' : 'No' },
                  { label: 'Last sign-in', value: formatDateTime(s.account.lastLogin) },
                  { label: 'Super Admin accounts', value: s.account.superAdminAccounts },
                ]} />
              </Panel>
              <Panel title="Session settings">
                <DetailList items={[
                  { label: 'Session lifetime', value: s.session.lifetime },
                  { label: 'Stored in', value: s.session.storage, wide: true },
                  { label: 'SameSite', value: s.session.sameSite },
                  { label: 'Secure cookie', value: s.session.secureCookie ? 'Yes' : 'No (development)' },
                  { label: 'Sign-in rate limit', value: `${s.session.signInRateLimit.maxAttempts} attempts per ${s.session.signInRateLimit.windowMinutes} minutes` },
                ]} />
              </Panel>
            </div>
            <Panel title="Not available">
              <ul className="list-disc space-y-1 pl-6 text-base">
                {s.unavailable.map((item) => <li key={item}>{item}: unavailable</li>)}
              </ul>
            </Panel>
            <Panel title="Recent sign-in events">
              {s.recentAuthEvents.length === 0 ? (
                <p className="text-base text-steel-600">No sign-in events recorded yet.</p>
              ) : (
                <ul aria-label="Recent sign-in events" className="divide-y divide-steel-200">
                  {s.recentAuthEvents.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="break-words text-base font-semibold">{e.action}</p>
                        <p className="break-words text-base text-steel-600">{e.actor ? `${e.actor.name} (${humanize(e.actor.role)})` : 'Unknown account'} · {formatDateTime(e.createdAt)}{e.ipAddress ? ` · ${e.ipAddress}` : ''}</p>
                      </div>
                      <AdminStatusBadge status={e.result} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}
      </AdminAsyncView>
    </AdminPage>
  );
}
