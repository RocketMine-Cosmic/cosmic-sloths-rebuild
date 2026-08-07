import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from 'recharts';
import { CHARACTERS, ARENAS } from '@/game/Constants';

// One-stop balance dashboard. Pulls a sample of recent RunScore rows and slices
// them by character / arena / level / time / score so admins can spot:
//   • Over-/under-played characters (pick rate)
//   • Characters with disproportionately high/low avg scores (power outliers)
//   • Arenas where players consistently die early (difficulty cliffs)
//   • Run-length distribution (are short runs dominating? endless skewing things?)
//   • Score distribution (long tail of cheaters? floor too low?)

const PERIODS = [
    { id: 'all',      label: 'All-time' },
    { id: 'weekly',   label: 'This week' },
    { id: 'seasonal', label: 'This season' },
];

const CHAR_LABELS = Object.fromEntries(CHARACTERS.map(c => [c.id, c.name]));
const ARENA_LABELS = Object.fromEntries(ARENAS.map(a => [a.id, a.name]));
ARENA_LABELS.endless = 'Endless Void';
ARENA_LABELS.world_boss_arena = 'Global Raid';

function StatTile({ label, value, sub, tone = 'cyan' }) {
    const tones = {
        cyan: 'border-cyan-700/50 text-cyan-300',
        amber: 'border-amber-700/50 text-amber-300',
        rose: 'border-rose-700/50 text-rose-300',
        emerald: 'border-emerald-700/50 text-emerald-300',
        purple: 'border-purple-700/50 text-purple-300',
    };
    return (
        <div className={`bg-[#0b0416]/80 border rounded-xl p-3 ${tones[tone]}`}>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
            <div className="text-xl font-black font-mono">{value}</div>
            {sub && <div className="text-[10px] text-slate-500 mt-1">{sub}</div>}
        </div>
    );
}

function median(arr) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const m = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function quantile(arr, q) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const i = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
    return sorted[i];
}

export default function AdminBalance({ walletAddress }) {
    const [period, setPeriod] = useState('all');
    const [excludeEndless, setExcludeEndless] = useState(true);

    const { data, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['adminBalance', walletAddress, period],
        queryFn: () => base44.functions.invoke('getAdminDataExtended', { type: 'scores', period })
            .then(r => r.data?.scores || []),
        enabled: !!walletAddress,
    });

    const rows = useMemo(() => {
        if (!data) return [];
        return excludeEndless ? data.filter(s => s.arena_id !== 'endless') : data;
    }, [data, excludeEndless]);

    // ── Character analysis ───────────────────────────────────────
    const charStats = useMemo(() => {
        const map = {};
        rows.forEach(s => {
            const id = s.character_id || 'unknown';
            if (!map[id]) map[id] = { id, runs: 0, scores: [], kills: 0, time: 0 };
            map[id].runs++;
            map[id].scores.push(Number(s.score) || 0);
            map[id].kills += Number(s.kills) || 0;
            map[id].time += Number(s.time_survived) || 0;
        });
        const total = rows.length;
        const list = Object.values(map).map(c => ({
            id: c.id,
            name: CHAR_LABELS[c.id] || c.id,
            runs: c.runs,
            pickPct: total ? Math.round((c.runs / total) * 100) : 0,
            avgScore: c.runs ? Math.round(c.scores.reduce((a, b) => a + b, 0) / c.runs) : 0,
            medianScore: Math.round(median(c.scores)),
            avgKills: c.runs ? Math.round(c.kills / c.runs) : 0,
            avgTime: c.runs ? Math.round(c.time / c.runs) : 0,
        }));
        return list.sort((a, b) => b.runs - a.runs);
    }, [rows]);

    // Median across all characters — used to flag outliers.
    const overallMedianScore = useMemo(
        () => Math.round(median(rows.map(s => Number(s.score) || 0))),
        [rows]
    );

    // ── Arena analysis ───────────────────────────────────────────
    const arenaStats = useMemo(() => {
        const map = {};
        rows.forEach(s => {
            const id = s.arena_id || 'unknown';
            if (!map[id]) map[id] = { id, runs: 0, scores: [], times: [] };
            map[id].runs++;
            map[id].scores.push(Number(s.score) || 0);
            map[id].times.push(Number(s.time_survived) || 0);
        });
        return Object.values(map).map(a => ({
            id: a.id,
            name: ARENA_LABELS[a.id] || a.id,
            runs: a.runs,
            avgScore: a.runs ? Math.round(a.scores.reduce((x, y) => x + y, 0) / a.runs) : 0,
            avgTime: a.runs ? Math.round(a.times.reduce((x, y) => x + y, 0) / a.runs) : 0,
            medianTime: Math.round(median(a.times)),
        })).sort((a, b) => b.runs - a.runs);
    }, [rows]);

    // ── Run length histogram (1-min buckets) ─────────────────────
    const runLengthHistogram = useMemo(() => {
        const buckets = {};
        rows.forEach(s => {
            const t = Number(s.time_survived) || 0;
            const minute = Math.min(15, Math.floor(t / 60)); // cap at 15+ min bucket
            buckets[minute] = (buckets[minute] || 0) + 1;
        });
        return Array.from({ length: 16 }, (_, i) => ({
            label: i === 15 ? '15m+' : `${i}-${i + 1}m`,
            count: buckets[i] || 0,
        }));
    }, [rows]);

    // ── Score distribution (deciles) ─────────────────────────────
    const scoreDeciles = useMemo(() => {
        const scores = rows.map(s => Number(s.score) || 0);
        if (!scores.length) return [];
        return Array.from({ length: 10 }, (_, i) => ({
            label: `P${(i + 1) * 10}`,
            value: Math.round(quantile(scores, (i + 1) / 10)),
        }));
    }, [rows]);

    // Detect characters significantly above/below the overall median (≥30%)
    const outliers = useMemo(() => {
        if (!overallMedianScore) return { strong: [], weak: [] };
        const strong = charStats.filter(c => c.runs >= 5 && c.medianScore > overallMedianScore * 1.3);
        const weak = charStats.filter(c => c.runs >= 5 && c.medianScore < overallMedianScore * 0.7);
        return { strong, weak };
    }, [charStats, overallMedianScore]);

    return (
        <div className="space-y-4">
            {/* Header + controls */}
            <div className="bg-[#0b0416]/80 border border-purple-900/50 rounded-xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h2 className="text-lg font-black text-purple-300 uppercase tracking-widest">⚖️ Balance Analytics</h2>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            Spot character/arena imbalances, score outliers and engagement issues across recent runs.
                        </p>
                    </div>
                    <button
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="px-3 py-1.5 rounded bg-purple-700/60 hover:bg-purple-600 text-white text-xs font-bold disabled:opacity-50"
                    >
                        {isFetching ? 'Refreshing…' : 'Refresh'}
                    </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Period</span>
                    <div className="flex gap-1">
                        {PERIODS.map(p => (
                            <button
                                key={p.id}
                                onClick={() => setPeriod(p.id)}
                                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                                    period === p.id ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <label className="flex items-center gap-2 ml-3 text-[11px] text-slate-300 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={excludeEndless}
                            onChange={e => setExcludeEndless(e.target.checked)}
                            className="accent-purple-500"
                        />
                        Exclude Endless (recommended — Endless skews scores)
                    </label>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-purple-500" /></div>
            ) : rows.length === 0 ? (
                <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6 text-center text-slate-400 text-sm">
                    No runs in the selected period.
                </div>
            ) : (
                <>
                    {/* Top stats */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        <StatTile label="Runs analyzed" value={rows.length.toLocaleString()} sub="capped at 200 newest" />
                        <StatTile label="Median score" value={overallMedianScore.toLocaleString()} tone="amber" />
                        <StatTile label="Active characters" value={charStats.length} tone="emerald" />
                        <StatTile label="Active arenas" value={arenaStats.length} tone="purple" />
                        <StatTile
                            label="Outliers"
                            value={`${outliers.strong.length} strong / ${outliers.weak.length} weak`}
                            sub="±30% vs median (≥5 runs)"
                            tone="rose"
                        />
                    </div>

                    {/* Outlier callouts */}
                    {(outliers.strong.length > 0 || outliers.weak.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {outliers.strong.length > 0 && (
                                <div className="bg-emerald-950/40 border border-emerald-700/50 rounded-xl p-3">
                                    <div className="text-emerald-300 font-bold text-sm uppercase tracking-wider mb-2">⬆️ Possibly overpowered</div>
                                    <ul className="text-xs text-slate-200 space-y-1">
                                        {outliers.strong.map(c => (
                                            <li key={c.id} className="flex justify-between">
                                                <span>{c.name}</span>
                                                <span className="font-mono text-emerald-300">
                                                    {c.medianScore.toLocaleString()} (×{(c.medianScore / overallMedianScore).toFixed(2)})
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {outliers.weak.length > 0 && (
                                <div className="bg-rose-950/40 border border-rose-700/50 rounded-xl p-3">
                                    <div className="text-rose-300 font-bold text-sm uppercase tracking-wider mb-2">⬇️ Possibly underpowered</div>
                                    <ul className="text-xs text-slate-200 space-y-1">
                                        {outliers.weak.map(c => (
                                            <li key={c.id} className="flex justify-between">
                                                <span>{c.name}</span>
                                                <span className="font-mono text-rose-300">
                                                    {c.medianScore.toLocaleString()} (×{(c.medianScore / overallMedianScore).toFixed(2)})
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Character pick-rate vs median score */}
                    <div className="bg-[#0b0416]/80 border border-cyan-900/50 rounded-xl p-4">
                        <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-widest mb-1">Character pick rate</h3>
                        <div className="text-[10px] text-slate-500 mb-3">How often each pilot is played in the sample</div>
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={charStats}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} angle={-15} textAnchor="end" height={50} />
                                    <YAxis stroke="#64748b" fontSize={10} />
                                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: 12 }}
                                        formatter={(v, _, p) => [`${v} runs (${p.payload.pickPct}%)`, 'Pick count']} />
                                    <Bar dataKey="runs" radius={[3, 3, 0, 0]}>
                                        {charStats.map((c, i) => (
                                            <Cell key={i} fill={outliers.strong.find(x => x.id === c.id) ? '#10b981'
                                                                : outliers.weak.find(x => x.id === c.id) ? '#f43f5e'
                                                                : '#22d3ee'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Character power table */}
                    <div className="bg-[#0b0416]/80 border border-amber-900/50 rounded-xl p-4">
                        <h3 className="text-sm font-bold text-amber-400 uppercase tracking-widest mb-1">Character power table</h3>
                        <div className="text-[10px] text-slate-500 mb-3">Sorted by median score (more robust to outlier god-runs than average)</div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-left text-slate-500 border-b border-slate-800 uppercase text-[10px] tracking-wider">
                                        <th className="py-2">Pilot</th>
                                        <th className="py-2 text-right">Runs</th>
                                        <th className="py-2 text-right">Pick %</th>
                                        <th className="py-2 text-right">Median</th>
                                        <th className="py-2 text-right">Avg</th>
                                        <th className="py-2 text-right">Avg kills</th>
                                        <th className="py-2 text-right">Avg time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...charStats].sort((a, b) => b.medianScore - a.medianScore).map(c => {
                                        const ratio = overallMedianScore ? c.medianScore / overallMedianScore : 1;
                                        const tone = ratio > 1.3 ? 'text-emerald-300' : ratio < 0.7 ? 'text-rose-300' : 'text-slate-200';
                                        return (
                                            <tr key={c.id} className="border-b border-slate-900/60 hover:bg-slate-900/40">
                                                <td className="py-1.5 text-slate-200">{c.name}</td>
                                                <td className="py-1.5 text-right text-slate-400 font-mono">{c.runs}</td>
                                                <td className="py-1.5 text-right text-slate-400 font-mono">{c.pickPct}%</td>
                                                <td className={`py-1.5 text-right font-mono font-bold ${tone}`}>{c.medianScore.toLocaleString()}</td>
                                                <td className="py-1.5 text-right text-slate-400 font-mono">{c.avgScore.toLocaleString()}</td>
                                                <td className="py-1.5 text-right text-slate-400 font-mono">{c.avgKills}</td>
                                                <td className="py-1.5 text-right text-slate-400 font-mono">{Math.floor(c.avgTime / 60)}m{c.avgTime % 60}s</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Arena analysis */}
                    <div className="bg-[#0b0416]/80 border border-purple-900/50 rounded-xl p-4">
                        <h3 className="text-sm font-bold text-purple-400 uppercase tracking-widest mb-1">Arena difficulty</h3>
                        <div className="text-[10px] text-slate-500 mb-3">Median time-survived per arena. Low values vs. arena duration ⇒ players dying early.</div>
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={arenaStats}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} angle={-15} textAnchor="end" height={60} />
                                    <YAxis stroke="#64748b" fontSize={10} unit="s" />
                                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: 12 }}
                                        formatter={(v) => [`${Math.floor(v / 60)}m ${v % 60}s`, 'Median time']} />
                                    <Bar dataKey="medianTime" fill="#a855f7" radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Run-length histogram */}
                    <div className="bg-[#0b0416]/80 border border-emerald-900/50 rounded-xl p-4">
                        <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-widest mb-1">Run length distribution</h3>
                        <div className="text-[10px] text-slate-500 mb-3">Spike on the low end ⇒ early-game difficulty cliff. Spike on the high end ⇒ Endless still leaking through.</div>
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={runLengthHistogram}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                                    <XAxis dataKey="label" stroke="#64748b" fontSize={10} />
                                    <YAxis stroke="#64748b" fontSize={10} />
                                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: 12 }} />
                                    <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Score distribution (deciles) */}
                    <div className="bg-[#0b0416]/80 border border-rose-900/50 rounded-xl p-4">
                        <h3 className="text-sm font-bold text-rose-400 uppercase tracking-widest mb-1">Score distribution (deciles)</h3>
                        <div className="text-[10px] text-slate-500 mb-3">P50 = median. Steep climb between P90 → P100 = very long top-end tail (potential cheaters).</div>
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={scoreDeciles}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                                    <XAxis dataKey="label" stroke="#64748b" fontSize={10} />
                                    <YAxis stroke="#64748b" fontSize={10} />
                                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: 12 }}
                                        formatter={(v) => [v.toLocaleString(), 'Score']} />
                                    <Line type="monotone" dataKey="value" stroke="#f43f5e" strokeWidth={2.5} dot={{ r: 4, fill: '#f43f5e' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}