import { useEffect, useRef, useState } from 'react';
import { getGoogleConfig } from '../../services/authService';

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
let scriptPromise = null;

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Google script failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * "Continue with Google" button. The real button is Google's own (Google Identity Services), rendered only when the server
 * reports Google Sign-In as configured. It hands back a signed ID token; the server verifies it, nothing here is trusted.
 * Until Google is configured, a disabled placeholder with a short explanation is shown instead.
 */
export default function GoogleAuthButton({ onCredential, text = 'continue_with', label = 'Continue with Google', busy = false }) {
  const [state, setState] = useState({ status: 'loading', clientId: null });
  const holder = useRef(null);
  const handler = useRef(onCredential);
  handler.current = onCredential;

  useEffect(() => {
    let current = true;
    (async () => {
      try {
        const config = await getGoogleConfig();
        if (!config.enabled || !config.clientId) return current && setState({ status: 'unavailable', clientId: null });
        await loadGoogleScript();
        if (current) setState({ status: 'ready', clientId: config.clientId });
      } catch {
        if (current) setState({ status: 'unavailable', clientId: null });
      }
    })();
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (state.status !== 'ready' || !holder.current) return;
    const { id } = window.google.accounts;
    id.initialize({ client_id: state.clientId, callback: (response) => response?.credential && handler.current(response.credential), ux_mode: 'popup' });
    holder.current.replaceChildren();
    id.renderButton(holder.current, { type: 'standard', theme: 'outline', size: 'large', text, shape: 'rectangular', logo_alignment: 'left', width: Math.min(holder.current.clientWidth || 360, 400) });
  }, [state, text]);

  if (state.status === 'ready') {
    return (
      <div aria-busy={busy || undefined} className={busy ? 'pointer-events-none opacity-60' : undefined}>
        <div ref={holder} className="flex min-h-11 w-full justify-center" />
      </div>
    );
  }
  return (
    <div>
      <button
        type="button"
        disabled
        className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-md border-2 border-steel-300 bg-white px-6 text-lg font-semibold text-ink-900 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <GoogleMark />
        {label}
      </button>
      <p className="mt-2 text-sm text-steel-600" role="status">
        {state.status === 'loading' ? 'Checking Google sign-in…' : 'Google sign-in is not available yet. Please use your email and password.'}
      </p>
    </div>
  );
}
