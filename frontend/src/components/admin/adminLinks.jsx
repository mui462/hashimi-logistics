import { Link } from 'react-router-dom';
import { formatStop } from '../../utils/format';

const linkClass = 'break-words font-semibold underline underline-offset-4 hover:text-ink-700';

export const adminPath = (kind, id) => `/admin/${kind}/${encodeURIComponent(id)}`;

// A partner's name as a link to their admin detail page. Missing partners show an em dash, never an invented name.
export function PartnerLink({ kind, partner }) {
  if (!partner?.id) return '—';
  return partner.companyName ? <Link to={adminPath(kind, partner.id)} className={linkClass}>{partner.companyName}</Link> : <span className="text-steel-600">Not available</span>;
}

// `touch` makes a stand-alone link in a table a comfortable tap target (at least 44px tall).
export const EntityLink = ({ to, children, touch = false }) => <Link to={to} className={touch ? `${linkClass} inline-flex min-h-11 items-center` : linkClass}>{children}</Link>;

export const stopLabel = (stop) => formatStop(stop);

export const lane = (origin, destination) => (
  <span className="block">
    <span className="block">{formatStop(origin)}</span>
    <span className="block text-steel-600">to {formatStop(destination)}</span>
  </span>
);

// "2026-11-03 09:00 to 2026-11-03 17:00 (America/Chicago)": the stop's own local time, exactly as the server formatted it.
export function formatWindow(window) {
  if (!window?.earliestLocal && !window?.latestLocal) return '—';
  const span = [window.earliestLocal, window.latestLocal].filter(Boolean).join(' to ');
  return window.timezone ? `${span} (${window.timezone})` : span;
}

export function formatAppointment(appointment) {
  if (!appointment?.scheduledLocal) return '—';
  const text = `${appointment.scheduledLocal}${appointment.timezone ? ` (${appointment.timezone})` : ''}`;
  return appointment.confirmationNumber ? `${text} · Confirmation ${appointment.confirmationNumber}` : text;
}
