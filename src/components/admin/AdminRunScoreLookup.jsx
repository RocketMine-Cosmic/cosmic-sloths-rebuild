import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Trophy, AlertCircle } from 'lucide-react';
import PlayerSearchInput from './PlayerSearchInput';
import moment from 'moment';
import { arenaLabel } from '@/lib/arenaLabels';

// Lets staff look up a player's full RunScore history (most recent first) so
// they can verify or diagnose individual runs when something goes wrong
// (missing score, suspicious value, wrong character, etc.).
//
// Read-only by default. Includes a "Delete" affordance per row that calls the
// existing soft-delete admin flow if staff need to remove a bad score.

export default function AdminRunScoreLookup() {
    const [selected, setSelected] = useState(null);
    const [loading, setLoading] = useState(false);
    const [runs, setRuns] = useState([]);
    const [error, setError] = useState('');

    const fetchRuns = async (player) => {
        if (!player?.wallet_address) return;
        setLoading(true);
        setError('');
        setRuns([]);
        try {
            const rows = await base44.entities.RunScore.filter(
                { wallet_address: player.wallet_address },
                '-created_date',
                100
            );
            setRuns(rows || []);
            if (!rows?.length) setError('No runs found for this player.');
        } catch (e) {
            setError(e.message || 'Failed to load runs');
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (player) => {
        setSelected(player);
        if (player) fetchRuns(player);
        else { setRuns([]); setError(''); }
    };

    return (
        <div className="bg-[#0b0416]/80 border border-cyan-900/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-cyan-400" />
                <h2 className="text-base font-bold text-cyan-400 uppercase tracking-widest">RunScore Lookup</h2>
            </div>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Search by player name or wallet to inspect their last 100 run scores. Useful when a player reports a missing or incorrect score.
            </p>

            <PlayerSearchInput selected={selected} onSelect={handleSelect} accent="emerald" />

            {selected && (
                <div className="mt-4">
                    {loading && (
                        <div className="text-xs text-slate-400 italic flex items-center gap-2">
                            <span className="w-3 h-3 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /> Loading runs…
                        </div>
                    )}
                    {error && !loading && (
                        <div className="flex items-center gap-2 bg-slate-900/40 border border-slate-700 text-slate-400 px-3 py-2 rounded text-xs">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}
                    {!loading && runs.length > 0 && (
                        <>
                            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                                Showing {runs.length} most recent run{runs.length === 1 ? '' : 's'}
                            </div>
                            <div className="overflow-x-auto border border-slate-800 rounded-lg">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider text-[10px]">
                                        <tr>
                                             <th className="text-left px-2 py-2">When</th>
                                             <th className="text-left px-2 py-2">Score</th>
                                             <th className="text-left px-2 py-2">Char</th>
                                             <th className="text-left px-2 py-2">Arena</th>
                                             <th className="text-left px-2 py-2">Difficulty</th>
                                             <th className="text-right px-2 py-2">Kills</th>
                                            <th className="text-right px-2 py-2">Lvl</th>
                                            <th className="text-right px-2 py-2">Time</th>
                                            <th className="text-right px-2 py-2">Gold</th>
                                            <th className="text-left px-2 py-2">Week</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {runs.map(r => (
                                            <tr key={r.id} className="border-t border-slate-800 hover:bg-slate-900/40">
                                                <td className="px-2 py-1.5 text-slate-300 whitespace-nowrap">{moment(r.created_date).format('MMM D, HH:mm')}</td>
                                                <td className="px-2 py-1.5 font-mono font-bold text-cyan-300">{(r.score || 0).toLocaleString()}</td>
                                                <td className="px-2 py-1.5 text-slate-300">{r.character_id || '—'}</td>
                                                <td className="px-2 py-1.5 text-slate-300" title={r.arena_id || ''}>{arenaLabel(r.arena_id)}</td>
                                                <td className="px-2 py-1.5 text-slate-300 capitalize">{r.difficulty || '—'}</td>
                                                <td className="px-2 py-1.5 text-right font-mono text-slate-300">{r.kills || 0}</td>
                                                <td className="px-2 py-1.5 text-right font-mono text-slate-300">{r.level || 0}</td>
                                                <td className="px-2 py-1.5 text-right font-mono text-slate-300">{Math.floor(r.time_survived || 0)}s</td>
                                                {(() => {
                                                    const credited = Number(r.gold_credited ?? 0);
                                                    const earned = Number(r.gold_earned ?? credited);
                                                    const capped = earned > credited;
                                                    return (
                                                        <td
                                                            className={`px-2 py-1.5 text-right font-mono ${capped ? 'text-amber-300' : 'text-yellow-300'}`}
                                                            title={capped ? `Earned ${earned.toLocaleString()} → capped to ${credited.toLocaleString()}` : `Credited ${credited.toLocaleString()}`}
                                                        >
                                                            {credited.toLocaleString()}{capped && <span className="text-amber-500 ml-1">⚠</span>}
                                                        </td>
                                                    );
                                                })()}
                                                <td className="px-2 py-1.5 text-slate-500 font-mono">{r.week_id || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}