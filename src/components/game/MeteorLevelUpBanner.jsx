import React from 'react';
import { motion } from 'framer-motion';

// Run-end celebration banner — shown when a Squad Meteor run's damage submission
// pushed the squad's shared meteor past one or more level thresholds. Reads from
// stats.meteorLevelUp = { levels_gained: [N+1, ...], new_level: number }.
export default function MeteorLevelUpBanner({ stats }) {
    if (stats?.arenaId !== 'quantum_meteor') return null;
    const lvlUp = stats.meteorLevelUp;
    if (!lvlUp || !lvlUp.leveled_up) return null;

    const count = lvlUp.levels_gained?.length || 1;
    const newLevel = lvlUp.new_level ?? lvlUp.levels_gained?.[lvlUp.levels_gained.length - 1];
    const firstLevel = lvlUp.levels_gained?.[0];

    return (
        <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.1 }}
            className="my-3 rounded-xl border-2 border-orange-500/70 bg-gradient-to-br from-orange-950/70 via-red-950/60 to-purple-950/60 shadow-[0_0_30px_rgba(249,115,22,0.4)] p-3"
        >
            <div className="flex items-center justify-center gap-2 mb-1">
                <span className="text-2xl drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]">☄️</span>
                <span className="text-xs font-black uppercase tracking-[0.2em] text-orange-300">
                    Meteor Shattered
                </span>
                <span className="text-2xl drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]">💥</span>
            </div>
            <div className="text-center text-sm font-bold text-white">
                {count > 1 ? (
                    <>Your run pushed the squad meteor up <span className="text-orange-300">{count} levels</span> — now <span className="text-yellow-300">Lv.{newLevel}</span>!</>
                ) : (
                    <>Your run pushed the squad meteor to <span className="text-yellow-300">Lv.{newLevel}</span>!</>
                )}
            </div>
            <div className="text-center text-[10px] text-slate-400 mt-1">
                Squad buffs just got stronger for everyone.
            </div>
        </motion.div>
    );
}