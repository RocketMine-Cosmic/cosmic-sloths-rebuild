import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skull } from 'lucide-react';
import moment from 'moment';

export default function AdminRaid({ walletAddress }) {
    const { data, isLoading } = useQuery({
        queryKey: ['adminRaid', walletAddress],
        queryFn: () => base44.functions.invoke('getAdminDataExtended', { type: 'raid' }).then(r => r.data || {}),
        enabled: !!walletAddress
    });

    const boss = data?.boss;
    const contributions = data?.contributions || [];
    const hpPercent = boss ? Math.max(0, (boss.current_hp / boss.max_hp) * 100) : 0;

    return (
        <div className="space-y-4">
            <div className="bg-[#0b0416]/80 border border-red-900/50 rounded-xl p-4">
                <h2 className="text-base font-bold text-red-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Skull size={16} /> Current World Boss</h2>

                {isLoading ? (
                    <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-red-500"></div></div>
                ) : !boss ? (
                    <div className="text-slate-500 text-sm">No active world boss.</div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-slate-900 rounded-lg p-3">
                                <div className="text-[10px] text-slate-500 uppercase">Boss</div>
                                <div className="font-bold text-red-400">{boss.name || boss.boss_id}</div>
                            </div>
                            <div className="bg-slate-900 rounded-lg p-3">
                                <div className="text-[10px] text-slate-500 uppercase">Level</div>
                                <div className="font-mono font-bold text-white">{boss.level || 1}</div>
                            </div>
                            <div className="bg-slate-900 rounded-lg p-3">
                                <div className="text-[10px] text-slate-500 uppercase">Current HP</div>
                                <div className="font-mono font-bold text-red-400">{boss.current_hp?.toLocaleString()}</div>
                            </div>
                            <div className="bg-slate-900 rounded-lg p-3">
                                <div className="text-[10px] text-slate-500 uppercase">Max HP</div>
                                <div className="font-mono font-bold text-slate-300">{boss.max_hp?.toLocaleString()}</div>
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between text-xs text-slate-400 mb-1">
                                <span>Boss HP</span>
                                <span>{hpPercent.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-slate-900 h-4 rounded-full overflow-hidden border border-slate-700">
                                <div
                                    className="h-full transition-all duration-500 bg-gradient-to-r from-red-900 to-red-500"
                                    style={{ width: `${hpPercent}%` }}
                                />
                            </div>
                        </div>

                        <div className={`px-3 py-1.5 rounded inline-block text-xs font-bold ${boss.is_defeated ? 'bg-green-900/40 text-green-400 border border-green-700' : 'bg-red-900/40 text-red-400 border border-red-700'}`}>
                            {boss.is_defeated ? '✓ DEFEATED' : '⚔️ ACTIVE'}
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-[#0b0416]/80 border border-orange-900/50 rounded-xl p-4">
                <h2 className="text-base font-bold text-orange-400 uppercase tracking-widest mb-3">Top Contributors</h2>
                {isLoading ? (
                    <div className="text-slate-500 text-sm">Loading...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-900/50 text-slate-400 border-b border-slate-700/50">
                                <tr>
                                    <th className="p-2 text-center">#</th>
                                    <th className="p-2">Player</th>
                                    <th className="p-2 text-right">Damage</th>
                                    <th className="p-2 text-center">Claimed</th>
                                    <th className="p-2">Week</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {contributions.sort((a, b) => b.damage - a.damage).map((c, i) => (
                                    <tr key={c.id} className="hover:bg-slate-800/30">
                                        <td className="p-2 text-center font-mono text-slate-300">{i + 1}</td>
                                        <td className="p-2 font-bold text-white">{c.player_name}</td>
                                        <td className="p-2 text-right font-mono text-red-400">{c.damage?.toLocaleString()}</td>
                                        <td className="p-2 text-center">
                                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${c.claimed ? 'bg-green-900/40 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                                                {c.claimed ? 'Yes' : 'No'}
                                            </span>
                                        </td>
                                        <td className="p-2 text-slate-500 font-mono text-[10px]">{c.week_id}</td>
                                    </tr>
                                ))}
                                {!contributions.length && (
                                    <tr><td colSpan="5" className="p-6 text-center text-slate-500">No contributions this week.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}