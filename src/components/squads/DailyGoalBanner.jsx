import React, { useEffect, useState } from 'react';
import { Target, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { getOmenXUserSync } from '@/lib/omenxUser';

// Floating banner that shows the squad's active daily goal to every member.
//
// Load discipline (2026-05-14): this component sits in the global App tree, so
// it runs on EVERY page for EVERY logged-in player. The old version polled
// every 60s with 2 sequential calls (SquadMember.filter + squadActions) —
// at 1k concurrent users that was ~2k DB ops/min just to maintain a banner.
//
// Now:
//   • Membership comes from the cached `squad_membership_<wallet>` key written
//     by Squads.jsx. No SquadMember.filter call on the global banner anymore.
//   • Poll interval bumped to 5 min (daily goals change at most once a day).
//   • Polling pauses when the tab is hidden.
//   • If we know the player isn't in a squad, we skip the API call entirely.
export default function DailyGoalBanner() {
    const [goal, setGoal] = useState(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let interval = null;

        const tick = async () => {
            try {
                const user = getOmenXUserSync();
                const wallet = user?.walletAddress;
                if (!wallet) return;
                // Read membership from the cache Squads.jsx maintains. No DB call.
                let squadId = null;
                try {
                    const cached = localStorage.getItem(`squad_membership_${wallet}`);
                    if (cached) squadId = JSON.parse(cached)?.squad_id || null;
                } catch {}
                if (!squadId) {
                    if (!cancelled) setGoal(null);
                    return;
                }

                const res = await base44.functions.invoke('squadActions', { action: 'getDailyGoal', squadId });
                if (cancelled) return;
                const g = res.data?.goal || null;
                setGoal(g);
                if (g) {
                    const dismissKey = `daily_goal_dismissed_${g.id}`;
                    setDismissed(sessionStorage.getItem(dismissKey) === '1');
                }
            } catch {}
        };

        const start = () => {
            if (interval) return;
            tick();
            interval = setInterval(tick, 5 * 60_000); // 5 min — daily goals change at most once/day
        };
        const stop = () => {
            if (interval) { clearInterval(interval); interval = null; }
        };
        const onVis = () => {
            if (document.visibilityState === 'visible') start();
            else stop();
        };
        if (document.visibilityState === 'visible') start();
        document.addEventListener('visibilitychange', onVis);

        return () => {
            cancelled = true;
            stop();
            document.removeEventListener('visibilitychange', onVis);
        };
    }, []);

    if (!goal || dismissed) return null;

    const handleDismiss = () => {
        try { sessionStorage.setItem(`daily_goal_dismissed_${goal.id}`, '1'); } catch {}
        setDismissed(true);
    };

    return (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-gradient-to-r from-amber-700/95 via-orange-600/95 to-amber-700/95 border-b border-amber-400/50 shadow-lg backdrop-blur">
            <div className="max-w-5xl mx-auto px-3 py-1.5 md:py-2 flex items-center gap-2 md:gap-3">
                <Target className="w-4 h-4 md:w-5 md:h-5 text-amber-100 shrink-0" />
                <div className="min-w-0 flex-1">
                    <span className="text-[10px] md:text-xs font-black uppercase tracking-widest text-amber-200 mr-2">Squad Goal</span>
                    <span className="text-xs md:text-sm font-bold text-white truncate">{goal.label}</span>
                </div>
                <span className="hidden md:inline text-[10px] text-amber-200/70">— set by {goal.set_by_name}</span>
                <button
                    onClick={handleDismiss}
                    className="text-amber-100 hover:text-white p-1 rounded shrink-0"
                    aria-label="Dismiss"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}