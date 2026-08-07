import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Coins, Clock } from 'lucide-react';
import moment from 'moment';
import SpendLogDescription from './SpendLogDescription';
import AdminCleanupSpendLogs from './AdminCleanupSpendLogs';

export default function AdminEconomy({ walletAddress }) {
    const [preset, setPreset] = useState('this_week');
    const [search, setSearch] = useState('');

    const PRESETS = [
        { id: 'today',      label: 'Today' },
        { id: 'this_week',  label: 'This Week' },
        { id: 'last_week',  label: 'Last Week' },
        { id: 'this_month', label: 'This Month' },
        { id: 'all',        label: 'All Time' },
    ];

    // Use UTC for all range math so admin timezone doesn't shift the week boundary.
    // Spend logs are stamped with UTC week_id; without this, an admin in BST at 00:30
    // sees an empty "This Week" because their local Monday has rolled over but UTC
    // is still Sunday (W18). All comparisons stay in UTC end-to-end.
    const getDateRange = (p) => {
        const now = moment.utc();
        if (p === 'today')      return [now.clone().startOf('day'), now.clone().endOf('day')];
        if (p === 'this_week')  return [now.clone().startOf('isoWeek'), now.clone().endOf('isoWeek')];
        if (p === 'last_week')  return [now.clone().subtract(1, 'week').startOf('isoWeek'), now.clone().subtract(1, 'week').endOf('isoWeek')];
        if (p === 'this_month') return [now.clone().startOf('month'), now.clone().endOf('month')];
        return [null, null];
    };

    const { data: spendLogs, isLoading: logsLoading } = useQuery({
        queryKey: ['tokenSpendLogs', walletAddress],
        queryFn: () => base44.functions.invoke('getAdminData', { type: 'logs' }).then(r => r.data?.logs || []),
        enabled: !!walletAddress
    });

    // Share cache key + staleTime with useAvailablePeriods/AdminRewards — was firing
    // a duplicate parallel call on dashboard mount, contributing to 429 rate-limit
    // errors that left period dropdowns empty.
    const { data: pools, isLoading: poolsLoading } = useQuery({
        queryKey: ['adminPoolsForPeriods', walletAddress],
        queryFn: () => base44.functions.invoke('getAdminData', { type: 'pools' }).then(r => r.data?.pools || []),
        enabled: !!walletAddress,
        staleTime: 60_000,
    });

    const [start, end] = getDateRange(preset);
    const q = search.trim().toLowerCase();
    const filteredLogs = (spendLogs || []).filter(log => {
        if (start) {
            const d = moment.utc(log.created_date);
            if (!d.isSameOrAfter(start) || !d.isSameOrBefore(end)) return false;
        }
        if (q) {
            const name = (log.player_name || '').toLowerCase();
            const wallet = (log.wallet_address || '').toLowerCase();
            if (!name.includes(q) && !wallet.includes(q)) return false;
        }
        return true;
    });
    const filteredTotal = filteredLogs.reduce((s, l) => s + Number(l.amount || 0), 0);
    
    // Calculate pool total for the current period to show excluded amount
    const currentPeriod = preset === 'this_week' ? moment.utc().format('gggg-[W]WW') : 
                          preset === 'last_week' ? moment.utc().subtract(1, 'week').format('gggg-[W]WW') : null;
    const poolTotal = currentPeriod ? (pools || []).find(p => p.period_id === currentPeriod)?.total_spent || 0 : 0;
    const excludedAmount = poolTotal > 0 ? Math.round((filteredTotal - poolTotal) * 100) / 100 : 0;

    return (
        <div className="space-y-4">
            {/* Token Pools */}
            <div className="bg-[#0b0416]/80 border border-cyan-900/50 rounded-xl p-4">
                <h2 className="text-base font-bold text-cyan-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Coins size={16} /> Token Pools</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700/50">
                            <tr>
                                <th className="p-2">Period</th>
                                <th className="p-2">Type</th>
                                <th className="p-2 text-right">Total Spent</th>
                                <th className="p-2 text-center">Distributed</th>
                                <th className="p-2">Created</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {(pools || []).sort((a, b) => b.period_id.localeCompare(a.period_id)).map(p => (
                                <tr key={p.id} className="hover:bg-slate-800/30">
                                    <td className="p-2 font-mono font-bold text-white">{p.period_id}</td>
                                    <td className="p-2">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${p.period_type === 'weekly' ? 'bg-cyan-900/50 text-cyan-400' : 'bg-purple-900/50 text-purple-400'}`}>
                                            {p.period_type}
                                        </span>
                                    </td>
                                    <td className="p-2 text-right font-mono font-bold text-amber-400">{Number(p.total_spent).toFixed(2)} OMENX</td>
                                    <td className="p-2 text-center">
                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${p.distributed ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                                            {p.distributed ? 'Yes' : 'No'}
                                        </span>
                                    </td>
                                    <td className="p-2 text-slate-500 font-mono text-[10px]">{moment(p.created_date).format('MMM D, YYYY')}</td>
                                </tr>
                            ))}
                            {poolsLoading && <tr><td colSpan="5" className="p-4 text-center text-slate-500">Loading...</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            <AdminCleanupSpendLogs />

            {/* Audit Trail */}
            <div className="bg-[#0b0416]/80 border border-slate-700/50 rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                    <h2 className="text-base font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2"><Clock size={16} className="text-slate-400" /> Audit Trail</h2>
                    <div className="flex gap-1 ml-auto flex-wrap">
                        {PRESETS.map(p => (
                            <button key={p.id} onClick={() => setPreset(p.id)}
                                className={`px-3 py-1 rounded text-xs font-bold transition-colors ${preset === p.id ? 'bg-slate-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    <div className="relative flex-1 min-w-[240px] max-w-md">
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Filter by player name or wallet…"
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs">✕</button>
                        )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono ml-auto">
                        {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'} • <span className="text-amber-400">{filteredTotal.toFixed(2)} OMENX</span>
                        {excludedAmount > 0 && <span className="text-slate-400 ml-2">({poolTotal.toFixed(2)} in pool + <span className="text-slate-500">{excludedAmount.toFixed(2)} excluded</span>)</span>}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700/50">
                            <tr>
                                <th className="p-2">Timestamp</th>
                                <th className="p-2">Player</th>
                                <th className="p-2">Wallet</th>
                                <th className="p-2">Purchased</th>
                                <th className="p-2 text-right">Amount</th>
                                <th className="p-2">Week</th>
                                <th className="p-2">Season</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {filteredLogs.map(log => (
                                <tr key={log.id} className="hover:bg-slate-800/30">
                                    <td className="p-2 text-slate-400 font-mono text-[10px] whitespace-nowrap">{moment(log.created_date).format('MMM D, YYYY HH:mm:ss')}</td>
                                    <td className="p-2 font-bold text-white whitespace-nowrap">{log.player_name}</td>
                                    <td className="p-2 text-slate-500 font-mono text-[10px]" title={log.wallet_address}>{log.wallet_address ? `${log.wallet_address.slice(0,6)}...${log.wallet_address.slice(-4)}` : '-'}</td>
                                    <td className="p-2"><SpendLogDescription log={log} /></td>
                                    <td className="p-2 text-right font-mono font-bold text-cyan-400">{log.amount} OMENX</td>
                                    <td className="p-2 text-slate-500 font-mono text-[10px]">{log.week_id || '-'}</td>
                                    <td className="p-2 text-slate-500 font-mono text-[10px]">{log.season_id || '-'}</td>
                                </tr>
                            ))}
                            {logsLoading && <tr><td colSpan="7" className="p-4 text-center text-slate-500">Loading...</td></tr>}
                            {!logsLoading && !filteredLogs.length && <tr><td colSpan="7" className="p-6 text-center text-slate-500">No spend logs found.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}