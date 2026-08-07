import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Shield } from 'lucide-react';
import moment from 'moment';

export default function AdminSquads({ walletAddress }) {
    const [selected, setSelected] = useState(null);
    const [search, setSearch] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['adminSquads', walletAddress],
        queryFn: () => base44.functions.invoke('getAdminDataExtended', { type: 'squads' }).then(r => r.data?.squads || []),
        enabled: !!walletAddress
    });

    const filtered = (data || []).filter(s =>
        !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.tag?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-4">
            <div className="bg-[#0b0416]/80 border border-orange-900/50 rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <h2 className="text-base font-bold text-orange-400 uppercase tracking-widest flex items-center gap-2"><Shield size={16} /> Squads</h2>
                    <input
                        type="text"
                        placeholder="Search by name or tag..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="ml-auto bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 text-xs focus:outline-none focus:border-orange-500 w-48"
                    />
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-orange-500"></div></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700/50">
                                <tr>
                                    <th className="p-2">Squad</th>
                                    <th className="p-2">Tag</th>
                                    <th className="p-2 text-center">Members</th>
                                    <th className="p-2 text-right">Weekly Kills</th>
                                    <th className="p-2 text-right">Daily Kills</th>
                                    <th className="p-2 text-center">Level</th>
                                    <th className="p-2 text-right">XP</th>
                                    <th className="p-2">Created</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {filtered.sort((a, b) => (b.weekly_kills || 0) - (a.weekly_kills || 0)).map(squad => (
                                    <tr key={squad.id} className="hover:bg-slate-800/30 cursor-pointer transition-colors" onClick={() => setSelected(selected?.id === squad.id ? null : squad)}>
                                        <td className="p-2 font-bold text-white whitespace-nowrap">{squad.icon} {squad.name}</td>
                                        <td className="p-2 text-orange-400 font-mono font-bold">[{squad.tag}]</td>
                                        <td className="p-2 text-center text-slate-300">{squad.member_count || 0}</td>
                                        <td className="p-2 text-right font-mono text-green-400">{(squad.weekly_kills || 0).toLocaleString()}</td>
                                        <td className="p-2 text-right font-mono text-blue-400">{(squad.daily_kills || 0).toLocaleString()}</td>
                                        <td className="p-2 text-center font-mono text-purple-400">{squad.level || 1}</td>
                                        <td className="p-2 text-right font-mono text-yellow-400">{(squad.xp || 0).toLocaleString()}</td>
                                        <td className="p-2 text-slate-500 text-[10px] whitespace-nowrap">{moment(squad.created_date).format('MMM D, YYYY')}</td>
                                    </tr>
                                ))}
                                {!filtered.length && (
                                    <tr><td colSpan="8" className="p-6 text-center text-slate-500">No squads found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {selected && (
                    <div className="mt-4 bg-slate-900/60 border border-orange-700/50 rounded-xl p-4">
                        <h3 className="font-bold text-orange-300 mb-2">{selected.icon} {selected.name} [{selected.tag}] — Members</h3>
                        <SquadMembers squadId={selected.id} walletAddress={walletAddress} />
                    </div>
                )}
            </div>
        </div>
    );
}

function SquadMembers({ squadId, walletAddress }) {
    const { data, isLoading } = useQuery({
        queryKey: ['adminSquadMembers', squadId, walletAddress],
        queryFn: () => base44.functions.invoke('getAdminDataExtended', { type: 'squadMembers', squadId }).then(r => r.data?.members || []),
        enabled: !!squadId && !!walletAddress
    });

    if (isLoading) return <div className="text-slate-500 text-xs">Loading members...</div>;

    return (
        <div className="space-y-1">
            {(data || []).map(m => (
                <div key={m.id} className="flex justify-between items-center bg-slate-800/50 rounded px-3 py-2">
                    <div className="font-bold text-white text-xs">{m.player_name}</div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${m.role === 'leader' ? 'bg-yellow-900/50 text-yellow-400' : 'bg-slate-700 text-slate-400'}`}>{m.role}</span>
                </div>
            ))}
            {!(data || []).length && <div className="text-slate-500 text-xs">No members found.</div>}
        </div>
    );
}