import React, { createContext, useContext, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const OmenXAuthContext = createContext();

// Shared Base44 auth check — runs ONCE app-wide and is consumed by every gate/button.
// Re-checks only on tab focus regain. Eliminates the burst of `me` calls that
// happened when 13 carousel slides each ran their own auth check.
export const OmenXAuthProvider = ({ children }) => {
  const [authData, setAuthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [base44Authed, setBase44Authed] = useState(null); // null = checking

  useEffect(() => {
    // Load OmenX auth from localStorage ONLY.
    // SECURITY: previously fell back to IndexedDB if localStorage was empty, but
    // IndexedDB survives "clear cookies / clear site data" in most browsers (it
    // lives in a separate storage bucket), which let the wallet auto-link after
    // a cache clear. localStorage is the only source of truth now — clearing
    // cache wipes it cleanly and forces a fresh OmenX OAuth on next sign-in.
    try {
      const stored = localStorage.getItem('omenx_auth_data');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.walletAddress) setAuthData(parsed);
      }
    } catch {}
    setLoading(false);

    // Listen for storage changes (login/logout in other tabs)
    const onStorage = (e) => {
      if (e.key === 'omenx_auth_data' && e.storageArea === localStorage) {
        try {
          if (e.newValue) {
            const parsed = JSON.parse(e.newValue);
            if (parsed?.walletAddress) setAuthData(parsed);
            else setAuthData(null);
          } else {
            setAuthData(null);
          }
        } catch {
          setAuthData(null);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Single shared Base44 auth check (was being run independently by every gate/button).
  // SECURITY: we deliberately do NOT synthesize OmenX auth from `me.wallet_address`
  // anymore. If localStorage `omenx_auth_data` is gone (explicit logout, cleared
  // cookies/cache, or a different device using the same Base44 account), the user
  // MUST re-run the OmenX OAuth flow to prove they still own the wallet. This
  // prevents someone signing into another player's Base44 account on a fresh
  // device and being auto-linked to that player's wallet. Same-device session
  // expiry is unaffected — localStorage still holds the wallet, so they stay in.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const isAuthed = await base44.auth.isAuthenticated();
        if (cancelled) return;
        setBase44Authed(!!isAuthed);
      } catch {
        if (!cancelled) setBase44Authed(false);
      }
    };
    check();
    const onFocus = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', onFocus);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onFocus); };
  }, []);

  return (
    <OmenXAuthContext.Provider value={{ authData, loading, base44Authed }}>
      {children}
    </OmenXAuthContext.Provider>
  );
};

export const useOmenXAuth = () => {
  const context = useContext(OmenXAuthContext);
  if (!context) throw new Error('useOmenXAuth must be used within OmenXAuthProvider');
  return context;
};