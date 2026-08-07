import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Users, TrendingUp, UserPlus, Clock, AlertCircle } from 'lucide-react';
import moment from 'moment';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Line, LineChart } from 'recharts';

// Lightweight retention / activity dashboard. Backed by getPlayerRetention which
// is cached server-side for 60s, and the client uses TanStack Query with a 60s
// staleTime — tab swaps inside the dashboard don't refire the call.

function StatTile({ icon: Icon, label, value, sub, accent = 'cyan' }) {
    const colors = {
        cyan:    { border: 'border-cyan-700/40',   bg: 'bg-cyan-950/30',   text: 'text-cyan-300',   icon: 'text-cyan-400' },
        emerald: { border: 'border-emerald-700/40', bg: 'bg-emerald-950/30', text: 'text-emerald-300', icon: 'text-emerald-400' },
        purple:  { border: 'border-purple-700/40', bg: 'bg-purple-950/30', text: 'text-purple-300', icon: 'text-purple-400' },
        amber:   { border: 'border-amber-700/40',  bg: 'bg-amber-950/30',  text: 'text-amber-300',  icon: 'text-amber-400' },
    };
    const c = colors[accent] || colors.cyan;
    return (
        <div className={`${c.bg} border ${c.border} rounded-xl p-4 flex flex-col gap-1`}>
            <div className="flex items-center gap-2">
                <Icon size={14} className={c.icon} />
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{label}</span>
            </div>
            <div className={`text-2xl font-mono font-black ${c.text}`}>{value}</div>
            {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
        </div>
    );
}

export default function AdminRetention() {
    const { data, isLoading, isFetching, error, refetch } = useQuery({
        queryKey: ['playerRetention'],
        queryFn: () => base44.functions.invoke('getPlayerRetention', {}).then(r => r.data),
        staleTime: 60_000,
        refetchOnWindowFocus: false,
    });

    if (isLoading) {
        return (
            <div className="bg-[#0b0416]/80 border border-cyan-900/50 rounded-xl p-8 text-center text-slate-400">
                <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                Loading player retention data...
            </div>
        );
    }
    if (error || data?.error) {
        return (
            <div className="bg-red-950/40 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
                Failed to load retention data: {error?.message || data?.error}
            </div>
        );
    }

    const { totals = {}, daily = [], hourly_today = [], top_active = [], stale_signups = [] } = data || {};

    // Stickiness ratio — % of weekly actives who came back today. Standard
    // industry metric for "is the playerbase engaged?". 20%+ is healthy for
    // casual games.
    const stickiness = totals.wau > 0 ? ((totals.dau / totals.wau) * 100).toFixed(0) : '0';

    const dailyChartData = daily.map(d => ({
        ...d,
        label: moment(d.date).format('MMM D'),
    }));

    const hourlyChartData = hourly_today.map((h, idx) => {
        // h.hour is the bucket index 0..23 where 23 = "current hour", 0 = "23h ago"
        const hoursAgo = 23 - h.hour;
        const ms = Date.now() - hoursAgo * 60 * 60 * 1000;
        return {
            ...h,
            label: moment(ms).format('HH:00'),
        };
    });

    return (
        <div className="space-y-4">
            {/* Header + refresh */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h2 className="text-base font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                        <TrendingUp size={16} /> Player Retention & Activity
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        Updated {data?.generated_at ? moment(data.generated_at).fromNow() : 'just now'}
                        {data?.cached && <span className="ml-2 text-slate-600">(60s cache)</span>}
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

            {/* KPI tiles */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatTile icon={Users}     label="DAU"            value={totals.dau || 0}                          sub="Active in last 24h"            accent="cyan" />
                <StatTile icon={Users}     label="WAU"            value={totals.wau || 0}                          sub="Active in last 7d"             accent="emerald" />
                <StatTile icon={Users}     label="MAU"            value={totals.mau || 0}                          sub="Active in last 30d"            accent="purple" />
                <StatTile icon={TrendingUp} label="Stickiness"    value={`${stickiness}%`}                         sub="DAU / WAU"                     accent="amber" />
                <StatTile icon={UserPlus}  label="Total Players"  value={totals.all_time_players || 0}             sub="All-time signups"              accent="cyan" />
            </div>

            {/* 14-day chart — active players + new signups stacked */}
            <div className="bg-[#0b0416]/80 border border-slate-800 rounded-xl p-4">
                <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3">14-Day Daily Active Players</h3>
                <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dailyChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} />
                            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
                            <Tooltip
                                contentStyle={{ background: '#0b0416', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                                labelStyle={{ color: '#cbd5e1' }}
                            />
                            <Bar dataKey="active" name="Active" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="new_players" name="New" fill="#10b981" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex gap-4 mt-2 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-cyan-500"></span>Active Players</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500"></span>New Signups</span>
                </div>
            </div>

            {/* 24h hourly heartbeat */}
            <div className="bg-[#0b0416]/80 border border-slate-800 rounded-xl p-4">
                <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Clock size={12} /> Last 24 Hours — Hourly Active
                </h3>
                <div className="h-40 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={hourlyChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} interval={2} />
                            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} allowDecimals={false} />
                            <Tooltip
                                contentStyle={{ background: '#0b0416', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                                labelStyle={{ color: '#cbd5e1' }}
                            />
                            <Line type="monotone" dataKey="active" stroke="#a855f7" strokeWidth={2} dot={{ r: 2, fill: '#a855f7' }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Side-by-side: top active + stale signups */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-[#0b0416]/80 border border-emerald-900/40 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Users size={12} /> Most Recently Active (Top 20)
                    </h3>
                    <div className="overflow-x-auto max-h-72 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700/50 sticky top-0">
                                <tr>
                                    <th className="p-2">Player</th>
                                    <th className="p-2">Wallet</th>
                                    <th className="p-2 text-right">Last Seen</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {top_active.map((p, idx) => (
                                    <tr key={idx} className="hover:bg-slate-800/30">
                                        <td className="p-2 font-bold text-white whitespace-nowrap">{p.player_name}</td>
                                        <td className="p-2 text-slate-500 font-mono text-[10px]">{p.wallet_address ? `${p.wallet_address.slice(0,6)}...${p.wallet_address.slice(-4)}` : '-'}</td>
                                        <td className="p-2 text-right text-emerald-400 font-mono text-[10px] whitespace-nowrap">{p.updated_at ? moment(p.updated_at).fromNow() : '-'}</td>
                                    </tr>
                                ))}
                                {top_active.length === 0 && (
                                    <tr><td colSpan="3" className="p-4 text-center text-slate-500">No recent activity.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bg-[#0b0416]/80 border border-amber-900/40 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <AlertCircle size={12} /> Stale Signups (Joined &gt;7d, Inactive &gt;7d)
                    </h3>
                    <div className="overflow-x-auto max-h-72 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700/50 sticky top-0">
                                <tr>
                                    <th className="p-2">Player</th>
                                    <th className="p-2 text-right">Joined</th>
                                    <th className="p-2 text-right">Last Seen</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {stale_signups.map((p, idx) => (
                                    <tr key={idx} className="hover:bg-slate-800/30">
                                        <td className="p-2 font-bold text-white whitespace-nowrap">{p.player_name}</td>
                                        <td className="p-2 text-right text-slate-400 font-mono text-[10px] whitespace-nowrap">{p.created_date ? moment(p.created_date).fromNow() : '-'}</td>
                                        <td className="p-2 text-right text-amber-400 font-mono text-[10px] whitespace-nowrap">{p.last_seen ? moment(p.last_seen).fromNow() : '-'}</td>
                                    </tr>
                                ))}
                                {stale_signups.length === 0 && (
                                    <tr><td colSpan="3" className="p-4 text-center text-slate-500">No stale signups — everyone's coming back!</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div className="text-[10px] text-slate-600 italic px-1">
                DAU/WAU/MAU read from PlayerSave (moving windows — accurate). 14-day chart + 24h heartbeat read from DailyActivityLog (immutable per-(wallet,day) rows written on first save of each day, so historical bars don't shift). Two bounded reads per refresh, cached 60s.
            </div>
        </div>
    );
}