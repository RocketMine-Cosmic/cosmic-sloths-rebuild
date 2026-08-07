import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

// Listens for the `sessionExpiredDuringRun` event (fired by useSessionKeepAlive
// when consecutive auth pings fail). Shows a non-blocking banner urging the
// player to end the run gracefully so progress can be queued + auto-recovered
// on next launch. Does NOT auto-end the run (player choice).
export default function SessionExpiredBanner() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const onExpired = () => setVisible(true);
        window.addEventListener('sessionExpiredDuringRun', onExpired);
        return () => window.removeEventListener('sessionExpiredDuringRun', onExpired);
    }, []);

    if (!visible) return null;

    return (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] max-w-[90vw] md:max-w-md pointer-events-auto">
            <div className="bg-amber-950/95 border-2 border-amber-500 rounded-lg px-3 py-2 md:px-4 md:py-2.5 shadow-[0_0_15px_rgba(245,158,11,0.4)] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 text-[11px] md:text-xs text-amber-100 leading-tight">
                    <div className="font-bold text-amber-300 mb-0.5">Sign-in expired</div>
                    <div>Your run is still going, but won't sync directly. End the run when ready — progress will be queued and saved on next launch.</div>
                </div>
                <button
                    onClick={() => setVisible(false)}
                    className="text-amber-400 hover:text-amber-200 text-lg leading-none px-1"
                    title="Dismiss"
                >
                    ×
                </button>
            </div>
        </div>
    );
}