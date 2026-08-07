import React, { useState } from 'react';
import { Pause, Heart, CircleDollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import { isS6OrLater } from '@/lib/seasonGate';
import DynamicDifficultyPill from './DynamicDifficultyPill';

function OmenXIcon({ className }) {
    return <img src="/assets/69de258a7e072380b89d66e3/01838179d_omenx_logo.png" className={className} alt="OMENX" />;
}

// Endless-mode reward caps — must mirror functions/saveScore.js EXACTLY.
// Cap = clamp(time_seconds * 12, 1000, 10000). Anything above this isn't credited.
const ENDLESS_GOLD_PER_SEC = 12;
const ENDLESS_GOLD_FLOOR = 1000;
const ENDLESS_GOLD_HARD_CEILING = 10000;
const computeEndlessGoldCap = (timeSec) =>
    Math.min(ENDLESS_GOLD_HARD_CEILING, Math.max(ENDLESS_GOLD_FLOOR, Math.floor((timeSec || 0) * ENDLESS_GOLD_PER_SEC)));

// UpgradeSystem prefixes every upgrade with "<CharName>'s " for flavour, but the HUD
// is space-constrained on mobile so the unique part ("Plasma Core", "Hyperdrive Fuel"…)
// gets truncated and every passive looks the same ("SkyByte's …"). Strip the prefix
// for HUD display only — the full name remains in the tooltip via title="".
const stripOwnerPrefix = (name) => {
    if (!name) return name;
    const apos = name.indexOf("'s ");
    if (apos > 0 && apos < 20) return name.slice(apos + 3);
    return name;
};

function UIOverlay({ hp, maxHp, time, duration, level, xp, xpRequired, gold, omenxBalance = 0, weapons = [], passives = [], score = 0, dps = 0, kills = 0, killsCapped = false, boss = null, xpBuffActive = false, xpBuffExpiry = 0, onPause, omenxPurchasesDisabled = false, arenaId = '', ddMult = 1.0 }) {
    // Squad Meteor runs don't feed the leaderboard — score has no meaning there,
    // so hide the row to avoid confusing players who think it matters.
    const isMeteorRun = arenaId === 'quantum_meteor';
    // Collapse loadout list by default on mobile so the pause button + top row stay visible.
    // Players can tap the HP bar to expand and review their build.
    const [loadoutCollapsed, setLoadoutCollapsed] = useState(true);

    // Aggregate passives once so both the count badge and the expanded list use the same data.
    const aggregatedPassives = Object.values(passives.reduce((acc, p) => {
        if (!acc[p.id]) acc[p.id] = { ...p, level: 0 };
        acc[p.id].level += 1;
        return acc;
    }, {}));

    const formatTime = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    // S6+ removes endless gold caps AND the non-endless gold-per-kill rejection cap
    // entirely (see functions/saveScore.js — !isS6OrLater gates around both checks).
    // The HUD must mirror that, otherwise S6 players see "MAX"/"OVER" badges that
    // never trigger any actual server clamping. Pre-S6 keeps the legacy display.
    const _isS6 = isS6OrLater();
    const isEndless = duration === Infinity;
    const endlessCap = (!_isS6 && isEndless) ? computeEndlessGoldCap(time) : Infinity;
    const displayGold = (!_isS6 && isEndless) ? Math.min(gold, endlessCap) : gold;
    const goldCapped = !_isS6 && isEndless && gold >= endlessCap;

    // Non-endless rejection warning: server rejects runs where gold > 50k + (kills × 2000).
    // Show a warning badge when the player is within 10% of the limit so they know
    // before the run ends. Endless has its own MAX badge above; this is for normal sectors.
    // S6+: server no longer rejects on this rule, so suppress the badge entirely.
    const nonEndlessGoldCap = (!_isS6 && !isEndless) ? 50000 + (kills * 2000) : Infinity;
    const goldOverLimit = !_isS6 && !isEndless && gold > nonEndlessGoldCap * 0.9;
    // Kills cap badge — same story. S6 server no longer caps kills, so the
    // "MAX" pip on the kills tile would be a lie. Pass-through prop only matters on S5.
    const showKillsCapped = !_isS6 && killsCapped;

    return (
        <div className="absolute inset-0 pointer-events-none p-2 md:p-4 flex flex-col justify-between font-sans select-none z-40">
            <div className="flex justify-between items-start gap-1 md:gap-4">
                {/* Top Left: HP & Equipped — collapsible on mobile so the loadout list doesn't push the pause button off-screen. */}
                <div className={`pointer-events-auto shrink-0 flex flex-col gap-2 ${loadoutCollapsed ? 'w-16 md:w-24' : 'w-32 md:w-52'}`}>
                    <div className="bg-[#0b0416]/90 p-1.5 md:p-3 rounded-lg border border-red-500/30">
                        <div className="flex justify-between items-center mb-1 text-[9px] md:text-sm font-bold text-slate-200">
                            <span className="flex items-center gap-0.5 md:gap-1 text-red-400"><Heart className="w-3 h-3 md:w-4 md:h-4 fill-current" /> <span className="hidden md:inline">HP</span></span>
                            <span className="font-mono">{Math.floor(hp)}<span className="text-slate-500">/{maxHp}</span></span>
                        </div>
                        <div className="w-full bg-slate-950 h-1.5 md:h-2 rounded-full overflow-hidden border border-slate-800">
                            <div 
                                className="h-full transition-all duration-200 bg-gradient-to-r from-red-600 to-red-400" 
                                style={{ width: `${Math.max(0, (hp / maxHp) * 100)}%` }}
                            />
                        </div>
                    </div>

                    {/* Loadout toggle — tap to expand/collapse weapons + passives */}
                    {(weapons.length > 0 || aggregatedPassives.length > 0) && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setLoadoutCollapsed(c => !c); }}
                            className="bg-[#0b0416]/80 border border-slate-700 hover:border-cyan-500/60 rounded px-1.5 py-1 flex items-center justify-between gap-1 text-[9px] md:text-xs font-bold text-slate-300 transition-colors"
                            title={loadoutCollapsed ? 'Show loadout' : 'Hide loadout'}
                        >
                            <span className="flex items-center gap-1.5">
                                <span className="text-cyan-400">⚔ {weapons.length}</span>
                                <span className="text-purple-400">✦ {aggregatedPassives.length}</span>
                            </span>
                            {loadoutCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                        </button>
                    )}

                    {/* Equipped Weapons */}
                    {!loadoutCollapsed && weapons.length > 0 && (
                        <div className="flex flex-col gap-1">
                            {weapons.map(w => (
                                <div key={w.id} className="bg-[#0b0416]/60 backdrop-blur-sm border border-cyan-500/30 rounded px-1.5 py-1 flex items-center justify-between gap-1 min-w-0">
                                    <div className="text-[9px] md:text-xs text-cyan-400 font-bold truncate flex-1 min-w-0" title={w.name}>{stripOwnerPrefix(w.name)}</div>
                                    <div className="text-[7px] md:text-[10px] bg-cyan-950/80 text-cyan-200 px-1 rounded border border-cyan-500/50 shrink-0">Lv.{w.level}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Equipped Passives */}
                    {!loadoutCollapsed && aggregatedPassives.length > 0 && (
                        <div className="flex flex-col gap-1">
                            {aggregatedPassives.map(p => (
                                <div key={p.id} className="bg-[#0b0416]/60 backdrop-blur-sm border border-purple-500/30 rounded px-1.5 py-1 flex items-center justify-between gap-1 min-w-0">
                                    <div className="text-[9px] md:text-xs text-purple-400 font-bold truncate flex-1 min-w-0" title={p.name}>{stripOwnerPrefix(p.name)}</div>
                                    <div className="text-[7px] md:text-[10px] bg-purple-950/80 text-purple-200 px-1 rounded border border-purple-500/50 shrink-0">Lv.{p.level}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                {/* Top Center: Timer */}
                <div className="bg-[#0b0416]/90 p-1.5 md:p-3 rounded-lg border border-cyan-500/30 text-center pointer-events-auto shrink-0 flex flex-col">
                    <div className="text-[8px] md:text-xs font-black tracking-widest text-cyan-500/80 uppercase mb-0.5">SURVIVE</div>
                    <div className="text-sm md:text-2xl font-black text-white font-mono tracking-wider">
                        {formatTime(time)} {duration === Infinity ? '' : <span className="text-slate-500 text-xs md:text-lg">/ {formatTime(duration || 300)}</span>}
                    </div>
                    {!isMeteorRun && (
                        <div className="text-[10px] md:text-sm font-black text-fuchsia-400 font-mono mt-0.5">
                            SCORE: {score.toLocaleString()}
                        </div>
                    )}
                    <div className="text-[9px] md:text-xs font-bold text-orange-400 font-mono mt-0.5" title="Damage per second">
                        DPS: {dps.toLocaleString()}
                    </div>
                    <div className="text-[9px] md:text-xs font-bold text-red-300 font-mono mt-0.5 flex items-center justify-center gap-1" title="Enemies defeated this run (endless mode caps credited kills)">
                        <span>KILLS: {kills.toLocaleString()}</span>
                        {showKillsCapped && <span className="text-[7px] md:text-[9px] bg-red-500/20 text-red-300 px-1 rounded border border-red-500/40">MAX</span>}
                    </div>

                    {/* Dynamic Difficulty pill — shows current spawn-rate tier so players
                        can read when they've crossed into HEATED / FRENZY thresholds. */}
                    <DynamicDifficultyPill mult={ddMult} />

                    {boss && boss.maxHp > 0 && (
                        <div className="mt-1 md:mt-2 pt-1 md:pt-2 border-t border-red-500/30">
                            <div className="flex justify-between items-center mb-0.5 md:mb-1 gap-2">
                                <span className="text-[8px] md:text-[10px] font-black tracking-widest text-red-400 uppercase truncate" title={boss.name}>
                                    ⚠ {boss.name}
                                </span>
                                <span className="text-[8px] md:text-[10px] font-mono text-red-300 shrink-0">
                                    {Math.ceil((boss.hp / boss.maxHp) * 100)}%
                                </span>
                            </div>
                            <div className="w-full bg-slate-950 h-1.5 md:h-2 rounded-full overflow-hidden border border-red-900/60">
                                <div
                                    className="h-full transition-all duration-200 bg-gradient-to-r from-red-700 via-red-500 to-orange-400"
                                    style={{ width: `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Top Right: Gold & Controls & ULT */}
                <div className="flex gap-1 md:gap-2 pointer-events-auto shrink-0 flex-col md:flex-row min-w-0">
                    <div className="flex gap-1 md:gap-2 flex-wrap justify-end min-w-0">
                        <div className="bg-[#0b0416]/90 p-1.5 md:p-3 rounded-lg border border-emerald-500/30 flex flex-col justify-center text-right">
                            <div className="text-[8px] md:text-xs font-black tracking-widest text-purple-500/80 uppercase mb-0.5">OMENX</div>
                            <div className="text-purple-400 font-bold text-xs md:text-lg flex items-center justify-end gap-0.5 md:gap-1 font-mono">
                                <OmenXIcon className="w-4 h-4 md:w-5 md:h-5" />
                                {typeof omenxBalance === 'number' ? omenxBalance.toFixed(2) : omenxBalance}
                            </div>
                        </div>
                        <div className={`bg-[#0b0416]/90 p-1.5 md:p-3 rounded-lg border ${goldOverLimit ? 'border-red-500/60 animate-pulse' : 'border-amber-500/30'} flex flex-col justify-center text-right`}>
                            <div className="text-[8px] md:text-xs font-black tracking-widest text-amber-500/80 uppercase mb-0.5 flex items-center justify-end gap-1">
                                GOLD
                                {goldCapped && <span className="text-[7px] md:text-[9px] bg-amber-500/20 text-amber-300 px-1 rounded border border-amber-500/40">MAX</span>}
                                {goldOverLimit && <span className="text-[7px] md:text-[9px] bg-red-500/30 text-red-200 px-1 rounded border border-red-500/60" title="Run is over the per-kill gold limit and may be rejected on submit. Get more kills to raise the cap.">OVER</span>}
                            </div>
                            <div className="text-amber-400 font-bold text-xs md:text-lg flex items-center justify-end gap-0.5 md:gap-1 font-mono">
                                <CircleDollarSign className="w-3 h-3 md:w-4 md:h-4" /> {displayGold}
                            </div>
                        </div>
                        
                        <div className="flex flex-col justify-center">
                            <button 
                                id="pause-game-btn"
                                onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onPause(); }}
                                className="bg-[#0b0416]/90 p-2 md:p-3 rounded-lg border border-slate-700/50 hover:bg-slate-800 hover:border-cyan-500/50 transition-all flex items-center justify-center touch-none h-full"
                                style={{ touchAction: 'none' }}
                            >
                                <Pause className="w-4 h-4 md:w-6 md:h-6 text-white" />
                            </button>
                        </div>
                    </div>
                    

                </div>
            </div>

            {/* Bottom: XP Bar — Squad ULTs were moved to the Pause menu (2026-06-15)
                so accidental in-run taps can't burn OMENX. */}
            <div className="mt-auto pointer-events-auto w-full mb-2 md:mb-4 flex justify-center px-2 md:px-0 flex-col gap-1.5">
                <div className={`bg-[#0b0416]/90 p-2 md:p-3 rounded-lg border w-full max-w-2xl transition-colors ${xpBuffActive ? 'border-emerald-400/60 shadow-[0_0_15px_rgba(52,211,153,0.3)]' : 'border-cyan-500/30'}`}>
                    <div className="flex justify-between items-end mb-1 gap-2">
                        <span className="text-sm md:text-lg font-black text-cyan-400 tracking-wider flex items-center gap-2">
                            LVL {level}
                            {xpBuffActive && (
                                <span className="text-[9px] md:text-[10px] bg-emerald-950/80 border border-emerald-400/60 text-emerald-300 px-1.5 py-0.5 rounded font-black tracking-widest uppercase animate-pulse">
                                    ✨ +50% XP
                                </span>
                            )}
                        </span>
                        <span className="text-[10px] md:text-xs font-bold text-cyan-200/50 font-mono">{Math.floor(xp)} <span className="text-slate-600">/ {xpRequired} XP</span></span>
                    </div>
                    <div className="w-full bg-slate-950 h-1.5 md:h-2 rounded-full overflow-hidden border border-slate-800">
                        <div 
                            className={`h-full transition-all duration-200 bg-gradient-to-r ${xpBuffActive ? 'from-emerald-500 via-cyan-400 to-emerald-300' : 'from-cyan-600 to-cyan-300'}`}
                            style={{ width: `${Math.min(100, (xp / xpRequired) * 100)}%` }}
                        />
                    </div>
                </div>
                {omenxPurchasesDisabled && (
                    <div className="bg-red-950/60 p-1.5 md:p-2 rounded-lg border border-red-500/50 w-full max-w-2xl flex items-center justify-center mx-auto">
                        <span className="text-[10px] md:text-xs font-bold text-red-300 text-center">⚠️ Purchases disabled while OMENX is down</span>
                    </div>
                )}
            </div>
        </div>
    );
}

// PERF 2026-08-07 — memoised. The HUD polls the engine 10×/second, so this tree
// (HP bar, weapon + passive lists, timer/score/DPS/kills, DD pill, boss bar, XP
// bar) reconciles constantly during a run on the same thread as the game loop.
// Most polls change only one or two numbers; memo lets React skip the whole
// subtree whenever the props are actually identical.
export default React.memo(UIOverlay);