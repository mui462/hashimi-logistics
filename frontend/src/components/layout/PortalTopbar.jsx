import { LogOut, Menu } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { ACCOUNT_TYPE_LABELS } from '../../config/constants';
import Button from '../common/Button';

export default function PortalTopbar({ portalName, displayName, onOpenNavigation, menuButtonRef, isNavOpen = false, showSignOut = true }) {
  const { user, logout } = useAuth();
  return (
    <header className="sticky top-0 z-30 flex min-h-[4.5rem] items-center gap-3 border-b border-steel-200 bg-white px-4 sm:px-6 lg:px-8">
      <button
        ref={menuButtonRef}
        type="button"
        onClick={onOpenNavigation}
        aria-label="Open navigation"
        aria-expanded={isNavOpen}
        className="inline-flex size-12 items-center justify-center rounded-md hover:bg-steel-100 lg:hidden"
      >
        <Menu className="size-7" aria-hidden="true" />
      </button>

      <p className="flex-1 text-lg font-bold">{portalName}</p>

      <div className="hidden text-right sm:block">
        <p className="text-base font-semibold leading-tight">{displayName || user?.fullName}</p>
        <p className="text-base leading-tight text-steel-600">{ACCOUNT_TYPE_LABELS[user?.role]}</p>
      </div>

      {showSignOut && (
        <Button variant="secondary" size="sm" onClick={logout}>
          <LogOut className="size-5" aria-hidden="true" />
          Sign out
        </Button>
      )}
    </header>
  );
}
