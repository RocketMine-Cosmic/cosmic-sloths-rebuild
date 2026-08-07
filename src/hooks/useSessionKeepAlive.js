// Long endless runs (>1hr) can outlive the Base44 auth session, causing saveScore
// to fail with 401 at run-end. This hook keeps the session warm by pinging
// base44.auth.me() periodically during gameplay — each ping refreshes the session's
// activity timestamp on the server. If the ping fails (already expired), we fire
// a window event so the UI can warn the player and offer to end the run early
// while there might still be a graceful exit path.
import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export function useSessionKeepAlive(active) {
    useEffect(() => {
        if (!active) return;
        let cancelled = false;
        let consecutiveFailures = 0;

        const ping = async () => {
            if (cancelled) return;
            try {
                const me = await base44.auth.me();
                if (cancelled) return;
                if (me?.id) {
                    consecutiveFailures = 0;
                } else {
                    // me() returned but no user — treat as expired.
                    consecutiveFailures++;
                }
            } catch (e) {
                consecutiveFailures++;
                console.warn('[keepAlive] ping failed:', e?.message || e);
            }

            // Two consecutive failures → fire warning event so UI can react.
            if (consecutiveFailures >= 2) {
                console.warn('[keepAlive] Session appears expired — notifying UI.');
                try {
                    window.dispatchEvent(new CustomEvent('sessionExpiredDuringRun'));
                } catch {}
            }
        };

        const id = setInterval(ping, KEEP_ALIVE_INTERVAL_MS);
        // Don't ping immediately on mount — the run just started, session is fresh.
        return () => { cancelled = true; clearInterval(id); };
    }, [active]);
}