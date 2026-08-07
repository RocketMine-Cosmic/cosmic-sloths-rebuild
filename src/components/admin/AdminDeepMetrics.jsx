import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Users, Layers, Gamepad2, Map as MapIcon, Shield } from 'lucide-react';
import moment from 'moment';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

// Deeper player metrics — cohort retention, level distribution, top characters
// & arenas, squad membership. Backed by getPlayerDeepMetrics which is cached
// server-side for 5 min and client-side via TanStack with the same staleTime.
// Designed to coexist with AdminRetention on the same page without doubling
// DB load — these queries are bounded and slow-changing.

function pctColor(p) {
    if (p === null || p === undefined) return 'text-slate-600';
    if (p >= 50) return 'text-emerald-400';
    if (p >= 30) return 'text-cyan-400';
    if (p >= 15) return 'text-amber-400';
    return 'text-red-400';
}

function CohortTable({ cohorts }) {
    if (!cohorts?.length) {
        return <div className="text-xs text-slate-500 italic p-2">No cohort data yet.</div>;
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700/50">
                    <tr>
                        <th className="p-2">Cohort (Week)</th>
                        <th className="p-2 text-right">Signups</th>
                        <th className="p-2 text-right">W+0</th>
                        <th className="p-2 text-right">W+1</th>
                        <th className="p-2 text-right">W+2</th>
                        <th className="p-2 text-right">W+3</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                    {cohorts.slice().reverse().map(c => (
                        <tr key={c.cohort_week} className="hover:bg-slate-800/30">
                            <td className="p-2 font-mono text-white whitespace-nowrap">
                                {moment(c.cohort_week).format('MMM D')}
                                <span className="text-slate-600 ml-2 text-[10px]">{c.age_weeks}w ago</span>
                            </td>
                            <td className="p-2 text-right font-mono font-bold text-cyan-300">{c.signups}</td>
                            <td className="p-2 text-right font-mono text-emerald-400">{c.w0 || 0} <span className="text-slate-600 text-[10px]">(100%)</span></td>
                            <td className={`p-2 text-right font-mono ${pctColor(c.w1_pct)}`}>{c.w1_pct === null ? '—' : `${c.w1} (${c.w1_pct}%)`}</td>
                            <td className={`p-2 text-right font-mono ${pctColor(c.w2_pct)}`}>{c.w2_pct === null ? '—' : `${c.w2} (${c.w2_pct}%)`}</td>
                            <td className={`p-2 text-right font-mono ${pctColor(c.w3_pct)}`}>{c.w3_pct === null ? '—' : `${c.w3} (${c.w3_pct}%)`}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function TopList({ items, label }) {
    if (!items?.length) {
        return <div className="text-xs text-slate-500 italic p-2">No runs in this window.</div>;
    }
    const max = items[0]?.runs || 1;
    return (
        <div className="space-y-1.5">
            {items.map((it, idx) => (
                <div key={it.id} className="flex items-center gap-2 text-xs">
                    <div className="w-6 text-right font-mono text-slate-500">#{idx + 1}</div>
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-2">
                            <span className="font-bold text-white truncate">{it.id}</span>
                            <span className="font-mono text-slate-400 whitespace-nowrap">{it.runs.toLocaleString()} <span className="text-slate-600">({it.share_pct}%)</span></span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded overflow-hidden mt-0.5">
                            <div className="h-full bg-cyan-500/70" style={{ width: `${(it.runs / max) * 100}%` }} />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function AdminDeepMetrics() {
    const { data, isLoading, isFetching, error, refetch } = useQuery({
        queryKey: ['playerDeepMetrics'],
        queryFn: () => base44.functions.invoke('getPlayerDeepMetrics', {}).then(r => r.data),
        staleTime: 5 * 60_000,
        refetchOnWindowFocus: false,
    });

    if (isLoading) {
        return (
            <div className="bg-[#0b0416]/80 border border-purple-900/50 rounded-xl p-8 text-center text-slate-400">
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                Loading deep metrics...
            </div>
        );
    }
    if (error || data?.error) {
        return (
            <div className="bg-red-950/40 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
                Failed to load deep metrics: {error?.message || data?.error}
            </div>
        );
    }

    const {
        cohorts = [],
        level_distribution = [],
        top_characters = [],
        top_arenas = [],
        squad_membership = {},
        top_run_count = 0,
    } = data || {};

    const LEVEL_COLORS = ['#64748b', '#06b6d4', '#0891b2', '#10b981', '#f59e0b', '#a855f7', '#ec4899'];

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h2 className="text-base font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">
                        <Layers size={16} /> Deep Player Metrics
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        Updated {data?.generated_at ? moment(data.generated_at).fromNow() : 'just now'}
                        {data?.cached && <span className="ml-2 text-slate-600">(5 min cache)</span>}
                    </p>
                </div>
                <button
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 px-3 py-1.5 rounded border border-slate-700 font-bold uppercase tracking-wider"
                >
                    {isFetching ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>

            {/* Cohort retention */}
            <div className="bg-[#0b0416]/80 border border-purple-900/40 rounded-xl p-4">
                <h3 className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Users size={12} /> Weekly Signup Cohorts — Retention
                </h3>
                <p className="text-[11px] text-slate-500 mb-3">
                    For each weekly cohort: how many signed up, then how many were still active by W+1, W+2, W+3.
                    Higher % = stickier players. Green ≥50%, cyan ≥30%, amber ≥15%, red below.
                </p>
                <CohortTable cohorts={cohorts} />
            </div>

            {/* Level distribution + Squad membership side-by-side */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-[#0b0416]/80 border border-cyan-900/40 rounded-xl p-4 md:col-span-2">
                    <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Gamepad2 size={12} /> Player Level Distribution (14d Active)
                    </h3>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={level_distribution} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                <XAxis dataKey="bucket" tick={{ fill: '#64748b', fontSize: 10 }} />
                                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
                                <Tooltip
                                    contentStyle={{ background: '#0b0416', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                                    labelStyle={{ color: '#cbd5e1' }}
                                />
                                <Bar dataKey="count" name="Players" radius={[4, 4, 0, 0]}>
                                    {level_distribution.map((entry, idx) => (
                                        <Cell key={idx} fill={LEVEL_COLORS[idx % LEVEL_COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-[#0b0416]/80 border border-emerald-900/40 rounded-xl p-4 flex flex-col justify-between">
                    <div>
                        <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Shield size={12} /> Squad Membership (14d)
                        </h3>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">In a squad</span>
                                <span className="font-mono font-bold text-emerald-300">{squad_membership.in_squad || 0}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">Solo</span>
                                <span className="font-mono font-bold text-slate-300">{squad_membership.solo || 0}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">Total active</span>
                                <span className="font-mono font-bold text-cyan-300">{squad_membership.total_active || 0}</span>
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-800">
                        <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">% in a squad</div>
                        <div className="flex items-end gap-1">
                            <span className="text-3xl font-mono font-black text-emerald-400">{squad_membership.pct_in_squad || 0}</span>
                            <span className="text-lg font-mono text-emerald-600 mb-0.5">%</span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded overflow-hidden mt-2">
                            <div className="h-full bg-emerald-500" style={{ width: `${squad_membership.pct_in_squad || 0}%` }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Top characters + Top arenas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-[#0b0416]/80 border border-cyan-900/40 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Gamepad2 size={12} /> Most-Played Characters (14d)
                    </h3>
                    <TopList items={top_characters} label="character" />
                </div>
                <div className="bg-[#0b0416]/80 border border-amber-900/40 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <MapIcon size={12} /> Most-Played Arenas (14d)
                    </h3>
                    <TopList items={top_arenas} label="arena" />
                </div>
            </div>

            <div className="text-[10px] text-slate-600 italic px-1">
                Cohort retention reads DailyActivityLog (true per-week activity, not approximated from a single timestamp). Top characters/arenas read RunHistoryLog — an immutable per-run mirror that survives the keep-top-scores cleanup cron, so totals don't shrink. Based on {top_run_count.toLocaleString()} runs in the last 14 days. Cohorts: 60-day window. 4 bounded DB reads per refresh, cached server-side 5 min.
            </div>
        </div>
    );
}