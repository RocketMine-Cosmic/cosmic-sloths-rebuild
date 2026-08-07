import React, { useEffect, useState } from 'react';

// Per-character active-ability meter for the in-game HUD.
// Polls the engine ~10×/sec and shows a small bar that fills toward the next trigger.
//
// Mechanics map (mirrors game/CharacterMechanics.js):
// - skybyte:     sonicCharge (0–100), triggers at 100
// - holodrift:   decoyTimer / 20s
// - codebreaker: hackTimer / 10s
// - neobyte:     bannerTimer / 15s
// - dataphantom: phantomBoostTimer is a buff timer (max ~2s) — show while active
// - glitch w/ glt_copy aug: decoyTimer / 60s
const ABILITY_CONFIG = {
    skybyte:     { label: 'SONIC BOOM', color: 'cyan',    icon: '💨' },
    holodrift:   { label: 'DECOY',      color: 'emerald', icon: '👤' },
    codebreaker: { label: 'HACK',       color: 'lime',    icon: '⚡' },
    neobyte:     { label: 'BANNER',     color: 'blue',    icon: '🚩' },
    dataphantom: { label: 'PHANTOM',    color: 'purple',  icon: '👻' },
};

const COLOR_THEMES = {
    cyan:    { border: 'border-cyan-500/60',    text: 'text-cyan-300',    bar: 'from-cyan-600 to-cyan-300',       ready: 'shadow-[0_0_15px_rgba(6,182,212,0.6)]' },
    emerald: { border: 'border-emerald-500/60', text: 'text-emerald-300', bar: 'from-emerald-600 to-emerald-300', ready: 'shadow-[0_0_15px_rgba(16,185,129,0.6)]' },
    lime:    { border: 'border-lime-500/60',    text: 'text-lime-300',    bar: 'from-lime-600 to-lime-300',       ready: 'shadow-[0_0_15px_rgba(132,204,22,0.6)]' },
    blue:    { border: 'border-blue-500/60',    text: 'text-blue-300',    bar: 'from-blue-600 to-blue-300',       ready: 'shadow-[0_0_15px_rgba(59,130,246,0.6)]' },
    purple:  { border: 'border-purple-500/60',  text: 'text-purple-300',  bar: 'from-purple-600 to-purple-300',   ready: 'shadow-[0_0_15px_rgba(168,85,247,0.6)]' },
};

function getMeterState(engine) {
    if (!engine) return null;
    const cm = engine.characterMechanics;
    const charId = engine.characterId;
    const cfg = ABILITY_CONFIG[charId];

    // Glitch with the copy augment also gets a decoy meter (60s).
    if (!cfg && charId === 'glitch' && engine.player.charAugments?.includes('glt_copy')) {
        return {
            label: 'DECOY',
            color: 'purple',
            icon: '👤',
            progress: Math.min(1, (cm?.decoyTimer || 0) / 60),
            ready: false,
        };
    }
    if (!cfg) return null;

    if (charId === 'skybyte') {
        const charge = cm?.sonicCharge || 0;
        // Tier-7 mastery unlocks supercharge tier — meter goes 0→100 (Sonic Boom),
        // then 100→200 (Hyper Boom). Use the upper portion as a second visual tier.
        const hasSupercharge = !!engine.masteryAbilityBoost?.sonicChargeMult;
        if (hasSupercharge) {
            const isSuper = charge >= 200;
            const label = charge >= 100 ? (isSuper ? 'HYPER BOOM' : 'CHARGING…') : 'SONIC BOOM';
            return {
                ...cfg,
                label,
                color: isSuper ? 'lime' : 'cyan',
                progress: Math.min(1, charge / 200),
                ready: isSuper,
            };
        }
        return { ...cfg, progress: Math.min(1, charge / 100), ready: charge >= 100 };
    }
    if (charId === 'holodrift') {
        return { ...cfg, progress: Math.min(1, (cm?.decoyTimer || 0) / 20), ready: false };
    }
    if (charId === 'codebreaker') {
        return { ...cfg, progress: Math.min(1, (cm?.hackTimer || 0) / 10), ready: false };
    }
    if (charId === 'neobyte') {
        return { ...cfg, progress: Math.min(1, (cm?.bannerTimer || 0) / 15), ready: false };
    }
    if (charId === 'dataphantom') {
        // Active-buff meter — drains down from 2s. Hide when not active.
        const t = engine.player.phantomBoostTimer || 0;
        if (t <= 0) return null;
        return { ...cfg, label: 'PHANTOM ACTIVE', progress: Math.min(1, t / 2), ready: true };
    }
    return null;
}

export default function CharacterAbilityMeter({ engineRef }) {
    const [state, setState] = useState(null);

    useEffect(() => {
        const id = setInterval(() => {
            setState(getMeterState(engineRef.current));
        }, 100);
        return () => clearInterval(id);
    }, [engineRef]);

    if (!state) return null;

    const theme = COLOR_THEMES[state.color] || COLOR_THEMES.cyan;
    const pct = Math.round(state.progress * 100);

    return (
        <div className={`fixed left-1/2 -translate-x-1/2 bottom-[4.75rem] md:bottom-[5.5rem] z-30 pointer-events-none w-[60%] max-w-md bg-[#0b0416]/85 backdrop-blur-sm border ${theme.border} ${state.ready ? theme.ready : ''} rounded-lg px-2 py-1 md:px-3 md:py-1.5`}>
            <div className="flex items-center justify-between mb-1">
                <span className={`text-[9px] md:text-[10px] font-black tracking-widest ${theme.text} uppercase flex items-center gap-1`}>
                    <span>{state.icon}</span> {state.label}
                </span>
                <span className={`text-[9px] md:text-[10px] font-mono ${theme.text}`}>
                    {state.ready ? 'READY' : `${pct}%`}
                </span>
            </div>
            <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
                <div
                    className={`h-full transition-all duration-150 bg-gradient-to-r ${theme.bar}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}