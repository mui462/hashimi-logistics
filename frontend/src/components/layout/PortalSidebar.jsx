import { Link, useLocation } from 'react-router-dom';
import { LogOut, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { cx } from '../../utils/cx';
import Button from '../common/Button';
import Logo from '../common/Logo';

const linkClasses = (isActive) =>
  cx(
    'flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-base font-medium transition-colors',
    isActive ? 'bg-ink-700 text-white' : 'text-steel-200 hover:bg-ink-800 hover:text-white'
  );

// An item is current on its own path and (unless `end`) below it, except for paths it lists in `exclude`
// (for example "My quotes" is not current on "Request a quote", which is its own item).
function isCurrent(item, pathname) {
  if (pathname === item.to || (item.aliases ?? []).includes(pathname)) return true;
  if (item.end) return false;
  return pathname.startsWith(`${item.to}/`) && !(item.exclude ?? []).some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export default function PortalSidebar({ portalName, navGroups, homePath, account, onClose }) {
  const { pathname } = useLocation();
  const { logout } = useAuth();

  return (
    <div data-surface="dark" className="flex h-full flex-col bg-ink-900 text-white">
      <div className="flex min-h-[4.5rem] items-center justify-between gap-2 border-b border-ink-700 px-4">
        <Logo tone="dark" to={homePath} />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="inline-flex size-11 items-center justify-center rounded-md hover:bg-ink-800 lg:hidden"
          >
            <X className="size-6" aria-hidden="true" />
          </button>
        )}
      </div>

      <nav aria-label={portalName} className="flex-1 space-y-6 overflow-y-auto px-3 py-6">
        {navGroups.map((group) => (
          <div key={group.label ?? 'main'}>
            {group.label && <h2 className="px-3 pb-2 text-base font-semibold text-signal-400">{group.label}</h2>}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const current = isCurrent(item, pathname);
                return (
                  <li key={item.to}>
                    <Link to={item.to} aria-current={current ? 'page' : undefined} className={linkClasses(current)}>
                      <item.icon className="size-5 shrink-0" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {account && (
        <div className="space-y-3 border-t border-ink-700 p-4">
          <div className="min-w-0">
            {account.company && <p className="break-words text-base font-bold leading-snug">{account.company}</p>}
            <p className="break-words text-base leading-snug text-steel-200">{account.name}</p>
          </div>
          <Button tone="dark" variant="secondary" size="sm" className="w-full" onClick={logout}>
            <LogOut className="size-5" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      )}
    </div>
  );
}
