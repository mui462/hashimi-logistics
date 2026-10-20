import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import NoIndex from '../seo/NoIndex';
import SkipLink from '../common/SkipLink';
import PortalSidebar from './PortalSidebar';
import PortalTopbar from './PortalTopbar';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// `account` (optional): { name, detail, profilePath } shown in the sidebar footer together with Sign out.
export default function PortalLayout({ portalName, navGroups, homePath, account, displayName, notice }) {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const { pathname } = useLocation();
  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);
  const restoreTarget = useRef('button');

  // Closing by Escape, the close button or the backdrop returns focus to the menu button that opened the drawer.
  // Following a link closes it too, but focus then moves to the new page's content instead.
  const closeNav = useCallback((target = 'button') => {
    restoreTarget.current = target;
    setIsNavOpen(false);
  }, []);

  useEffect(() => {
    closeNav('main');
  }, [pathname, closeNav]);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (isNavOpen) {
      wasOpen.current = true;
      drawerRef.current?.querySelector(FOCUSABLE)?.focus();
      return undefined;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      if (restoreTarget.current === 'button') menuButtonRef.current?.focus();
      else document.getElementById('main-content')?.focus({ preventScroll: true });
    }
    return undefined;
  }, [isNavOpen]);

  useEffect(() => {
    if (!isNavOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeNav('button');
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll(FOCUSABLE)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isNavOpen, closeNav]);

  const sidebarProps = { portalName, navGroups, homePath, account };

  return (
    <div className="min-h-screen bg-steel-50">
      <NoIndex />
      <SkipLink />

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 lg:block">
        <PortalSidebar {...sidebarProps} />
      </aside>

      {isNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60" onClick={() => closeNav('button')} aria-hidden="true" />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${portalName} navigation`}
            className="absolute inset-y-0 left-0 w-80 max-w-[85vw]"
          >
            <PortalSidebar {...sidebarProps} onClose={() => closeNav('button')} />
          </div>
        </div>
      )}

      <div className="lg:pl-72">
        <PortalTopbar
          portalName={portalName}
          displayName={displayName}
          menuButtonRef={menuButtonRef}
          isNavOpen={isNavOpen}
          onOpenNavigation={() => setIsNavOpen(true)}
          showSignOut={!account}
        />
        <main id="main-content" tabIndex={-1} className="p-4 outline-none sm:p-6 lg:p-8">
          {notice}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
