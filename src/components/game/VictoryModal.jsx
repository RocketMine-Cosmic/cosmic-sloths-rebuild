import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ARENAS } from '../../game/Constants';
import RunStatsBox from './RunStatsBox';
import MeteorLevelUpBanner from './MeteorLevelUpBanner';

export default function VictoryModal({ stats }) {
    const navigate = useNavigate();

    // Two-stage timeout (matches GameOverModal) — 8s = "still saving" hint,
    // 25s = give up + show "queued for retry". The client's 4-retry loop finishes
    // by ~12s worst case, so 25s is comfortable headroom that only trips on
    // genuine network/server hangs.
    const [slow, setSlow] = useState(false);
    const [timedOut, setTimedOut] = useState(false);
    useEffect(() => {
        if (stats._serverConfirmed || stats._saveFailed) return;
        const slowT = setTimeout(() => setSlow(true), 8000);
        const finalT = setTimeout(() => setTimedOut(true), 25000);
        return () => { clearTimeout(slowT); clearTimeout(finalT); };
    }, [stats._serverConfirmed, stats._saveFailed]);
    const showButtons = !!stats._serverConfirmed || stats._saveFailed || timedOut;

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-2 sm:p-4"
            style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 0.5rem)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.5rem)',
            }}
        >
            <motion.div
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-slate-900 border-2 border-yellow-500 rounded-xl max-w-md w-full text-center flex flex-col max-h-full overflow-hidden"
            >
                <div className="p-4 sm:p-6 md:p-8 pb-2 md:pb-4 shrink-0">
                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-yellow-500 mb-1 sm:mb-2 font-mono">MISSION ACCOMPLISHED</h2>
                    <p className="text-xs sm:text-sm md:text-base text-slate-400">You survived the cosmic onslaught!</p>
                </div>

                <div className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 min-h-0">
                    <RunStatsBox stats={stats} accentClass="border-slate-700" hideKilledBy />
                    <MeteorLevelUpBanner stats={stats} />
                </div>

                <div className="p-4 sm:p-6 md:p-8 pt-2 md:pt-4 shrink-0">
                    {(stats._saveFailed || timedOut) && (
                        <div className="mb-3 text-center text-[11px] md:text-xs text-emerald-200 bg-emerald-950/40 border border-emerald-500/40 rounded-lg px-3 py-2">
                            {stats._authExpired
                                ? '✓ Your victory is safely saved on this device. Your sign-in timed out during this long session — we\'ll auto-submit it the next time you launch the game.'
                                : timedOut && !stats._saveFailed
                                    ? '✓ Victory saved locally. The server is taking a moment — we\'ll auto-submit it in the background. Feel free to keep playing.'
                                    : '✓ Victory saved locally. We\'ll auto-submit it as soon as your connection\'s back — nothing is lost.'}
                        </div>
                    )}
                    {/* Wait until the server has saved this run before letting the player start a new one — otherwise the in-flight save could clobber the new run's progress. */}
                    {!showButtons ? (
                        <div className="text-center text-xs md:text-sm text-slate-400 italic flex items-center justify-center gap-2">
                            <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin inline-block" />
                            {slow ? 'Almost there… banking your victory' : 'Saving your run…'}
                        </div>
                    ) : (
                        (() => {
                            const isRaid = stats.arenaId === 'world_boss_arena';
                            const isMeteor = stats.arenaId === 'quantum_meteor';
                            if (isMeteor) {
                                // Meteor runs land back on the Squads page (slide 5)
                                // so the player sees their updated meteor immediately.
                                return (
                                    <div className="flex justify-center">
                                        <button
                                            onClick={() => navigate('/?slide=5', { state: { slide: 5 } })}
                                            className="bg-yellow-600 hover:bg-yellow-500 text-slate-900 px-4 md:px-6 py-2.5 md:py-3 rounded-lg font-bold transition-colors text-sm md:text-base w-full sm:w-auto"
                                        >
                                            Return to Squad
                                        </button>
                                    </div>
                                );
                            }
                            if (isRaid) {
                                return (
                                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 md:gap-4 justify-center">
                                        <button
                                            onClick={() => navigate('/?slide=11', { state: { slide: 11 } })}
                                            className="bg-yellow-600 hover:bg-yellow-500 text-slate-900 px-4 md:px-6 py-2.5 md:py-3 rounded-lg font-bold transition-colors text-sm md:text-base w-full sm:w-auto"
                                        >
                                            Exit to Global Raid
                                        </button>
                                        <button
                                            onClick={() => {
                                                navigate('/game', { state: { characterId: stats.characterId, arenaId: stats.arenaId, difficultyId: stats.difficultyId || 'normal', isEndless: false, startingWeaponId: stats.startingWeaponId, worldBossId: stats.worldBossId, worldBossName: stats.worldBossName, _retry: Date.now() }, replace: true });
                                            }}
                                            className="bg-red-600 hover:bg-red-500 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-lg font-bold transition-colors text-sm md:text-base w-full sm:w-auto"
                                        >
                                            Try Again
                                        </button>
                                    </div>
                                );
                            }
                            return (
                                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 md:gap-4 justify-center">
                                    <button
                                        onClick={() => navigate('/', { state: { slide: 1 } })}
                                        className="bg-yellow-600 hover:bg-yellow-500 text-slate-900 px-4 md:px-6 py-2.5 md:py-3 rounded-lg font-bold transition-colors text-sm md:text-base w-full sm:w-auto"
                                    >
                                        Return to Lounge
                                    </button>
                                    {(() => {
                                        // "Next Sector" must skip hidden arenas like Squad Meteor
                                        // (Texxy bug 2026-05-14 — finishing Rainbow Rift dropped
                                        // players into the squad meteor by index). If the player
                                        // is already on the last real sector, hide the button.
                                        const pickable = ARENAS.filter(a => !a.hideFromArenaPicker);
                                        const idx = pickable.findIndex(a => a.id === stats.arenaId);
                                        if (idx < 0 || idx >= pickable.length - 1) return null;
                                        const nextArena = pickable[idx + 1];
                                        return (
                                            <button
                                                onClick={() => navigate('/game', { state: { characterId: stats.characterId, arenaId: nextArena.id, difficultyId: stats.difficultyId || 'normal', isEndless: stats.isEndless || false, startingWeaponId: stats.startingWeaponId, _retry: Date.now() }, replace: true })}
                                                className="bg-yellow-600 hover:bg-yellow-500 text-slate-900 px-4 md:px-6 py-2.5 md:py-3 rounded-lg font-bold transition-colors text-sm md:text-base w-full sm:w-auto"
                                            >
                                                Try Next Sector
                                            </button>
                                        );
                                    })()}
                                </div>
                            );
                        })()
                    )}
                </div>
            </motion.div>
        </div>
    );
}