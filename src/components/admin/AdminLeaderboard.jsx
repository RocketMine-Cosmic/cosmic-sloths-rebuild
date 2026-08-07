import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import moment from 'moment';
import { arenaLabel } from '@/lib/arenaLabels';

export default function AdminLeaderboard({ walletAddress }) {
    const [period, setPeriod] = useState('weekly');
    const [mode, setMode] = useState('all'); // 'all' | 'normal' | 'endless'
    const [search, setSearch] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['adminScores', walletAddress, period],
        queryFn: () => base44.functions.invoke('getAdminDataExtended', { type: 'scores', period }).then(r => r.data?.scores || []),
        enabled: !!walletAddress
    });

    const filtered = (data || []).filter(s => {
        if (mode === 'endless' && s.arena_id !== 'endless') return false;
        if (mode === 'normal' && s.arena_id === 'endless') return false;
        if (search && !s.player_name?.toLowerCase().includes(search.toLowerCase()) && !s.wallet_address?.includes(search)) return false;
        return true;
    });

    return (
        <div className="bg-[#0b0416]/80 border border-yellow-900/50 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <h2 className="text-base font-bold text-yellow-400 uppercase tracking-widest">🏆 Leaderboard Scores</h2>
                <div className="flex gap-1 ml-auto">
                    {[
                        { id: 'all', label: 'All Modes' },
                        { id: 'normal', label: 'Normal' },
                        { id: 'endless', label: 'Endless' },
                    ].map(m => (
                        <button key={m.id} onClick={() => setMode(m.id)}
                            className={`px-3 py-1 rounded text-xs font-bold transition-colors ${mode === m.id ? 'bg-fuchsia-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                            {m.label}
                        </button>
                    ))}
                </div>
                <div className="flex gap-1">
                    {['weekly', 'seasonal', 'all'].map(p => (
                        <button key={p} onClick={() => setPeriod(p)}
                            className={`px-3 py-1 rounded text-xs font-bold transition-colors ${period === p ? 'bg-yellow-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                    ))}
                </div>
                <input
                    type="text"
                    placeholder="Search player / wallet..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-white rounded px-3 py-1 text-xs focus:outline-none focus:border-yellow-500 w-48"
                />
            </div>

            {isLoading ? (
                <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-yellow-500"></div></div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700/50">
                            <tr>
                                <th className="p-2 text-center">#</th>
                                <th className="p-2">Player</th>
                                <th className="p-2">Wallet</th>
                                <th className="p-2">Character</th>
                                <th className="p-2">Arena</th>
                                <th className="p-2 text-right">Score</th>
                                <th className="p-2 text-right">Kills</th>
                                <th className="p-2 text-right">Time</th>
                                <th className="p-2">Week</th>
                                <th className="p-2">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {filtered.map((s, i) => (
                                <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="p-2 text-center font-mono text-slate-300">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                                    <td className="p-2 font-bold text-white max-w-[180px] truncate" title={`${s.pilot_icon || ''} ${s.player_name || ''}`}>
                                        {s.pilot_icon && s.pilot_icon.length <= 4 && !s.pilot_icon.startsWith('http') ? `${s.pilot_icon} ` : ''}
                                        {s.player_name && s.player_name.startsWith('http') ? '(unnamed)' : (s.player_name || '-')}
                                    </td>
                                    <td className="p-2 text-slate-500 font-mono" title={s.wallet_address}>
                                        {s.wallet_address ? `${s.wallet_address.slice(0, 6)}...${s.wallet_address.slice(-4)}` : '-'}
                                    </td>
                                    <td className="p-2 text-slate-300">{s.character_id || '-'}</td>
                                    <td className="p-2 text-slate-300" title={s.arena_id || ''}>{arenaLabel(s.arena_id)}</td>
                                    <td className="p-2 text-right font-mono font-bold text-yellow-400">{(s.score || 0).toLocaleString()}</td>
                                    <td className="p-2 text-right font-mono text-slate-300">{s.kills || 0}</td>
                                    <td className="p-2 text-right font-mono text-slate-300">{Math.floor((s.time_survived || 0) / 60)}:{String((s.time_survived || 0) % 60).padStart(2,'0')}</td>
                                    <td className="p-2 text-slate-500 font-mono text-[10px]">{s.week_id}</td>
                                    <td className="p-2 text-slate-500 font-mono text-[10px] whitespace-nowrap">{moment(s.created_date).format('MMM D, HH:mm')}</td>
                                </tr>
                            ))}
                            {!filtered.length && (
                                <tr><td colSpan="10" className="p-6 text-center text-slate-500">No scores found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}