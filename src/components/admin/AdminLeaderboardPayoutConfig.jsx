import React, { useEffect, useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Trophy, Save, RotateCcw, Plus, Trash2, AlertTriangle } from 'lucide-react';

// Owner-only panel for editing the leaderboard payout configuration.
// - Dropdown to pick top N (1..50 quick picks, or custom)
// - Editable pool %s (weekly score / seasonal score / weekly kill)
// - Editable per-rank-tier table for weekly + seasonal + kill leaderboards
// - Live preview showing what each rank would earn from a sample pool
//
// Backed by functions/leaderboardPayoutConfig.
//
// IMPORTANT: pool % fields ONLY apply to S7+ distributions (2026-S7 and later).
// Pre-S7 weekly/seasonal payouts ignore them and use legacy hardcoded values
// (20% weekly / 30% seasonal / no kill pool). See docs/OMENX_POOL_RESPLIT_PLAN.md.

const TOP_N_PRESETS = [5, 10, 15, 20, 25, 30, 40, 45, 50];
const SAMPLE_POOL = 1000; // OMENX, used for live preview

function TierRow({ tier, onChange, onRemove }) {
    return (
        <tr className="border-b border-slate-800/50">
            <td className="p-1.5">
                <input
                    type="number" min={1} value={tier.min}
                    onChange={e => onChange({ ...tier, min: Number(e.target.value) })}
                    className="w-16 bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 text-xs font-mono"
                />
            </td>
            <td className="p-1.5">
                <input
                    type="number" min={tier.min} value={tier.max}
                    onChange={e => onChange({ ...tier, max: Number(e.target.value) })}
                    className="w-16 bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 text-xs font-mono"
                />
            </td>
            <td className="p-1.5">
                <div className="flex items-center gap-1">
                    <input
                        type="number" min={0} max={50} step={0.1}
                        value={(tier.pct * 100).toFixed(2)}
                        onChange={e => onChange({ ...tier, pct: Number(e.target.value) / 100 })}
                        className="w-20 bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 text-xs font-mono"
                    />
                    <span className="text-slate-500 text-xs">%</span>
                </div>
            </td>
            <td className="p-1.5 text-right">
                <button onClick={onRemove}
                    className="text-red-400 hover:text-red-300 p-1" title="Remove tier">
                    <Trash2 size={12} />
                </button>
            </td>
        </tr>
    );
}

function TierEditor({ title, color, tiers, setTiers, poolMultiplier, topN }) {
    // Live payout preview — mirrors backend buildRankedPayments math
    const preview = useMemo(() => {
        const totalPct = Array.from({ length: topN }, (_, i) => {
            const rank = i + 1;
            const t = tiers.find(t => rank >= t.min && rank <= t.max);
            return t ? t.pct : 0;
        }).reduce((a, b) => a + b, 0);
        if (totalPct === 0) return [];
        const rewardPool = SAMPLE_POOL * poolMultiplier;
        const mult = 1 / totalPct;
        return Array.from({ length: topN }, (_, i) => {
            const rank = i + 1;
            const t = tiers.find(t => rank >= t.min && rank <= t.max);
            const pct = t ? t.pct : 0;
            return { rank, pct, amount: Math.floor(rewardPool * pct * mult) };
        });
    }, [tiers, topN, poolMultiplier]);

    const totalPaid = preview.reduce((s, p) => s + p.amount, 0);

    const addTier = () => {
        const last = tiers[tiers.length - 1];
        const newMin = last ? last.max + 1 : 1;
        setTiers([...tiers, { min: newMin, max: newMin, pct: 0.01 }]);
    };

    return (
        <div className={`bg-slate-900/40 border border-${color}-900/40 rounded-lg p-3`}>
            <h3 className={`text-sm font-bold text-${color}-300 mb-2 uppercase tracking-wider`}>{title}</h3>
            <table className="w-full text-xs">
                <thead className="bg-slate-900/60 text-slate-500">
                    <tr>
                        <th className="p-1.5 text-left">From Rank</th>
                        <th className="p-1.5 text-left">To Rank</th>
                        <th className="p-1.5 text-left">% Weight</th>
                        <th className="p-1.5"></th>
                    </tr>
                </thead>
                <tbody>
                    {tiers.map((t, i) => (
                        <TierRow key={i} tier={t}
                            onChange={nt => setTiers(tiers.map((x, j) => j === i ? nt : x))}
                            onRemove={() => setTiers(tiers.filter((_, j) => j !== i))} />
                    ))}
                </tbody>
            </table>
            <button onClick={addTier}
                className="mt-2 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded">
                <Plus size={12} /> Add tier
            </button>

            <div className="mt-3 bg-slate-950/60 rounded p-2 max-h-48 overflow-y-auto">
                <div className="text-[10px] text-slate-500 uppercase mb-1 sticky top-0 bg-slate-950/90 py-0.5">
                    Live preview (sample pool: {SAMPLE_POOL} OMENX × {(poolMultiplier * 100).toFixed(1)}% = {Math.floor(SAMPLE_POOL * poolMultiplier)} OMENX reward pool)
                </div>
                <table className="w-full text-[11px]">
                    <tbody>
                        {preview.map(p => (
                            <tr key={p.rank} className="text-slate-300">
                                <td className="py-0.5 w-12 text-slate-500 font-mono">#{p.rank}</td>
                                <td className="py-0.5 w-16 text-slate-400 font-mono">{(p.pct * 100).toFixed(2)}%</td>
                                <td className={`py-0.5 font-mono font-bold text-${color}-400`}>{p.amount.toFixed(2)} OMENX</td>
                            </tr>
                        ))}
                        <tr className="border-t border-slate-700 text-slate-200 font-bold">
                            <td className="py-1" colSpan={2}>Total paid out</td>
                            <td className="py-1 font-mono">{totalPaid.toFixed(2)} OMENX</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Small reusable input for a pool % field
function PoolPctInput({ label, value, onChange, color, hint }) {
    return (
        <div className="flex flex-col gap-1">
            <label className={`text-[10px] uppercase tracking-wider text-${color}-300 font-bold`}>{label}</label>
            <div className="flex items-center gap-1.5">
                <input
                    type="number" min={0} max={50} step={0.1}
                    value={(value * 100).toFixed(2)}
                    onChange={e => onChange(Number(e.target.value) / 100)}
                    className={`w-24 bg-slate-900 border border-${color}-800 text-white rounded px-2 py-1.5 text-sm font-mono`}
                />
                <span className="text-slate-500 text-xs">% of spend</span>
            </div>
            {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
        </div>
    );
}

export default function AdminLeaderboardPayoutConfig({ isOwner }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');
    const [topN, setTopN] = useState(20);
    const [weeklyTiers, setWeeklyTiers] = useState([]);
    const [seasonalTiers, setSeasonalTiers] = useState([]);
    const [killTiers, setKillTiers] = useState([]);
    const [weeklyPoolPct, setWeeklyPoolPct] = useState(0.15);
    const [seasonalPoolPct, setSeasonalPoolPct] = useState(0.20);
    const [killPoolPct, setKillPoolPct] = useState(0.05);
    const [meta, setMeta] = useState(null);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const res = await base44.functions.invoke('leaderboardPayoutConfig', { action: 'get' });
            const cfg = res.data?.config;
            const defaults = res.data?.default;
            if (cfg) {
                setTopN(cfg.top_n);
                setWeeklyTiers(cfg.weekly_tiers || []);
                setSeasonalTiers(cfg.seasonal_tiers || []);
                // Backfill kill tiers from the backend defaults when the saved config
                // is missing them or stored an empty array (config was saved before
                // the kill leaderboard existed). Without this, the table renders
                // blank and the live preview shows 0.00 OMENX for every rank.
                const savedKillTiers = cfg.weekly_kill_tiers;
                if (Array.isArray(savedKillTiers) && savedKillTiers.length > 0) {
                    setKillTiers(savedKillTiers);
                } else {
                    setKillTiers(defaults?.weekly_kill_tiers || []);
                }
                if (cfg.weekly_pool_pct !== undefined) setWeeklyPoolPct(Number(cfg.weekly_pool_pct));
                if (cfg.seasonal_pool_pct !== undefined) setSeasonalPoolPct(Number(cfg.seasonal_pool_pct));
                if (cfg.kill_pool_pct !== undefined) setKillPoolPct(Number(cfg.kill_pool_pct));
            }
            setMeta(res.data);
        } catch (e) {
            setError(e.message || 'Failed to load config');
        }
        setLoading(false);
    };

    useEffect(() => { loadConfig(); }, []);

    const handleSave = async () => {
        setSaving(true); setMsg(''); setError('');
        try {
            const res = await base44.functions.invoke('leaderboardPayoutConfig', {
                action: 'set',
                top_n: topN,
                weekly_tiers: weeklyTiers,
                seasonal_tiers: seasonalTiers,
                weekly_kill_tiers: killTiers,
                weekly_pool_pct: weeklyPoolPct,
                seasonal_pool_pct: seasonalPoolPct,
                kill_pool_pct: killPoolPct,
            });
            if (res.data?.error) throw new Error(res.data.error);
            setMsg('✓ Saved — affects the next distribution');
            await loadConfig();
            setTimeout(() => setMsg(''), 6000);
        } catch (e) {
            setError(e.message || 'Save failed');
        }
        setSaving(false);
    };

    const handleReset = async () => {
        if (!confirm('Reset to built-in defaults (top 20 with classic tiers)?')) return;
        setSaving(true); setMsg(''); setError('');
        try {
            const res = await base44.functions.invoke('leaderboardPayoutConfig', { action: 'reset' });
            if (res.data?.error) throw new Error(res.data.error);
            setMsg('✓ Reset to defaults');
            await loadConfig();
        } catch (e) {
            setError(e.message || 'Reset failed');
        }
        setSaving(false);
    };

    if (!isOwner) {
        return (
            <div className="bg-[#0b0416]/80 border border-yellow-900/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-yellow-300 text-sm">
                    <AlertTriangle size={16} /> Owner-only — leaderboard payout configuration.
                </div>
            </div>
        );
    }

    if (loading) {
        return <div className="bg-[#0b0416]/80 border border-slate-700 rounded-xl p-6 text-center text-slate-500">Loading config…</div>;
    }

    const totalPoolPct = weeklyPoolPct + killPoolPct;

    return (
        <div className="bg-[#0b0416]/80 border border-amber-900/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-base font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                    <Trophy size={16} /> Leaderboard Payout Config
                </h2>
                <div className="flex items-center gap-2">
                    <button onClick={handleReset} disabled={saving}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
                        <RotateCcw size={12} /> Reset to defaults
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
                        <Save size={12} /> {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>

            {msg && <div className="mb-3 text-emerald-400 text-sm">{msg}</div>}
            {error && <div className="mb-3 text-red-400 text-sm">✗ {error}</div>}

            <div className="bg-amber-950/30 border border-amber-700/40 rounded-lg p-3 mb-4 text-xs text-amber-200 leading-relaxed">
                <div className="font-bold mb-1">How it works:</div>
                Pool % fields control how much of the weekly/seasonal OMENX spend goes to each leaderboard.
                The backend re-scales the rank tier weights so each pool is always fully distributed.
                <div className="mt-2 text-amber-300/80">
                    <span className="font-bold">⚠️ Pool % fields only apply from Season 7 onwards (~2026-06-14).</span> Pre-S7 distributions ignore them and use legacy values (20% weekly / 30% seasonal / no kill pool). Tier % weights apply to all periods.
                </div>
            </div>

            {/* Pool % fields */}
            <div className="bg-slate-900/40 border border-slate-700/60 rounded-lg p-3 mb-4">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">Pool Sizes (S7+)</div>
                <div className="flex flex-wrap gap-6">
                    <PoolPctInput
                        label="Weekly Score Pool" color="cyan"
                        value={weeklyPoolPct} onChange={setWeeklyPoolPct}
                        hint="Default 15%"
                    />
                    <PoolPctInput
                        label="Seasonal Score Pool" color="purple"
                        value={seasonalPoolPct} onChange={setSeasonalPoolPct}
                        hint="Default 20%"
                    />
                    <PoolPctInput
                        label="Weekly Kill Pool" color="orange"
                        value={killPoolPct} onChange={setKillPoolPct}
                        hint="Default 5% (top 20 sector kills)"
                    />
                    <div className="flex flex-col gap-1 ml-auto bg-slate-950/60 border border-slate-700 rounded px-3 py-2">
                        <div className="text-[10px] text-slate-500 uppercase">Total weekly outflow</div>
                        <div className="font-mono font-bold text-sm text-white">
                            {(totalPoolPct * 100).toFixed(2)}%
                            <span className="text-slate-500 text-xs ml-1">+ staff cuts</span>
                        </div>
                        {totalPoolPct > 0.30 && (
                            <div className="text-[10px] text-amber-400 mt-1">⚠ over 30% — verify runway</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Top N picker */}
            <div className="mb-4 flex items-end gap-3 flex-wrap">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-500 uppercase">Maximum paying ranks (top N)</label>
                    <div className="flex items-center gap-2">
                        <select
                            value={TOP_N_PRESETS.includes(topN) ? topN : 'custom'}
                            onChange={e => {
                                if (e.target.value === 'custom') return;
                                setTopN(Number(e.target.value));
                            }}
                            style={{ colorScheme: 'dark' }}
                            className="bg-slate-900 border border-amber-800 text-white rounded px-3 py-1.5 text-sm font-mono">
                            {TOP_N_PRESETS.map(n => <option key={n} value={n}>Top {n}</option>)}
                            <option value="custom">Custom…</option>
                        </select>
                        <input type="number" min={1} max={100} value={topN}
                            onChange={e => setTopN(Math.max(1, Math.min(100, Number(e.target.value))))}
                            className="w-20 bg-slate-900 border border-slate-700 text-white rounded px-2 py-1.5 text-sm font-mono" />
                    </div>
                </div>
                {meta?.updated_by && (
                    <div className="text-[10px] text-slate-500 ml-auto">
                        Last updated by <span className="font-mono">{meta.updated_by.slice(0, 6)}...{meta.updated_by.slice(-4)}</span>
                        {meta.updated_date && <> · {new Date(meta.updated_date).toLocaleString()}</>}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <TierEditor title={`Weekly Score (${(weeklyPoolPct * 100).toFixed(1)}% of pool)`} color="cyan"
                    tiers={weeklyTiers} setTiers={setWeeklyTiers}
                    poolMultiplier={weeklyPoolPct} topN={topN} />
                <TierEditor title={`Seasonal Score (${(seasonalPoolPct * 100).toFixed(1)}% of pool)`} color="purple"
                    tiers={seasonalTiers} setTiers={setSeasonalTiers}
                    poolMultiplier={seasonalPoolPct} topN={topN} />
                <TierEditor title={`Weekly Kills (${(killPoolPct * 100).toFixed(1)}% of pool)`} color="orange"
                    tiers={killTiers} setTiers={setKillTiers}
                    poolMultiplier={killPoolPct} topN={topN} />
            </div>
        </div>
    );
}