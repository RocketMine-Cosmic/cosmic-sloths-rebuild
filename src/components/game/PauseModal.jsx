import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import SettingsModal from './SettingsModal';
import PlayerStatsPanel from './PlayerStatsPanel';

const XP_BUFF_COST = 10;
const ULT_LITE_COST = 5;
const ULT_FULL_COST = 10;

export default function PauseModal({ onResume, onQuit, onRestart, onHideHud, engineRef, onBuyXpBuff, onSquadUltimate, omenxBalance = 0, xpBuffExpiry = 0, omenxPurchasesDisabled = false }) {
    const [showSettings, setShowSettings] = useState(false);
    const [confirmRestart, setConfirmRestart] = useState(false);
    const [confirmQuit, setConfirmQuit] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const [lowFx, setLowFx] = useState(() => {
        try { return localStorage.getItem('cosmic_low_fx_mode') === '1'; } catch { return false; }
    });
    // Live tick so the "X:XX left" countdown updates while the menu is open.
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    const buffActive = xpBuffExpiry > now;
    const buffMinsLeft = buffActive ? Math.max(0, Math.ceil((xpBuffExpiry - now) / 60000)) : 0;
    const canAfford = omenxBalance >= XP_BUFF_COST;

    // Player identity card — read from the canonical save.profile written by syncSave.
    // Falls back to legacy top-level fields if profile object hasn't hydrated yet.
    // Shown so players can confirm their callsign/title/icon are set correctly mid-run
    // (Waeoo bug 2026-05-14 — callsigns were falling off without anyone noticing).
    const save = engineRef?.current?.save || {};
    const profile = save.profile || {};
    const pilotIcon = profile.pilot_icon || save.pilot_icon || '🚀';
    const pilotName = profile.player_name || save.player_name || save.pilotName || 'Pilot';
    const pilotTitle = profile.player_title || save.player_title || '';

    return (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto">
            <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-slate-900 border-2 border-cyan-500 p-6 md:p-8 rounded-xl max-w-sm w-full text-center my-auto"
            >
                <h2 className="text-3xl md:text-4xl font-bold text-cyan-400 mb-2 font-mono">PAUSED</h2>

                {/* Identity card — lets players verify their callsign hasn't fallen off mid-run */}
                <div className="mb-4 mx-auto inline-flex items-center gap-2 bg-slate-800/60 border border-cyan-500/30 rounded-lg px-3 py-1.5">
                    <span className="text-xl leading-none">{pilotIcon}</span>
                    <div className="text-left leading-tight">
                        <div className="text-cyan-200 text-sm font-bold font-mono">{pilotName}</div>
                        {pilotTitle && <div className="text-cyan-400/70 text-[10px] uppercase tracking-wide">{pilotTitle}</div>}
                    </div>
                </div>

                <button
                    onClick={() => setShowStats(s => !s)}
                    className="text-xs text-cyan-300 hover:text-cyan-200 underline underline-offset-2 mb-4"
                >
                    {showStats ? 'Hide live build stats' : 'Show live build stats'}
                </button>

                {showStats && <PlayerStatsPanel engineRef={engineRef} />}
                
                <div className="flex flex-col gap-4 mt-4">
                    <button
                        onClick={onResume}
                        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-4 rounded-lg font-bold text-lg md:text-xl transition-colors shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                    >
                        Resume
                    </button>
                    <button
                        onClick={() => setShowSettings(true)}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-white px-6 py-4 rounded-lg font-bold text-lg md:text-xl transition-colors shadow-[0_0_15px_rgba(51,65,85,0.4)]"
                    >
                        Settings
                    </button>
                    <button
                        onClick={() => {
                            const next = !lowFx;
                            setLowFx(next);
                            try { localStorage.setItem('cosmic_low_fx_mode', next ? '1' : '0'); } catch {}
                        }}
                        className={`w-full px-6 py-3 rounded-lg font-bold text-sm md:text-base transition-colors border ${
                            lowFx
                                ? 'bg-cyan-900/60 border-cyan-500 text-cyan-200 hover:bg-cyan-900/80'
                                : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
                        }`}
                        title="Reduce particle effects to keep phone cool"
                    >
                        {lowFx ? '✓ Low FX ON' : '✕ Low FX OFF'}
                    </button>
                    {/* Squad ULTs — moved from in-run HUD to here so accidental
                        taps mid-fight can't burn OMENX. Player taps in pause menu,
                        confirms the OMENX charge, then resumes — clone spawns on
                        the next unpaused tick. */}
                    {onSquadUltimate && (
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => onSquadUltimate('lite')}
                                disabled={omenxBalance < ULT_LITE_COST || omenxPurchasesDisabled}
                                className="bg-purple-700 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-3 rounded-lg font-bold text-sm md:text-base transition-colors shadow-[0_0_15px_rgba(168,85,247,0.35)] flex flex-col items-center justify-center gap-0.5 border-2 border-purple-500"
                                title={omenxPurchasesDisabled ? 'OMENX purchases temporarily disabled' : 'Spawn a capped-power squad clone'}
                            >
                                <span className="text-xs md:text-sm tracking-wider uppercase">Squad ULT Lite</span>
                                <span className="bg-black/30 px-2 py-0.5 rounded text-[10px] font-mono">{ULT_LITE_COST} OMENX</span>
                            </button>
                            <button
                                onClick={() => onSquadUltimate('full')}
                                disabled={omenxBalance < ULT_FULL_COST || omenxPurchasesDisabled}
                                className="bg-fuchsia-700 hover:bg-fuchsia-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-3 rounded-lg font-bold text-sm md:text-base transition-colors shadow-[0_0_15px_rgba(217,70,239,0.35)] flex flex-col items-center justify-center gap-0.5 border-2 border-fuchsia-500"
                                title={omenxPurchasesDisabled ? 'OMENX purchases temporarily disabled' : 'Spawn a full-power squad clone scaled to your upgrades'}
                            >
                                <span className="text-xs md:text-sm tracking-wider uppercase">Squad ULT Full</span>
                                <span className="bg-black/30 px-2 py-0.5 rounded text-[10px] font-mono">{ULT_FULL_COST} OMENX</span>
                            </button>
                        </div>
                    )}
                    {onBuyXpBuff && (
                        buffActive ? (
                            <div className="w-full bg-emerald-950/50 border-2 border-emerald-500/60 rounded-lg px-4 py-3 flex items-center justify-center gap-2 text-emerald-300">
                                <Sparkles className="w-4 h-4" />
                                <span className="font-bold text-sm md:text-base">+50% XP active — {buffMinsLeft}m left</span>
                            </div>
                        ) : (
                            <button
                                onClick={onBuyXpBuff}
                                disabled={!canAfford || omenxPurchasesDisabled}
                                className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-bold text-base md:text-lg transition-all shadow-[0_0_15px_rgba(16,185,129,0.4)] flex items-center justify-center gap-2"
                                title={omenxPurchasesDisabled ? 'OMENX purchases are temporarily disabled' : (canAfford ? 'Apply +50% XP for 1 hour' : `Need ${XP_BUFF_COST} OMENX`)}
                            >
                                <Sparkles className="w-4 h-4" />
                                +50% XP (1h)
                                <span className="bg-black/30 px-2 py-0.5 rounded text-xs font-mono">{XP_BUFF_COST} OMENX</span>
                            </button>
                        )
                    )}
                    {onHideHud && (
                        <button
                            onClick={onHideHud}
                            className="w-full bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-lg font-bold text-base md:text-lg transition-colors border border-slate-600"
                            title="Hide all UI for clean screenshots"
                        >
                            📸 Hide HUD (Screenshot)
                        </button>
                    )}
                    {onRestart && (
                        confirmRestart ? (
                            <div className="flex flex-col gap-2 bg-orange-950/40 border border-orange-500/40 rounded-lg p-3">
                                <p className="text-orange-300 text-sm font-bold">Restart this run? Progress will be lost.</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={onRestart}
                                        className="flex-1 bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg font-bold transition-colors"
                                    >
                                        Yes, Restart
                                    </button>
                                    <button
                                        onClick={() => setConfirmRestart(false)}
                                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-bold border border-slate-600 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setConfirmRestart(true)}
                                className="w-full bg-orange-700 hover:bg-orange-600 text-white px-6 py-4 rounded-lg font-bold text-lg md:text-xl transition-colors shadow-[0_0_15px_rgba(234,88,12,0.4)]"
                            >
                                Restart Run
                            </button>
                        )
                    )}
                    {confirmQuit ? (
                        <div className="flex flex-col gap-2 bg-red-950/40 border border-red-500/40 rounded-lg p-3">
                            <p className="text-red-300 text-sm font-bold">Quit this run? All progress will be lost.</p>
                            <div className="flex gap-2">
                                <button
                                    onClick={onQuit}
                                    className="flex-1 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-bold transition-colors"
                                >
                                    Yes, Quit
                                </button>
                                <button
                                    onClick={() => setConfirmQuit(false)}
                                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-bold border border-slate-600 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() => setConfirmQuit(true)}
                            className="w-full bg-slate-800 hover:bg-slate-700 text-white px-6 py-4 rounded-lg font-bold text-lg md:text-xl transition-colors border border-slate-600"
                        >
                            Quit to Lounge
                        </button>
                    )}
                </div>
            </motion.div>

            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        </div>
    );
}