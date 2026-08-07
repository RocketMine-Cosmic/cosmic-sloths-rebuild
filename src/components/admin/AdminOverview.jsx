import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, ReferenceLine } from 'recharts';
import RecentChanges from './RecentChanges';
import DistributionTimer from './DistributionTimer';

function StatCard({ label, value, color = 'text-white', sub }) {
    return (
        <div className="bg-[#0b0416]/80 border border-slate-700/50 rounded-xl p-4">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
            <div className={`text-2xl font-black font-mono ${color}`}>{value}</div>
            {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
        </div>
    );
}

export default function AdminOverview({ walletAddress, canViewFinance = false }) {
    // staleTime keeps the cached data "fresh" so swapping tabs doesn't refire the
    // query — pools/overview don't change minute-to-minute. 5 min is plenty.
    const { data: pools } = useQuery({
        queryKey: ['adminPools', walletAddress],
        queryFn: () => base44.functions.invoke('getAdminData', { type: 'pools' }).then(r => r.data?.pools || []),
        enabled: !!walletAddress && canViewFinance,
        staleTime: 5 * 60_000,
        refetchOnWindowFocus: false,
    });

    const { data: ext } = useQuery({
        queryKey: ['adminExt-overview', walletAddress],
        queryFn: () => base44.functions.invoke('getAdminDataExtended', { type: 'overview' }).then(r => r.data || {}),
        enabled: !!walletAddress,
        staleTime: 5 * 60_000,
        refetchOnWindowFocus: false,
    });

    const weeklyData = (pools || []).filter(p => p.period_type === 'weekly')
        .sort((a, b) => a.period_id.localeCompare(b.period_id))
        .slice(-10);
    const seasonalData = (pools || []).filter(p => p.period_type === 'seasonal')
        .sort((a, b) => a.period_id.localeCompare(b.period_id));

    // Sum only weekly pools — seasonal pools aggregate the same spend (4 weeks each),
    // so summing both period types double-counts every transaction.
    const totalSpent = (pools || [])
        .filter(p => p.period_type === 'weekly')
        .reduce((s, p) => s + (p.total_spent || 0), 0);
    const weeklySpent = weeklyData.slice(-1)[0]?.total_spent || 0;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                    label="Recent Players"
                    value={ext ? `${ext.totalPlayers}${ext.playersCapped ? '+' : ''}` : '...'}
                    color="text-cyan-400"
                    sub={ext?.playersCapped ? 'Sampled (latest 1000)' : null}
                />
                <StatCard
                    label="Recent Scores"
                    value={ext ? `${ext.totalScores}${ext.scoresCapped ? '+' : ''}` : '...'}
                    color="text-purple-400"
                    sub={ext?.scoresCapped ? 'Sampled (latest 1000)' : null}
                />
                {canViewFinance ? (
                    <>
                        <StatCard label="This Week Spent" value={`${weeklySpent.toFixed(1)} OMENX`} color="text-red-400" />
                        <StatCard label="All-Time Spent" value={`${totalSpent.toFixed(1)} OMENX`} color="text-amber-400" />
                    </>
                ) : (
                    <>
                        <StatCard label="This Week Spent" value="🔒 hidden" color="text-slate-500" sub="Requires view_finance" />
                        <StatCard label="All-Time Spent" value="🔒 hidden" color="text-slate-500" sub="Requires view_finance" />
                    </>
                )}
            </div>

            <DistributionTimer />

            <RecentChanges />

            {!canViewFinance && (
                <div className="bg-slate-900/40 border border-slate-700/40 rounded-xl p-3 text-xs text-slate-400">
                    💵 Revenue charts are hidden. Ask an owner to grant the <span className="font-mono text-slate-300">view_finance</span> permission if you need them.
                </div>
            )}

            {canViewFinance && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#0b0416]/80 border border-red-900/50 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-red-400 uppercase tracking-widest mb-3">Weekly Token Spend</h3>
                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={weeklyData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                                <XAxis dataKey="period_id" stroke="#64748b" fontSize={10} />
                                <YAxis stroke="#64748b" fontSize={10} />
                                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', fontSize: 12 }} />
                                <Bar dataKey="total_spent" name="OMENX Spent" fill="#ef4444" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="bg-[#0b0416]/80 border border-orange-900/50 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-orange-400 uppercase tracking-widest mb-3">Seasonal Token Spend</h3>
                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={seasonalData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                                <XAxis dataKey="period_id" stroke="#64748b" fontSize={10} />
                                <YAxis stroke="#64748b" fontSize={10} />
                                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', fontSize: 12 }} />
                                <Line type="monotone" dataKey="total_spent" name="OMENX Spent" stroke="#f97316" strokeWidth={2} dot={{ r: 4, fill: '#f97316' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            )}

            {/* Revenue per Week trend — last 12 weeks as a line */}
            {canViewFinance && weeklyData.length > 0 && (
                <div className="bg-[#0b0416]/80 border border-emerald-900/50 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-widest mb-1">Revenue Trend (Weekly OMENX Spend)</h3>
                    <div className="text-[10px] text-slate-500 mb-3">Last {weeklyData.length} weeks — rising line = growing engagement</div>
                    <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={weeklyData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                                <XAxis dataKey="period_id" stroke="#64748b" fontSize={10} />
                                <YAxis stroke="#64748b" fontSize={10} />
                                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', fontSize: 12 }} formatter={(v) => [`${v.toFixed(1)} OMENX`, 'Spent']} />
                                <Line type="monotone" dataKey="total_spent" stroke="#34d399" strokeWidth={2.5} dot={{ r: 4, fill: '#34d399' }} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {ext?.topCharacters && (
                <div className="bg-[#0b0416]/80 border border-purple-900/50 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-purple-400 uppercase tracking-widest mb-3">Top Characters (by runs)</h3>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={ext.topCharacters}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                                <XAxis dataKey="character_id" stroke="#64748b" fontSize={10} />
                                <YAxis stroke="#64748b" fontSize={10} />
                                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc', fontSize: 12 }} />
                                <Bar dataKey="count" name="Runs" fill="#a855f7" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    );
}