import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Skull, Zap, Activity } from 'lucide-react';
import { sanitizePilotName } from '@/lib/sanitizePilotName';

// Historical GlobalBossEvent rows have player names baked into `message`.
// Re-derive the message from `player_name` (which is sanitized at render time)
// so we don't show real names from pre-fix events. Falls back to the original
// message when we can't reconstruct (e.g. system messages without a name).
function sanitizeMessage(evt) {
    const original = evt?.message || '';
    const safeName = sanitizePilotName(evt?.player_name, evt?.user_id || '');
    if (!evt?.player_name || !original.includes(evt.player_name)) return original;
    return original.split(evt.player_name).join(safeName);
}

// Compact rotating banner that cycles through the most recent raid events.
// Shown above the Raid Event / Top Contributors tabs so it's always visible.
export default function LiveActivityBanner({ events }) {
    const [idx, setIdx] = useState(0);

    // Reset to newest event whenever the feed changes.
    useEffect(() => { setIdx(0); }, [events?.length]);

    // Auto-rotate through the events every 4s. Skip if there's only one.
    useEffect(() => {
        if (!events || events.length <= 1) return;
        const t = setInterval(() => {
            setIdx(i => (i + 1) % events.length);
        }, 4000);
        return () => clearInterval(t);
    }, [events]);

    if (!events || events.length === 0) return null;
    const evt = events[idx];
    const isKill = evt.event_type === 'kill';

    return (
        <div className="w-full max-w-2xl mb-2 md:mb-3 bg-slate-950/70 border border-cyan-500/40 rounded-lg px-3 py-2 overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.15)]">
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 shrink-0 text-[9px] md:text-[10px] font-black tracking-widest uppercase text-cyan-400">
                    <Activity className="w-3 h-3 md:w-3.5 md:h-3.5 animate-pulse" />
                    <span className="hidden sm:inline">Live</span>
                </div>
                <div className="h-4 w-px bg-cyan-500/30 shrink-0" />
                <div className="flex-1 min-w-0 relative h-5 md:h-6">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={evt.id || idx}
                            initial={{ y: 10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -10, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="absolute inset-0 flex items-center gap-2"
                        >
                            <div className={`shrink-0 p-1 rounded-full ${isKill ? 'bg-red-500/20 text-red-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                                {isKill ? <Skull className="w-2.5 h-2.5 md:w-3 md:h-3" /> : <Zap className="w-2.5 h-2.5 md:w-3 md:h-3" />}
                            </div>
                            <div className="text-[11px] md:text-xs text-slate-200 truncate">
                                {sanitizeMessage(evt)}
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </div>
                {events.length > 1 && (
                    <div className="text-[9px] md:text-[10px] text-slate-500 font-mono shrink-0">
                        {idx + 1}/{events.length}
                    </div>
                )}
            </div>
        </div>
    );
}