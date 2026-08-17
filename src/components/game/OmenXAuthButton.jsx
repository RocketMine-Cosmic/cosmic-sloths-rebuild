import React, { useState, useEffect } from 'react';
import { omenx, getRedirectUri } from '@/lib/omenx';
import { clearAuthFromIndexedDB } from '@/lib/indexedDbAuth';
import { stampAuthWeek } from '@/lib/omenxSessionWeek';
import { base44 } from '@/api/base44Client';
import { useOmenXAuth } from '@/lib/OmenXAuthContext';
import { waitForOmenAuth, isPopupBlockedError } from '@/lib/awaitOmenAuth';

const STORAGE_KEY = 'omenx_auth_data';

export default function OmenXAuthButton({ fullWidth = false, onAuthChange }) {
    // Pull from shared context — no per-button `me` call (was running on every page mount).
    const { authData, base44Authed } = useOmenXAuth();
    const checkingBase44 = base44Authed === null;
    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    const applyAuthData = (rawData) => {
        // Stamp the mint week so weekly re-auth enforcement can age it out.
        const data = rawData ? stampAuthWeek(rawData) : null;
        if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        else localStorage.removeItem(STORAGE_KEY);
        setLoading(false);
        if (data) {
            setSuccessMsg(`Wallet connected: ${data.username || data.walletAddress?.slice(0, 8) || 'OmenX'}`);
            setTimeout(() => setSuccessMsg(''), 5000);
        }
        // Trigger storage event so OmenXAuthContext picks up the change in this tab.
        window.dispatchEvent(new StorageEvent('storage', {
            key: STORAGE_KEY,
            newValue: data ? JSON.stringify(data) : null,
            storageArea: localStorage,
        }));
        onAuthChange?.(data);
    };

    useEffect(() => {
        const onMessage = (event) => {
            if (event.data?.type === 'omenx_auth' && event.data?.authData) {
                const ad = event.data.authData;
                if (ad?.walletAddress && ad?.accessToken) {
                    applyAuthData(ad);
                }
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [onAuthChange]);

    // Show success message briefly when wallet connects from elsewhere
    useEffect(() => {
        if (authData) {
            setLoading(false);
        }
    }, [authData]);


    const handleConnectWallet = async () => {
        setLoading(true);
        setSuccessMsg('');
        /**
         * 🔴 omenx.authenticate() NEVER RESOLVES HERE — see `lib/awaitOmenAuth.js`.
         * It waits for `omenx_oauth_callback_<state>` so it can run its own exchange;
         * ours goes through the `omen-auth` Edge Function because that mints the
         * Supabase session, and the code is single-use. So completion is detected by
         * the auth landing, never by that promise.
         *
         * ⚠️ Keeps faith with the Briantjeuh report (2026-07-08, *"connect wallet does
         * nothing"* on mobile Safari after logout + cache clear) — a blocked popup is
         * still reported, but now only when the SDK ACTUALLY rejects for that reason.
         * The old 1.5s "did the page navigate?" test was written for a redirect flow;
         * the SDK opens a popup, which never navigates the opener, so it fired that
         * warning on every successful sign-in too.
         */
        const redirectUri = getRedirectUri();

        // Subscribe before opening, so a fast completion can't slip through the gap.
        const authArrived = waitForOmenAuth({ timeoutMs: 120_000 });

        let popupBlocked = false;
        const sdkFailed = omenx
            .authenticate({ redirectUri, enablePKCE: true })
            .then(() => null)
            .catch((err) => {
                popupBlocked = isPopupBlockedError(err);
                console.error('[OmenXAuthButton] authenticate rejected:', err);
                return null;
            });

        const landed = await Promise.race([authArrived, sdkFailed]);
        setLoading(false);

        if (landed?.walletAddress) {
            setSuccessMsg('✓ Signed in');
            setTimeout(() => setSuccessMsg(''), 4000);
            return;
        }
        setSuccessMsg(
            popupBlocked
                ? 'Pop-ups are blocked — allow them for this site and sign in again.'
                : 'Sign-in didn\'t complete. Tap Sign In to Omen to try again.'
        );
        setTimeout(() => setSuccessMsg(''), 8000);
    };

    const handleLogout = async () => {
        try {
            const { SaveManager } = await import('@/game/SaveManager');
            await SaveManager.syncToBackend();
        } catch (e) {
            console.error('[handleLogout] Failed to flush save:', e.message);
        }

        applyAuthData(null);
        setSuccessMsg('');
        try { await clearAuthFromIndexedDB(); } catch (e) {}
        try { await omenx.logout(); } catch (e) {}
        try { await base44.auth.logout(); } catch (e) {}
        window.location.reload();
    };

    /**
     * 🔴 TWO STATES, NOT FOUR — Rob, 2026-08-17: *"that button is now wrong it
     * should now just be sign in to omen or log out no seperate sign in or
     * connect wallet."* He is right, and the proof is in the adapter:
     *
     *     export async function redirectToLogin(_returnTo) {
     *       return omenx.authenticate({ redirectUri: getRedirectUri(), enablePKCE: true });
     *     }
     *
     * **"Sign In" and "Connect Wallet" were byte-for-byte the same call.** The
     * old four-state ladder is a base44 fiction: there, a base44 ACCOUNT and an
     * Omen WALLET were separate identities that had to be linked, so the player
     * genuinely did sign in and then connect. In the rebuild **the wallet IS the
     * identity** (D-141/D-145 — `registry.js` marks linkWalletToUser
     * *"Superseded by omen-auth… the wallet IS the identity here"*), and a single
     * `omen-auth` round trip returns the Supabase session and the Omen tokens
     * together.
     *
     * ⚠️ AND IT WAS WORSE THAN UNTIDY: the intermediate state told the player to
     * do a second thing that does not exist. Following that instruction just
     * re-ran the OAuth flow they had already completed.
     *
     * So: checking → signed in → not signed in. `handleBase44SignIn` is gone
     * entirely; there is one sign-in path and it is the Omen one.
     */
    let label, icon, onClick, theme;
    const signedIn = base44Authed && authData;
    if (checkingBase44) {
        label = 'Loading…';
        icon = '⏳';
        onClick = () => {};
        theme = 'bg-slate-800/40 border-slate-600/60 text-slate-300';
    } else if (signedIn) {
        label = 'Logout';
        icon = '⚡';
        onClick = handleLogout;
        theme = 'bg-[#F59E0B]/20 hover:bg-[#F59E0B]/40 border-[#F59E0B]/60 hover:border-[#F59E0B] text-amber-100 hover:text-white shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_30px_rgba(245,158,11,0.6)]';
    } else {
        label = loading ? 'Signing in…' : 'Sign In to Omen';
        icon = '🚀';
        onClick = handleConnectWallet;
        theme = 'bg-purple-900/20 hover:bg-purple-900/40 border-purple-500/60 hover:border-purple-400 text-purple-100 hover:text-white shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)]';
    }

    return (
        <div className={`flex flex-col ${fullWidth ? 'items-center w-full' : 'items-end'} gap-1`}>
            <button
                onClick={onClick}
                disabled={loading || checkingBase44}
                type="button"
                className={`font-black tracking-widest uppercase transition-all border flex items-center justify-center gap-2 backdrop-blur-md pointer-events-auto cursor-pointer ${
                    fullWidth
                        ? 'w-full py-4 md:py-5 text-sm md:text-lg px-4'
                        : 'px-3 py-1.5 rounded-lg text-xs'
                } ${theme}`}
            >
                {loading || checkingBase44
                    ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />
                    : <span>{icon}</span>
                }
                {label}
            </button>
            {successMsg && (
                <div className={`text-[10px] font-bold px-2 py-1 rounded max-w-[240px] text-center border ${
                    successMsg.startsWith('Wallet connected')
                        ? 'text-green-400 bg-green-950/50 border-green-700/50 truncate'
                        : 'text-amber-300 bg-amber-950/50 border-amber-700/50'
                }`}>
                    {successMsg.startsWith('Wallet connected') ? `✓ ${successMsg}` : `⚠ ${successMsg}`}
                </div>
            )}
        </div>
    );
}