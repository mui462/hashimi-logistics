import { Link } from 'react-router-dom';

export default function StatCard({ label, value, detail, to, icon: Icon }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-semibold text-steel-600">{label}</p>
        {Icon && <Icon className="size-6 text-steel-500" aria-hidden="true" />}
      </div>
      <p className="mt-2 text-4xl font-extrabold tracking-tight">{value}</p>
      {detail && <p className="mt-1 text-base text-steel-600">{detail}</p>}
    </>
  );
  const classes = 'block rounded-lg border border-steel-200 border-t-4 border-t-ink-900 bg-white p-5 shadow-sm';
  return to ? (
    <Link to={to} className={`${classes} transition-colors hover:bg-steel-50`}>{body}</Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
