import React, { useState, useMemo, useEffect } from 'react';
import { Sparkles, Plus, Minus, RotateCcw, Sword, Zap, Wand2, Check, X, Gift } from 'lucide-react';
import { SaveManager } from '../../game/SaveManager';
import { SoundManager } from '../../game/SoundManager';
import {
    BIAS_PER_POINT,
    POINTS_TIER_BREAKPOINT,
    LATE_LEVELS_PER_POINT,
    RESPEC_COST_OMENX,
    getBiasTargets,
    getGoldRespecCost,
    getTotalBiasPoints,
    getAllocations,
    getSpentPoints,
    getPermanentLevel,
    getLevelsUntilNextPoint,
} from '@/lib/poolBias';
import { POOL_BIAS_PRESETS, buildPresetAllocation } from '@/lib/poolBiasPresets';
import { useCurrency } from '@/lib/CurrencyContext';
import { base44 } from '@/api/base44Client';
import { IN_GAME_SKUS } from '@/lib/skuMap';
import { getOmenXUserSync } from '@/lib/omenxUser';
import { refreshBalance } from '@/lib/playerDataCache';
import { useOmenXPurchasesDisabled } from '@/hooks/useOmenXPurchasesDisabled';

// Cap the visual fill at 10 points (+100%) — beyond that the bar would imply
// linear growth that doesn't reflect diminishing returns from a draw-weight
// pool with multiple competing targets.
const BAR_FILL_CAP_POINTS = 10;

function TargetRow({ target, points, committedPoints, onAdd, onRemove, canAdd, accent }) {
    const pct = points * BIAS_PER_POINT * 100;
    const fillPct = Math.min(100, (points / BAR_FILL_CAP_POINTS) * 100);
    // Highlight rows whose draft differs from what's currently committed so
    // players can see at a glance which choices they've changed.
    const isDirty = points !== committedPoints;
    const delta = points - committedPoints;
    // The − button can only walk back points added THIS session — i.e. points
    // above the already-committed allocation. Removing committed points would
    // let players free up spent points without paying respec (bypass fix
    // 2026-07-01 — reported live: "you can press minus and remove all the
    // allocated points without having to pay for respec").
    const canRemove = points > committedPoints;
    // Past +100% = diminishing returns kick in. We still allow it (no cap), but
    // flag it visually so the player understands the bar staying full isn't a
    // bug — extra points still count, they're just worth less per point.
    const overCap = points > BAR_FILL_CAP_POINTS;
    return (
        <div className={`flex flex-col gap-1 bg-slate-900/60 border ${isDirty ? 'border-fuchsia-500/60' : accent.border} rounded-lg px-2.5 py-1.5 transition-colors`}>
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-base shrink-0">{target.icon}</span>
                    <span className={`text-xs font-bold truncate ${accent.text}`}>{target.label}</span>
                    {overCap && (
                        <span
                            className="text-[9px] font-bold text-orange-400 bg-orange-950/60 border border-orange-500/40 rounded px-1 py-0.5 shrink-0"
                            title="Diminishing returns — extra points still count but each one adds less appearance rate. Spreading to a second target usually pays off more."
                        >
                            ⚠ DIM
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-slate-300 tabular-nums w-20 text-right">
                        {points} pts <span className="text-slate-500">+{pct.toFixed(0)}%</span>
                        {isDirty && (
                            <span className={`ml-1 ${delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                ({delta > 0 ? '+' : ''}{delta})
                            </span>
                        )}
                    </span>
                    <button
                        onClick={onRemove}
                        disabled={!canRemove}
                        className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-white flex items-center gap-1 text-[10px] font-bold transition-colors"
                        title={canRemove ? 'Remove 1 point' : 'Already committed — use Respec to free up spent points'}
                    >
                        <Minus className="w-3 h-3" />
                    </button>
                    <button
                        onClick={onAdd}
                        disabled={!canAdd}
                        className={`px-2 py-0.5 rounded ${accent.btn} disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center gap-1 text-[10px] font-bold transition-colors`}
                        title="Add 1 point"
                    >
                        <Plus className="w-3 h-3" />
                    </button>
                </div>
            </div>
            {/* Visual weight bar — fills as more points are allocated. Empty rows
                still show the track so the row height stays consistent. */}
            <div className="h-1 bg-slate-800/80 rounded-full overflow-hidden">
                <div
                    className={`h-full ${accent.bar} transition-all duration-300`}
                    style={{ width: `${fillPct}%` }}
                />
            </div>
        </div>
    );
}

export default function PoolBiasPanel({ save, setSave }) {
    const { omenxBalance } = useCurrency();
    const { disabled: omenxBlocked, message: omenxBlockedMsg } = useOmenXPurchasesDisabled();
    const [respecBusy, setRespecBusy] = useState(false);
    const [respecError, setRespecError] = useState(null);

    // Draft state — players freely +/− into this without touching the saved
    // allocations until they press Confirm. Cancel restores the committed copy.
    const committedAllocations = getAllocations(save);
    const [draft, setDraft] = useState(committedAllocations);

    // If the underlying save changes externally (e.g. respec clears it, or
    // a different page updates allocations), sync the draft so we don't show
    // stale data. JSON-stringify keeps this cheap and accurate for plain maps.
    const committedKey = useMemo(() => JSON.stringify(committedAllocations), [committedAllocations]);
    useEffect(() => {
        setDraft(committedAllocations);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [committedKey]);

    const targets = getBiasTargets();
    const total = getTotalBiasPoints(save);
    const committedSpent = getSpentPoints(save);
    const draftSpent = Object.values(draft).reduce((a, b) => a + Number(b || 0), 0);
    const draftRemaining = Math.max(0, total - draftSpent);
    const permLevel = getPermanentLevel(save);
    const levelsToNext = getLevelsUntilNextPoint(save);
    const isLateTier = permLevel >= POINTS_TIER_BREAKPOINT;
    const gold = save.gold || 0;
    const goldRespecCost = getGoldRespecCost(save);
    const canRespecGold = committedSpent > 0 && gold >= goldRespecCost;
    const canRespecOmenx = committedSpent > 0 && (omenxBalance ?? 0) >= RESPEC_COST_OMENX && !omenxBlocked;
    // One-time free respec — granted to all players following the Pool Bias UI
    // overhaul (preset rework + diminishing-returns disclosure). Local flag is
    // good enough; worst-case tampering = a free respec, which is the intent.
    const freeRespecAvailable = !save.freeBiasRespecUsed && committedSpent > 0;

    const isDirty = committedKey !== JSON.stringify(draft);

    const addPoint = (targetId) => {
        if (draftRemaining <= 0) return;
        SoundManager.playUIClick();
        setDraft(d => ({ ...d, [targetId]: Number(d[targetId] || 0) + 1 }));
    };

    const removePoint = (targetId) => {
        const current = Number(draft[targetId] || 0);
        const committed = Number(committedAllocations[targetId] || 0);
        // Only points added this session (above the committed floor) can be
        // walked back. Removing committed points requires a paid respec —
        // otherwise the − button is a free respec (bypass fix 2026-07-01).
        if (current <= committed) return;
        SoundManager.playUIClick();
        setDraft(d => {
            const next = { ...d, [targetId]: current - 1 };
            // Clean up zero entries so the saved object stays tidy.
            if (next[targetId] === 0) delete next[targetId];
            return next;
        });
    };

    // Apply a preset to the DRAFT — distributes ONLY the currently-unspent
    // points across the preset's target weights, layered on top of already-
    // committed allocations. Presets can no longer wipe committed points
    // (that requires a paid respec — bypass fix 2026-07-01).
    const applyPreset = (preset) => {
        // Unspent = total minus what's ALREADY committed. Uncommitted draft
        // additions are also discarded so pressing a preset gives a
        // predictable result regardless of any draft +'s the player made.
        const unspent = Math.max(0, total - committedSpent);
        if (unspent <= 0) return;
        SoundManager.playUIClick();
        const bonus = buildPresetAllocation(preset.weights, unspent);
        // Merge bonus on top of committed floor.
        const next = { ...committedAllocations };
        for (const [id, pts] of Object.entries(bonus)) {
            next[id] = Number(next[id] || 0) + pts;
        }
        setDraft(next);
    };

    const confirmDraft = () => {
        if (!isDirty) return;
        SoundManager.playUIClick();
        const newSave = { ...save, poolBiasAllocations: draft };
        SaveManager.save(newSave);
        setSave(newSave);
    };

    const cancelDraft = () => {
        if (!isDirty) return;
        SoundManager.playUIClick();
        setDraft(committedAllocations);
    };

    const useFreeRespec = () => {
        if (!freeRespecAvailable || respecBusy) return;
        SoundManager.playUIClick();
        const newSave = {
            ...save,
            poolBiasAllocations: {},
            freeBiasRespecUsed: true,
        };
        SaveManager.save(newSave);
        setSave(newSave);
        setDraft({});
    };

    const respecWithGold = async () => {
        if (!canRespecGold || respecBusy) return;
        setRespecBusy(true);
        setRespecError(null);
        SoundManager.playUIClick();
        try {
            // Server-authoritative: deducts gold + clears allocations + bumps respec count atomically.
            const res = await base44.functions.invoke('spendGold', {
                grantInfo: { type: 'pool_respec' },
            });
            if (!res?.data?.success) {
                throw new Error(res?.data?.error || 'Respec failed');
            }
            // Adopt server truth for the fields it just changed.
            const sd = res.data.saveData || {};
            const newSave = {
                ...save,
                gold: Number(sd.gold ?? gold - goldRespecCost),
                poolBiasGoldRespecCount: Number(sd.poolBiasGoldRespecCount ?? (save.poolBiasGoldRespecCount || 0) + 1),
                poolBiasAllocations: sd.poolBiasAllocations || {},
            };
            SaveManager.save(newSave);
            setSave(newSave);
            setDraft({});
        } catch (e) {
            setRespecError(e?.message || 'Respec failed');
        } finally {
            setRespecBusy(false);
        }
    };

    const respecWithOmenx = async () => {
        if (!canRespecOmenx || respecBusy || omenxBlocked) return;
        setRespecBusy(true);
        setRespecError(null);
        SoundManager.playUIClick();
        try {
            const user = getOmenXUserSync();
            const playerName = user?.player_name || user?.full_name || 'Pilot';
            // Server-authoritative: charges OMENX via the dedicated 'bias-respec' SKU
            // AND clears poolBiasAllocations atomically (see purchaseSku grant).
            const res = await base44.functions.invoke('purchaseSku', {
                skuId: IN_GAME_SKUS.biasRespec,
                quantity: 1,
                playerName,
                grantInfo: { type: 'pool_respec' },
            });
            if (res?.data?.success === false || res?.data?.error) {
                throw new Error(res?.data?.error || 'Purchase failed');
            }
            // Adopt server truth — saveData has cleared allocations.
            const sd = res.data?.saveData || {};
            const newSave = {
                ...save,
                poolBiasAllocations: sd.poolBiasAllocations || {},
            };
            SaveManager.save(newSave);
            setSave(newSave);
            setDraft({});
            refreshBalance();
        } catch (e) {
            setRespecError(e?.message || 'Respec failed');
        } finally {
            setRespecBusy(false);
        }
    };

    const weaponAccent = { border: 'border-cyan-500/30',  text: 'text-cyan-300',   btn: 'bg-cyan-700 hover:bg-cyan-600',  bar: 'bg-cyan-500' };
    const statAccent   = { border: 'border-amber-500/30', text: 'text-amber-300',  btn: 'bg-amber-700 hover:bg-amber-600', bar: 'bg-amber-500' };

    return (
        <div className="bg-[#0b0416]/60 backdrop-blur-xl border border-slate-700/50 rounded-xl p-3 md:p-5 mb-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                <div>
                    <h2 className="text-lg md:text-xl font-black uppercase tracking-widest flex items-center gap-2 text-fuchsia-300">
                        <Sparkles className="w-5 h-5" /> Pool Bias
                    </h2>
                    <p className="text-[11px] md:text-xs text-slate-200 mt-0.5 leading-relaxed">
                        Spend points to make specific weapons or stats appear <span className="text-cyan-300 font-bold">more often</span> in your in-run level-up choices.
                    </p>
                    <p className="text-[10px] md:text-[11px] text-slate-500 mt-1">
                        Earn 1 pt per permanent upgrade for your first {POINTS_TIER_BREAKPOINT} levels, then 1 pt every {LATE_LEVELS_PER_POINT} levels. Each point = +{Math.round(BIAS_PER_POINT * 100)}% draw weight.
                    </p>
                    <p className="text-[10px] md:text-[11px] text-orange-300/80 mt-1">
                        💡 Past <span className="font-bold">+100%</span> (10 pts) extra points still count but give diminishing returns — spreading to a second target usually pays off more.
                    </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                    <div className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs">
                        <span className="text-slate-400">Permanent Level:</span>{' '}
                        <span className="text-fuchsia-300 font-mono font-bold">{permLevel}</span>
                        <span className="text-slate-500"> · next pt in {levelsToNext} {levelsToNext === 1 ? 'level' : 'levels'}{isLateTier ? '' : ''}</span>
                    </div>
                    <div className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs">
                        <span className="text-slate-400">Available:</span>{' '}
                        <span className="text-cyan-300 font-mono font-bold">{draftRemaining}</span>
                        <span className="text-slate-500"> / {total}</span>
                    </div>
                </div>
            </div>

            {/* Quick-start presets — auto-distribute remaining points by archetype.
                Helps new players who don't know where to spend their first batch. */}
            <div className="mb-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-1.5 text-fuchsia-300 font-bold text-[11px] uppercase tracking-wider mb-1.5">
                    <Wand2 className="w-3.5 h-3.5" /> Quick Start Presets
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                    {POOL_BIAS_PRESETS.map(p => (
                        <button
                            key={p.id}
                            onClick={() => applyPreset(p)}
                            disabled={draftRemaining <= 0}
                            title={draftRemaining <= 0 ? 'No unspent points — use Respec to free up committed points' : `Distributes your ${draftRemaining} unspent points: ${p.desc}`}
                            className="flex items-start gap-2 bg-slate-900/60 hover:bg-fuchsia-900/30 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 hover:border-fuchsia-500/60 rounded-lg px-2 py-1.5 text-left transition-colors"
                        >
                            <span className="text-base shrink-0">{p.icon}</span>
                            <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-bold text-fuchsia-200 truncate">{p.name}</div>
                                <div className="text-[9px] text-slate-400 leading-tight line-clamp-2">{p.desc}</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <div className="flex items-center gap-1.5 text-cyan-300 font-bold text-xs uppercase tracking-wider mb-2">
                        <Sword className="w-3.5 h-3.5" /> Weapons
                    </div>
                    <div className="space-y-1.5">
                        {targets.weapons.map(t => (
                            <TargetRow
                                key={t.id}
                                target={t}
                                points={Number(draft[t.id] || 0)}
                                committedPoints={Number(committedAllocations[t.id] || 0)}
                                onAdd={() => addPoint(t.id)}
                                onRemove={() => removePoint(t.id)}
                                canAdd={draftRemaining > 0}
                                accent={weaponAccent}
                            />
                        ))}
                    </div>
                </div>
                <div>
                    <div className="flex items-center gap-1.5 text-amber-300 font-bold text-xs uppercase tracking-wider mb-2">
                        <Zap className="w-3.5 h-3.5" /> Stats
                    </div>
                    <div className="space-y-1.5">
                        {targets.stats.map(t => (
                            <TargetRow
                                key={t.id}
                                target={t}
                                points={Number(draft[t.id] || 0)}
                                committedPoints={Number(committedAllocations[t.id] || 0)}
                                onAdd={() => addPoint(t.id)}
                                onRemove={() => removePoint(t.id)}
                                canAdd={draftRemaining > 0}
                                accent={statAccent}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Confirm / Cancel — only enabled when the draft differs from the
                committed save. Players can freely +/− and presets-juggle until
                they press Confirm. */}
            <div className="mt-3 pt-3 border-t border-slate-800 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
                <div className="text-[11px] text-slate-400">
                    {isDirty
                        ? <span className="text-fuchsia-300 font-bold">Unsaved changes — Confirm to apply.</span>
                        : <span>All changes saved.</span>
                    }
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={cancelDraft}
                        disabled={!isDirty}
                        className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" /> Cancel
                    </button>
                    <button
                        onClick={confirmDraft}
                        disabled={!isDirty}
                        className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                        <Check className="w-3.5 h-3.5" /> Confirm Choices
                    </button>
                </div>
            </div>

            {freeRespecAvailable && (
                <div className="mt-3 pt-3 border-t border-slate-800 bg-emerald-950/20 border-emerald-500/30 rounded-lg p-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
                    <div className="text-[11px] text-emerald-300 flex items-center gap-1.5">
                        <Gift className="w-3.5 h-3.5" />
                        <span><span className="font-bold">Free respec available!</span> One-time gift for the Pool Bias rework — refunds all {committedSpent} spent points at no cost.</span>
                    </div>
                    <button
                        onClick={useFreeRespec}
                        disabled={!freeRespecAvailable}
                        className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
                    >
                        <Gift className="w-3.5 h-3.5" /> Use Free Respec
                    </button>
                </div>
            )}

            <div className="mt-3 pt-3 border-t border-slate-800 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" />
                    Respec refunds all <span className="text-cyan-300 font-bold">{committedSpent}</span> spent points. Gold cost increases each use.
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={respecWithGold}
                        disabled={!canRespecGold}
                        className="px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                        title={committedSpent === 0 ? 'Nothing to respec' : `Costs ${goldRespecCost.toLocaleString()} gold (you have ${gold.toLocaleString()})`}
                    >
                        Respec — {goldRespecCost.toLocaleString()} Gold
                    </button>
                    <button
                        onClick={respecWithOmenx}
                        disabled={!canRespecOmenx || respecBusy || omenxBlocked}
                        className="px-3 py-1.5 rounded bg-purple-700 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                        title={omenxBlocked ? (omenxBlockedMsg || 'OMENX purchases are temporarily disabled.') : committedSpent === 0 ? 'Nothing to respec' : `Costs ${RESPEC_COST_OMENX} OMENX`}
                    >
                        {omenxBlocked ? `🔒 ${RESPEC_COST_OMENX} OMENX (Paused)` : respecBusy ? 'Processing…' : `Respec — ${RESPEC_COST_OMENX} OMENX`}
                    </button>
                </div>
            </div>
            {respecError && (
                <div className="mt-2 text-[11px] text-red-400">{respecError}</div>
            )}
        </div>
    );
}