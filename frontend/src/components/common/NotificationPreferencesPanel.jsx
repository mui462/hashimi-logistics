import { useCallback, useEffect, useId, useState } from 'react';
import { getPreferences, updatePreferences } from '../../services/notificationSettingsService';
import Alert from './Alert';
import LoadingState from './LoadingState';

const GROUPS = [
  { key: 'quoteNotifications', label: 'Quotes', hint: 'Quote requests, prices and decisions.' },
  { key: 'shipmentNotifications', label: 'Loads and shipments', hint: 'Assignments, pickup, transit and delivery updates.' },
  { key: 'documentNotifications', label: 'Documents', hint: 'Proof of delivery and other documents.' },
];

function Toggle({ id, label, hint, checked, disabled, onChange }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <input id={id} type="checkbox" className="h-10 w-10 shrink-0 rounded border-steel-400" checked={checked} disabled={disabled} aria-describedby={`${id}-hint`} onChange={(event) => onChange(event.target.checked)} />
      <div className="min-w-0 pt-2">
        <label htmlFor={id} className="block min-h-6 text-base font-semibold">{label}</label>
        <p id={`${id}-hint`} className="text-base text-steel-600">{hint}</p>
      </div>
    </div>
  );
}

/**
 * Email and text-message settings for the signed-in user. `scope` is "customer", "carrier" or "admin" and only selects the
 * endpoint; the server applies the change to the session's own account. Security emails (password reset, email confirmation)
 * cannot be turned off, and the page says so.
 */
export default function NotificationPreferencesPanel({ scope }) {
  const uid = useId();
  const [state, setState] = useState({ status: 'loading' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ tone: '', text: '' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    getPreferences(scope).then((data) => setState({ status: 'ready', data }), () => setState({ status: 'error' }));
  }, [scope]);
  useEffect(load, [load]);

  // The box changes at once; the server's answer then replaces it, and a refusal puts the saved value back.
  const change = async (key, value) => {
    const previous = state;
    setState((current) => ({ ...current, data: { ...current.data, preferences: { ...current.data.preferences, [key]: value } } }));
    setSaving(true);
    setMessage({ tone: '', text: '' });
    try {
      const data = await updatePreferences(scope, { [key]: value });
      setState({ status: 'ready', data });
      setMessage({ tone: 'success', text: 'Notification settings saved.' });
    } catch (error) {
      setState(previous);
      setMessage({ tone: 'error', text: error?.errors?.[0]?.message || error?.message || 'We could not save that setting. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby={`${uid}-title`} className="rounded-lg border border-steel-200 bg-white shadow-sm">
      <div className="border-b border-steel-200 px-5 py-4 sm:px-6">
        <h2 id={`${uid}-title`} className="text-xl font-bold">Email and text message settings</h2>
        <p className="mt-1 text-base text-steel-600">In-app notifications always appear here. Choose which ones are also sent to you by email or text message.</p>
      </div>
      <div className="p-5 sm:p-6">
        {state.status === 'loading' && <LoadingState label="Loading your notification settings" />}
        {state.status === 'error' && (
          <Alert tone="error">
            We could not load your notification settings. <button type="button" className="min-h-11 font-semibold underline" onClick={load}>Try again</button>
          </Alert>
        )}
        {state.status === 'ready' && (() => {
          const { preferences, channels } = state.data;
          return (
            <div>
              <div className="divide-y divide-steel-200">
                <Toggle id={`${uid}-email`} label="Email notifications" hint={channels.emailAvailable ? 'Send notifications to the email address on your account.' : 'Email delivery is not set up on this system yet, so no emails are sent.'} checked={preferences.emailNotifications} disabled={saving} onChange={(value) => change('emailNotifications', value)} />
                <Toggle id={`${uid}-sms`} label="Text message notifications" hint={!channels.smsAvailable ? 'Text messages are not set up on this system, so none are sent.' : channels.smsPhoneOnFile ? 'Short text alerts to the mobile number on your profile.' : 'Add a valid mobile number to your profile to turn this on.'} checked={preferences.smsNotifications} disabled={saving || (!preferences.smsNotifications && !channels.smsPhoneOnFile)} onChange={(value) => change('smsNotifications', value)} />
              </div>
              <fieldset className="mt-4 border-t border-steel-200 pt-4">
                <legend className="text-base font-semibold">Send me email and text alerts about</legend>
                <div className="divide-y divide-steel-200">
                  {GROUPS.map((group) => (
                    <Toggle key={group.key} id={`${uid}-${group.key}`} label={group.label} hint={group.hint} checked={preferences[group.key]} disabled={saving} onChange={(value) => change(group.key, value)} />
                  ))}
                </div>
              </fieldset>
              <p className="mt-4 text-base text-steel-600">Account security emails, such as password reset and email confirmation links, are always sent and cannot be turned off.</p>
            </div>
          );
        })()}
        <div role="status" aria-live="polite" className="mt-3 min-h-6 text-base">
          {message.text && <span className={message.tone === 'error' ? 'font-semibold text-danger-700' : 'font-semibold text-success-700'}>{message.text}</span>}
        </div>
      </div>
    </section>
  );
}
