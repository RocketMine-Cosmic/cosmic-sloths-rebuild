import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Zap } from 'lucide-react';

// Listens for `synergyFormed` and `weaponEvolved` window events dispatched by
// the game engine, and shows a short celebratory banner naming the new weapon.
// Pure UI — no game logic.
export default function SynergyBanner() {
    const [event, setEvent] = useState(null); // { kind: 'synergy'|'evolution', name, from }

    useEffect(() => {
        let timer;
        const onSynergy = (e) => {
            const detail = e.detail || {};
            setEvent({ kind: 'synergy', name: detail.name || 'Synergy', from: detail.from || [] });
            clearTimeout(timer);
            timer = setTimeout(() => setEvent(null), 3500);
        };
        const onEvolution = (e) => {
            const detail = e.detail || {};
            setEvent({ kind: 'evolution', name: detail.name || 'Evolved Weapon', from: detail.from || [] });
            clearTimeout(timer);
            timer = setTimeout(() => setEvent(null), 3500);
        };
        window.addEventListener('synergyFormed', onSynergy);
        window.addEventListener('weaponEvolved', onEvolution);
        return () => {
            window.removeEventListener('synergyFormed', onSynergy);
            window.removeEventListener('weaponEvolved', onEvolution);
            clearTimeout(timer);
        };
    }, []);

    const isEvo = event?.kind === 'evolution';
    const headerLabel = isEvo ? 'WEAPON EVOLVED!' : 'SYNERGY FORMED!';
    const Icon = isEvo ? Zap : Sparkles;
    const tone = isEvo
        ? { ring: 'border-orange-400', glow: 'shadow-[0_0_30px_rgba(251,146,60,0.7)]', headerColor: 'text-orange-300', from: 'from-orange-500/40', via: 'via-red-500/30', to: 'to-orange-500/40' }
        : { ring: 'border-fuchsia-400', glow: 'shadow-[0_0_30px_rgba(232,121,249,0.7)]', headerColor: 'text-fuchsia-300', from: 'from-fuchsia-500/40', via: 'via-purple-500/30', to: 'to-fuchsia-500/40' };

    return (
        <div className="fixed inset-x-0 top-[18%] flex justify-center pointer-events-none z-[55] px-4">
            <AnimatePresence>
                {event && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, scale: 0.85 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                        className={`relative bg-gradient-to-r ${tone.from} ${tone.via} ${tone.to} backdrop-blur-md border-2 ${tone.ring} rounded-xl px-4 md:px-6 py-2.5 md:py-3 ${tone.glow} max-w-[92vw]`}
                    >
                        <div className="flex items-center gap-2 md:gap-3">
                            <Icon className={`w-5 h-5 md:w-6 md:h-6 ${tone.headerColor} animate-pulse shrink-0`} />
                            <div className="min-w-0">
                                <div className={`text-[10px] md:text-xs font-black tracking-[0.2em] uppercase ${tone.headerColor} leading-tight`}>
                                    {headerLabel}
                                </div>
                                <div className="text-base md:text-2xl font-black text-white tracking-wide leading-tight truncate">
                                    {event.name}
                                </div>
                                {event.from.length > 0 && (
                                    <div className="text-[10px] md:text-xs text-slate-200/80 mt-0.5 truncate">
                                        {event.from.join(' + ')}
                                    </div>
                                )}
                            </div>
                            <Icon className={`w-5 h-5 md:w-6 md:h-6 ${tone.headerColor} animate-pulse shrink-0`} />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}