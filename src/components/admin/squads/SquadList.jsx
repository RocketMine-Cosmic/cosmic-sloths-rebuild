import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Shield, Search } from 'lucide-react';
import moment from 'moment';

const SORTS = [
    { key: 'weekly_kills', label: 'Weekly Kills' },
    { key: 'level',        label: 'Level' },
    { key: 'xp',           label: 'XP' },
    { key: 'member_count', label: 'Members' },
    { key: 'treasury_gold',label: 'Treasury' },
    { key: 'war_wins',     label: 'War Wins' },
    { key: 'created_date', label: 'Newest' },
];

export default function SquadList({ walletAddress, selectedId, onSelect }) {
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState('weekly_kills');

    const { data, isLoading } = useQuery({
        queryKey: ['adminSquads', walletAddress],
        queryFn: () => base44.functions.invoke('getAdminDataExtended', { type: 'squads' }).then(r => r.data?.squads || []),
        enabled: !!walletAddress,
        staleTime: 30_000,
    });

    const filtered = useMemo(() => {
        const list = (data || []).filter(s =>
            !search ||
            s.name?.toLowerCase().includes(search.toLowerCase()) ||
            s.tag?.toLowerCase().includes(search.toLowerCase()) ||
            s.id?.includes(search)
        );
        return list.sort((a, b) => {
            if (sortKey === 'created_date') return new Date(b.created_date) - new Date(a.created_date);
            return (b[sortKey] || 0) - (a[sortKey] || 0);
        });
    }, [data, search, sortKey]);

    return (
        <div className="bg-[#0b0416]/80 border border-orange-900/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
                <h2 className="text-sm font-bold text-orange-400 uppercase tracking-widest flex items-center gap-2"><Shield size={14} /> All Squads</h2>
                <span className="text-[10px] text-slate-500">{filtered.length} shown</span>
                <div className="ml-auto flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                        <input
                            type="text"
                            placeholder="name, tag, or id…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="bg-slate-900 border border-slate-700 text-white rounded pl-7 pr-2 py-1.5 text-xs focus:outline-none focus:border-orange-500 w-52"
                        />
                    </div>
                    <select
                        value={sortKey}
                        onChange={e => setSortKey(e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-white rounded px-2 py-1.5 text-xs focus:outline-none focus:border-orange-500"
                    >
                        {SORTS.map(s => <option key={s.key} value={s.key}>Sort: {s.label}</option>)}
                    </select>
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-orange-500"></div></div>
            ) : (
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/70 text-slate-400 border-b border-slate-700/50 sticky top-0 z-10">
                            <tr>
                                <th className="p-2">Squad</th>
                                <th className="p-2">Tag</th>
                                <th className="p-2 text-center">Mem</th>
                                <th className="p-2 text-center">Lvl</th>
                                <th className="p-2 text-right">Weekly</th>
                                <th className="p-2 text-right">Daily</th>
                                <th className="p-2 text-right">Treasury</th>
                                <th className="p-2 text-center">Buff</th>
                                <th className="p-2 text-center">W-L-T</th>
                                <th className="p-2">Created</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {filtered.map(squad => {
                                const isSelected = selectedId === squad.id;
                                const activeBuff = squad.active_buff_tier || '';
                                const pendingBuff = squad.pending_buff_tier || '';
                                return (
                                    <tr
                                        key={squad.id}
                                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-orange-900/30 ring-1 ring-orange-500/50' : 'hover:bg-slate-800/30'}`}
                                        onClick={() => onSelect(squad.id)}
                                    >
                                        <td className="p-2 font-bold text-white whitespace-nowrap">{squad.icon} {squad.name}</td>
                                        <td className="p-2 text-orange-400 font-mono font-bold">[{squad.tag}]</td>
                                        <td className="p-2 text-center text-slate-300">{squad.member_count || 0}</td>
                                        <td className="p-2 text-center font-mono text-purple-400">{squad.level || 1}</td>
                                        <td className="p-2 text-right font-mono text-green-400">{(squad.weekly_kills || 0).toLocaleString()}</td>
                                        <td className="p-2 text-right font-mono text-blue-400">{(squad.daily_kills || 0).toLocaleString()}</td>
                                        <td className="p-2 text-right font-mono text-amber-300">{(squad.treasury_gold || 0).toLocaleString()}</td>
                                        <td className="p-2 text-center text-[10px] whitespace-nowrap">
                                            {activeBuff && <span className="text-emerald-300 font-bold">{activeBuff[0].toUpperCase()}</span>}
                                            {activeBuff && pendingBuff && <span className="text-slate-500"> → </span>}
                                            {pendingBuff && <span className="text-cyan-300 font-bold">{pendingBuff[0].toUpperCase()}</span>}
                                            {!activeBuff && !pendingBuff && <span className="text-slate-600">—</span>}
                                        </td>
                                        <td className="p-2 text-center font-mono text-[10px] text-slate-300">
                                            <span className="text-emerald-400">{squad.war_wins || 0}</span>-
                                            <span className="text-red-400">{squad.war_losses || 0}</span>-
                                            <span className="text-yellow-400">{squad.war_ties || 0}</span>
                                        </td>
                                        <td className="p-2 text-slate-500 text-[10px] whitespace-nowrap">{moment(squad.created_date).format('MMM D')}</td>
                                    </tr>
                                );
                            })}
                            {!filtered.length && (
                                <tr><td colSpan="10" className="p-6 text-center text-slate-500">No squads found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}