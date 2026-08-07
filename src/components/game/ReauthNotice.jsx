import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

const KEY = 'omen_reauth_notice';

const MESSAGES = {
    weekly: {
        title: 'Weekly session refresh',
        body: 'Sign in and reconnect your wallet to keep balances, purchases and rewards working.',
    },
    stale: {
        title: 'Wallet session expired',
        body: 'We signed you out. Sign in and reconnect your wallet — nothing was lost and you were not charged.',
    },
    unrecognized: {
        title: 'Balance temporarily unavailable',
        body: "We can't read your OMENX balance right now, so it may look out of date. Your wallet is fine — purchases, rewards and saves all still work as normal.",
    },
};

// Explains WHY the player was suddenly signed out. forceOmenReauth writes the
// flag just before dropping the session; omenx.js clears it once fresh auth
// lands. Same top-banner treatment as SessionExpiredBanner.
export default function ReauthNotice() {
    const [msg, setMsg] = useState(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const read = () => {
            try {
                const raw = localStorage.getItem(KEY);
                if (!raw) { setMsg(null); return; }
                const { kind } = JSON.parse(raw);
                setMsg(MESSAGES[kind] || MESSAGES.stale);
            } catch { setMsg(null); }
        };
        read();
        window.addEventListener('storage', read);
        return () => window.removeEventListener('storage', read);
    }, []);

    if (!msg || dismissed) return null;

    return (
        <div className="fixed top-16 md:top-20 left-1/2 -translate-x-1/2 z-[60] max-w-[90vw] md:max-w-md pointer-events-auto">
            <div className="bg-amber-950/95 border-2 border-amber-500 rounded-lg px-3 py-2 md:px-4 md:py-2.5 shadow-[0_0_15px_rgba(245,158,11,0.4)] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 text-[11px] md:text-xs text-amber-100 leading-tight">
                    <div className="font-bold text-amber-300 mb-0.5">{msg.title}</div>
                    <div>{msg.body}</div>
                </div>
                <button
                    onClick={() => setDismissed(true)}
                    className="text-amber-400 hover:text-amber-200 text-lg leading-none px-1"
                    title="Dismiss"
                >
                    ×
                </button>
            </div>
        </div>
    );
}