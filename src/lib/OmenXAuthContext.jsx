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
  /**
   * 🔴 THIS CHECK USED TO RUN ONCE ON MOUNT AND THEN ONLY ON visibilitychange,
   * AND THAT SINGLE FACT CAUSED THREE SEPARATE SYMPTOMS.
   *
   * Sign-in happens in a POPUP. The popup exchanges the code through `omen-auth`
   * and the adapter installs the Supabase session — in the POPUP's window. The
   * session is persisted to localStorage (same origin), so it is genuinely there.
   * But THIS window's check had already run at mount, cached `false`, and had no
   * reason to look again: `visibilitychange` does not reliably fire on the opener
   * when a popup closes, because the opener was never hidden.
   *
   * What that produced, all from one stale boolean — Rob, 2026-08-17, on the
   * screen recording: *"something is still hanging... it looks like the save loop
   * isnt fireing but its fine after a refresh."*
   *
   *   1. OmenXGate:32 branches on `!base44Authed`, so with the wallet present it
   *      showed **"Your wallet is connected, but you need to sign in to link it
   *      and enable cloud saves"** — the copy that proves authData HAD landed and
   *      only the Supabase half was missing.
   *   2. Base44AuthLinker calls isAuthenticated(), got false, returned early, and
   *      therefore **never dispatched `walletLinked`**.
   *   3. Without `walletLinked`, SaveManager.initialize() stayed bailed at its 4s
   *      "wallet not linked" poll, **so the sync loop never started** and the
   *      indicator sat on "Saving" forever — it only ever advances to Syncing on
   *      `saveSyncStart`, which syncToBackend never got to emit.
   *
   * A refresh fixed all three at once because a fresh mount re-reads the session
   * from storage — which is the proof the session was correct all along.
   *
   * ⚠️ THE RETRY LADDER IS NOT PADDING. The Supabase session write and the
   * `omenx_auth_data` write are two separate writes from the popup, and we can be
   * woken by either. Checking once on the first signal can genuinely land before
   * the session is readable, which would re-arm exactly the bug this removes.
   *
   * 🟢 The SECURITY property in the note below is untouched: we still never
   * synthesise OmenX auth from `me.wallet_address`. This only asks Supabase
   * whether a session exists, more than once.
   */
  // Single shared Base44 auth check (was being run independently by every gate/button).
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const isAuthed = await base44.auth.isAuthenticated();
        if (cancelled) return false;
        setBase44Authed(!!isAuthed);
        return !!isAuthed;
      } catch {
        if (!cancelled) setBase44Authed(false);
        return false;
      }
    };

    const checkWithRetry = async () => {
      for (const wait of [0, 200, 500, 1000, 2000]) {
        if (cancelled) return;
        if (wait) await new Promise((r) => setTimeout(r, wait));
        if (await check()) return;
      }
    };

    checkWithRetry();

    const onFocus = () => { if (!document.hidden) check(); };
    document.addEventListener('visibilitychange', onFocus);

    // Supabase persists its session under `sb-<ref>-auth-token`; App.jsx re-dispatches
    // a StorageEvent for `omenx_auth_data` when the popup posts. Either is a reason
    // to look again — and a null key means "storage was cleared", which matters too.
    const onStorage = (e) => {
      const k = e?.key;
      if (!k || k === 'omenx_auth_data' || k.startsWith('sb-')) checkWithRetry();
    };
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('storage', onStorage);
    };
    // Re-runs the moment the Omen wallet lands — the signal that a sign-in just
    // completed in this tab and the Supabase session is about to be readable.
  }, [authData?.walletAddress]);

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