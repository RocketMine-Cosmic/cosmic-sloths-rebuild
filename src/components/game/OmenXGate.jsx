import React, { useState } from 'react';
import SpaceBackground from './SpaceBackground';
import { useOmenXAuth } from '@/lib/OmenXAuthContext';
import { omenx, getRedirectUri } from '@/lib/omenx';
import { waitForOmenAuth, isPopupBlockedError } from '@/lib/awaitOmenAuth';

export default function OmenXGate({ children, isCarousel }) {
    // Read shared auth state — no per-gate `me` call (was 13× across the carousel).
    const { authData: auth, base44Authed } = useOmenXAuth();
    // Surface silent SDK failures on mobile (Briantjeuh report 2026-07-08 —
    // "Connect Wallet does nothing" on mobile Safari after logout + cache clear).
    const [ctaError, setCtaError] = useState('');
    const [ctaLoading, setCtaLoading] = useState(false);

    // Bypass auth inside Base44 preview iframe
    const isPreview = window.self !== window.top && window.location !== window.parent.location;
    if (isPreview) return children;

    // Both signed in + wallet connected → render children
    if (base44Authed && auth) return children;

    /**
     * 🔴 ONE SIGNED-OUT STATE, NOT TWO — Rob, 2026-08-17: *"that button is now
     * wrong it should now just be sign in to omen or log out no seperate sign in
     * or connect wallet."*
     *
     * The old ladder had a "Sign In Required" step and a "Wallet Required" step,
     * and its comment explained that Omen-website players *"don't know wallet
     * linking requires a separate sign-in"*. **That is a base44 description of a
     * base44 world.** There, a base44 ACCOUNT and an Omen WALLET were separate
     * identities needing a link step. In the rebuild the wallet IS the identity
     * (D-141/D-145; `registry.js` retires linkWalletToUser as *"Superseded by
     * omen-auth… the wallet IS the identity here"*), and one `omen-auth` round
     * trip returns the Supabase session and the Omen tokens together.
     *
     * ⚠️ AND BOTH CTAs RAN THE SAME CALL. `base44.auth.redirectToLogin()` is, in
     * the adapter, literally `omenx.authenticate({ redirectUri: getRedirectUri(),
     * enablePKCE: true })` — the identical line the "Connect Wallet" branch used.
     * So the intermediate screen asked the player to perform a second step that
     * does not exist, and doing it re-ran the flow they had just finished.
     *
     * 🟢 A useful side effect: the copy *"Your wallet is connected, but you need
     * to sign in"* is what proved 046's diagnosis — it can only render when
     * authData is present and base44Authed is stale-false. Now that the stale
     * boolean is fixed, the state it described is gone too.
     */
    let icon, title, subtitle, ctaLabel, ctaAction;
    if (base44Authed === null) {
        icon = '⏳';
        title = 'Loading';
        subtitle = 'Checking your session…';
    } else {
        icon = '🚀';
        title = 'Sign In Required';
        subtitle = 'Sign in to Omen to access this area.';
        ctaLabel = ctaLoading ? 'Signing in…' : 'Sign In to Omen';
        /**
         * 🔴 DO NOT await omenx.authenticate() AS THE SUCCESS SIGNAL — IT NEVER
         * RESOLVES HERE, BY DESIGN. It waits for `omenx_oauth_callback_<state>` so it
         * can run its own code exchange; ours runs through the `omen-auth` Edge
         * Function instead because that is what mints the Supabase session, and an
         * authorization code is single-use. See `lib/awaitOmenAuth.js` for the full
         * reasoning.
         *
         * ⚠️ The previous version awaited it and then guessed from a 1.5s "did the
         * page navigate?" check written for a REDIRECT flow. The SDK opens a POPUP,
         * which never navigates the opener — so that check failed every time and
         * showed "Connect didn't open. Please allow pop-ups" **on every successful
         * sign-in**, resetting the button while the popup was still open.
         */
        ctaAction = async () => {
            setCtaError('');
            setCtaLoading(true);

            // Start listening BEFORE the popup opens, so a fast completion can't
            // land in the gap between opening and subscribing.
            const authArrived = waitForOmenAuth({ timeoutMs: 120_000 });

            let popupBlocked = false;
            // The SDK's only rejection we can act on is a blocked popup; on success
            // this promise simply never settles, so it must not be raced as a win.
            const sdkFailed = omenx
                .authenticate({ redirectUri: getRedirectUri(), enablePKCE: true })
                .then(() => null)
                .catch((e) => {
                    popupBlocked = isPopupBlockedError(e);
                    console.error('[OmenXGate] authenticate rejected:', e);
                    return null;
                });

            const landed = await Promise.race([authArrived, sdkFailed]);
            setCtaLoading(false);

            if (landed?.walletAddress) return; // context updates and the gate opens itself
            setCtaError(
                popupBlocked
                    ? 'Sign-in didn\'t open — pop-ups are blocked for this site. Allow pop-ups and tap Sign In to Omen again.'
                    : 'Sign-in didn\'t complete. If you closed the Omen window, tap Sign In to Omen to try again.'
            );
        };
    }

    return (
        <div className={`${isCarousel ? 'min-h-full' : 'min-h-screen'} relative text-slate-200 flex flex-col items-center justify-center gap-6 p-6 font-sans`}>
            {!isCarousel && <SpaceBackground />}
            <div className="relative z-10 text-center flex flex-col items-center gap-4">
                <div className="text-6xl mb-2">{icon}</div>
                <h2 className="text-2xl md:text-3xl font-black tracking-widest uppercase text-white">{title}</h2>
                <p className="text-slate-400 text-sm max-w-xs">{subtitle}</p>
                {ctaAction && (
                    <button
                        onClick={ctaAction}
                        disabled={ctaLoading}
                        className="mt-2 px-6 py-3 bg-cyan-900/30 hover:bg-cyan-900/50 border border-cyan-500/60 hover:border-cyan-400 text-cyan-100 hover:text-white font-black tracking-widest uppercase text-sm rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] transition-all disabled:opacity-60"
                    >
                        {ctaLabel}
                    </button>
                )}
                {ctaError && (
                    <div className="mt-3 max-w-xs text-[11px] text-amber-300 bg-amber-950/50 border border-amber-700/50 rounded-lg px-3 py-2 text-center">
                        ⚠ {ctaError}
                    </div>
                )}
            </div>
        </div>
    );
}