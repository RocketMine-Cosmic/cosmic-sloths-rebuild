import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useOmenXAuth } from '@/lib/OmenXAuthContext';

// After OmenX login succeeds, ensures the user is also signed in to Base44
// and links their wallet to the Base44 User record.
//
// Flow:
//   1. OmenX auth present? → check Base44 auth
//   2. Not Base44'd in? → redirect to Base44 login (returns to current page)
//   3. Base44'd in? → call linkWalletToUser once to attach wallet to user record

export default function Base44AuthLinker() {
    // 🔴 base44Authed IS A DEPENDENCY, NOT DECORATION. This effect calls
    // isAuthenticated() itself and returns early when it is false. Sign-in happens
    // in a popup, so on the pass triggered by the wallet arriving the Supabase
    // session may not be readable yet — it returned, never dispatched
    // `walletLinked`, and SaveManager stayed bailed with its sync loop unstarted.
    // Taking base44Authed from the context means this re-runs the moment the
    // session actually becomes visible. See OmenXAuthContext for the full chain.
    const { authData: omenxAuth, base44Authed } = useOmenXAuth();
    const linkedWalletRef = useRef(null);
    // Bumped by the SyncStatusBanner "Retry" button via a window event — re-runs
    // the link effect without forcing a full page reload (kinder on iOS Safari,
    // which can lose localStorage state across reloads under ITP).
    const [retryTick, setRetryTick] = useState(0);

    useEffect(() => {
        const onRetry = () => {
            linkedWalletRef.current = null; // allow the effect to re-run
            setRetryTick(t => t + 1);
        };
        window.addEventListener('retryWalletLink', onRetry);
        return () => window.removeEventListener('retryWalletLink', onRetry);
    }, []);

    useEffect(() => {
        // No OmenX auth → nothing to do
        if (!omenxAuth?.walletAddress || !omenxAuth?.accessToken) return;

        // Already linked this wallet this session → skip
        if (linkedWalletRef.current === omenxAuth.walletAddress.toLowerCase()) return;

        let cancelled = false;

        (async () => {
            try {
                const isAuthed = await base44.auth.isAuthenticated();

                if (!isAuthed) {
                    // Not signed in to Base44 → do nothing. The user will sign in
                    // explicitly via the Sign In button. Auto-redirecting here was
                    // popping up the login screen on app open and after logout.
                    return;
                }

                if (cancelled) return;

                // Signed in to both → link wallet (idempotent — backend skips if already set)
                const me = await base44.auth.me();
                const wallet = omenxAuth.walletAddress.toLowerCase();

                const alreadyLinked = me?.wallet_address?.toLowerCase() === wallet;
                if (!alreadyLinked) {
                    // Retry up to 3 times with backoff for transient failures
                    let lastErr = null;
                    let linked = false;
                    for (let attempt = 1; attempt <= 3; attempt++) {
                        if (cancelled) return;
                        try {
                            // Race the invoke against a 10s timeout — iOS Safari can
                            // hang fetches indefinitely under Private Relay / Low Power
                            // Mode, which used to leave the linker silently stuck on
                            // attempt 1 forever. The timeout makes retries actually retry.
                            const res = await Promise.race([
                                base44.functions.invoke('linkWalletToUser', {
                                    walletAddress: wallet,
                                    accessToken: omenxAuth.accessToken,
                                }),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
                            ]);
                            if (res?.data?.error) throw new Error(res.data.error);
                            linked = true;
                            console.log(`[Base44AuthLinker] ✓ Wallet linked (attempt ${attempt})`);
                            break;
                        } catch (err) {
                            lastErr = err;
                            console.warn(`[Base44AuthLinker] link attempt ${attempt} failed:`, err.message);
                            if (attempt < 3) {
                                await new Promise(r => setTimeout(r, attempt * 1000)); // 1s, 2s backoff
                            }
                        }
                    }
                    if (!linked) {
                        // Persistent failure — surface so UI can show a warning
                        window.dispatchEvent(new CustomEvent('walletLinkFailed', {
                            detail: { wallet, error: lastErr?.message || 'unknown' }
                        }));
                        console.error('[Base44AuthLinker] FAILED after 3 attempts. Cloud saves disabled until linked.');
                        return; // don't set linkedWalletRef — allow retry on next mount
                    }
                }

                linkedWalletRef.current = wallet;

                // Tell SaveManager to (re)load cloud save now that the wallet is linked.
                // Fires whether we just linked it or it was already linked — the SaveManager
                // needs this signal to load cloud data when a user signs in after app boot.
                window.dispatchEvent(new CustomEvent('walletLinked', { detail: { wallet, alreadyLinked } }));
            } catch (e) {
                console.warn('[Base44AuthLinker] unexpected error:', e.message);
            }
        })();

        return () => { cancelled = true; };
    }, [omenxAuth?.walletAddress, omenxAuth?.accessToken, base44Authed, retryTick]);

    return null;
}