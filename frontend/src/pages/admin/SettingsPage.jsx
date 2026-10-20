import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminAsyncView from '../../components/admin/AdminAsyncView';
import AdminPage from '../../components/admin/AdminPage';
import CmsForm from '../../components/admin/cms/CmsForm';
import { CmsButton, CmsMedia, CmsRepeater, CmsSelect, CmsText, CmsTextArea, CmsToggle } from '../../components/admin/cms/CmsFields';
import { buttonBody, buttonValue, mediaBody, mediaValue, str, trimmed, useCmsForm } from '../../components/admin/cms/useCmsForm';
import Panel from '../../components/customer/Panel';
import { humanize } from '../../config/adminStatuses';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getCmsSettings, saveCmsSettings } from '../../services/adminService';
import { formatDateTime } from '../../utils/format';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const PLATFORMS = ['facebook', 'linkedin', 'x', 'instagram', 'youtube', 'tiktok'].map((value) => ({ value, label: value === 'x' ? 'X' : humanize(value) }));
const COUNTRIES = [{ value: 'US', label: 'United States' }, { value: 'CA', label: 'Canada' }, { value: 'MX', label: 'Mexico' }];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function initialValues(data) {
  const hours = Object.fromEntries((data.businessHours ?? []).map((row) => [row.day, row]));
  return {
    companyName: str(data.companyName), shortName: str(data.shortName), tagline: str(data.tagline), phone: str(data.phone), email: str(data.email),
    address: { street: str(data.address?.street), city: str(data.address?.city), state: str(data.address?.state), zipCode: str(data.address?.zipCode), country: str(data.address?.country) },
    businessHours: DAYS.map((day) => ({ day, isClosed: Boolean(hours[day]?.isClosed), opensAt: str(hours[day]?.opensAt), closesAt: str(hours[day]?.closesAt) })),
    socialLinks: (data.socialLinks ?? []).map((link) => ({ platform: link.platform, url: link.url })),
    logo: mediaValue(data.logo), favicon: mediaValue(data.favicon), primaryCta: buttonValue(data.primaryCta),
    footerText: str(data.footerText), copyrightText: str(data.copyrightText), timezone: str(data.timezone),
  };
}

function validate(v) {
  const found = {};
  if (!trimmed(v.companyName)) found.companyName = 'Enter the company name.';
  v.businessHours.forEach((row, index) => {
    if (row.isClosed) return;
    if (row.opensAt && !TIME.test(row.opensAt)) found[`businessHours.${index}.opensAt`] = 'Use a time such as 08:00.';
    if (row.closesAt && !TIME.test(row.closesAt)) found[`businessHours.${index}.closesAt`] = 'Use a time such as 17:00.';
    if (Boolean(row.opensAt) !== Boolean(row.closesAt)) found[`businessHours.${index}.${row.opensAt ? 'closesAt' : 'opensAt'}`] = 'Enter both an opening and a closing time, or leave both empty.';
  });
  v.socialLinks.forEach((link, index) => { if (!link.url.trim()) found[`socialLinks.${index}.url`] = 'Enter the full https:// address.'; });
  return found;
}

const build = (v) => ({
  companyName: trimmed(v.companyName), shortName: trimmed(v.shortName), tagline: trimmed(v.tagline), phone: trimmed(v.phone), email: trimmed(v.email),
  address: { street: trimmed(v.address.street), city: trimmed(v.address.city), state: trimmed(v.address.state), zipCode: trimmed(v.address.zipCode), country: v.address.country },
  businessHours: v.businessHours.filter((row) => row.isClosed || (row.opensAt && row.closesAt)).map((row) => ({ day: row.day, isClosed: row.isClosed, opensAt: row.isClosed ? '' : row.opensAt, closesAt: row.isClosed ? '' : row.closesAt })),
  socialLinks: v.socialLinks.map((link) => ({ platform: link.platform, url: link.url.trim() })),
  logo: mediaBody(v.logo), favicon: mediaBody(v.favicon), primaryCta: buttonBody(v.primaryCta),
  footerText: trimmed(v.footerText), copyrightText: trimmed(v.copyrightText), timezone: trimmed(v.timezone),
});

function SettingsForm({ data, onSaved }) {
  const form = useCmsForm({ initial: initialValues(data), validate, submit: (v) => saveCmsSettings(build(v)), success: 'Website settings saved.', onSaved });
  return (
    <CmsForm form={form} label="Website settings" saveLabel="Save settings">
      <Panel title="Company">
        <div className="space-y-5">
          <CmsText form={form} name="companyName" label="Company name" maxLength={150} />
          <div className="grid gap-4 sm:grid-cols-2">
            <CmsText form={form} name="shortName" label="Short name" hint="Used where space is tight." maxLength={60} />
            <CmsText form={form} name="timezone" label="Office time zone" hint="For example America/Chicago." maxLength={60} />
          </div>
          <CmsText form={form} name="tagline" label="Tagline" maxLength={200} />
          <CmsMedia form={form} name="logo" label="Logo" hint="Empty keeps the built-in logo." />
          <CmsMedia form={form} name="favicon" label="Browser tab icon" />
        </div>
      </Panel>
      <Panel title="Contact details" description="Shown on the website only if you enter them. Nothing is filled in for you.">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <CmsText form={form} name="phone" label="Phone" type="tel" maxLength={30} />
            <CmsText form={form} name="email" label="Email" type="email" maxLength={254} />
          </div>
          <CmsText form={form} name="address.street" label="Street address" maxLength={200} />
          <div className="grid gap-4 sm:grid-cols-2">
            <CmsText form={form} name="address.city" label="City" maxLength={100} />
            <CmsText form={form} name="address.state" label="State or province" maxLength={50} />
            <CmsText form={form} name="address.zipCode" label="ZIP or postal code" maxLength={20} />
            <CmsSelect form={form} name="address.country" label="Country" options={COUNTRIES} placeholder="Not set" />
          </div>
        </div>
      </Panel>
      <Panel title="Business hours" description="Days left empty are not shown.">
        <div className="space-y-4">
          {DAYS.map((day, index) => (
            <fieldset key={day} className="rounded-lg border border-steel-200 p-4">
              <legend className="px-1 text-base font-semibold">{humanize(day)}</legend>
              <div className="grid items-end gap-4 sm:grid-cols-3">
                <CmsText form={form} name={`businessHours.${index}.opensAt`} label={`${humanize(day)} opens`} type="time" disabled={form.get(`businessHours.${index}.isClosed`)} />
                <CmsText form={form} name={`businessHours.${index}.closesAt`} label={`${humanize(day)} closes`} type="time" disabled={form.get(`businessHours.${index}.isClosed`)} />
                <CmsToggle form={form} name={`businessHours.${index}.isClosed`} label="Closed" />
              </div>
            </fieldset>
          ))}
        </div>
      </Panel>
      <Panel title="Social links">
        <CmsRepeater form={form} name="socialLinks" label="Social link" addLabel="Add a social link" max={6} blank={() => ({ platform: 'linkedin', url: '' })} render={(p) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <CmsSelect form={form} name={`${p}.platform`} label="Platform" options={PLATFORMS} />
            <CmsText form={form} name={`${p}.url`} label="Address" placeholder="https://" maxLength={2048} />
          </div>
        )} />
      </Panel>
      <Panel title="Header and footer">
        <div className="space-y-5">
          <CmsButton form={form} name="primaryCta" label="Main button in the header (optional)" />
          <CmsTextArea form={form} name="footerText" label="Footer text" rows={3} maxLength={500} />
          <CmsText form={form} name="copyrightText" label="Copyright line" maxLength={200} />
        </div>
      </Panel>
    </CmsForm>
  );
}

export default function SettingsPage() {
  const [version, setVersion] = useState(0);
  const state = useAsyncData(useCallback(() => getCmsSettings(), [version]));
  return (
    <AdminPage title="Settings" description="Company and contact details used across the public website. This is the one place to edit them.">
      <AdminAsyncView state={state} label="Loading settings" errorTitle="We could not load settings">
        {(data) => (
          <>
            {!data.exists && <p role="note" className="mb-6 rounded-md border border-steel-300 bg-steel-50 p-4 text-base">No website settings have been saved yet. The website shows its built-in company details until you save these.</p>}
            <SettingsForm key={data.updatedAt ?? 'new'} data={data} onSaved={() => setVersion((current) => current + 1)} />
            {data.updatedAt && <p className="mt-6 text-base text-steel-600">Last updated {formatDateTime(data.updatedAt)}.</p>}
            <Panel title="Appearance" description="The public website's navigation bar and its overall theme.">
              <span className="flex flex-wrap gap-x-6 gap-y-2">
                <Link to="/admin/cms/navbar" className="font-semibold underline underline-offset-4">Appearance: Navbar</Link>
                <Link to="/admin/cms/theme" className="font-semibold underline underline-offset-4">Appearance: Website theme</Link>
              </span>
            </Panel>
          </>
        )}
      </AdminAsyncView>
    </AdminPage>
  );
}
