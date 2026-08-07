import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, User } from 'lucide-react';
import moment from 'moment';
import PlayerSaveEditor from './PlayerSaveEditor';

export default function AdminPlayers({ walletAddress }) {
    const [search, setSearch] = useState('');
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(null);
    // Auto-load recent players on mount
    useEffect(() => {
        if (!walletAddress) return;
        setLoading(true);
        base44.functions.invoke('getAdminDataExtended', { type: 'playerSearch', query: '' })
            .then(res => setResults(res.data?.players || []))
            .catch(() => setResults([]))
            .finally(() => setLoading(false));
    }, [walletAddress]);

    const handleSearch = async () => {
        setLoading(true);
        setSelected(null);
        try {
            const res = await base44.functions.invoke('getAdminDataExtended', { type: 'playerSearch', query: search.trim() });
            setResults(res.data?.players || []);
        } catch (e) {
            setResults([]);
        }
        setLoading(false);
    };

    return (
        <div className="space-y-4">
            <div className="bg-[#0b0416]/80 border border-cyan-900/50 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                    <h2 className="text-base font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2"><User size={16} /> Players</h2>
                    {results && <span className="text-xs text-slate-500">{results.length} shown</span>}
                </div>
                <div className="flex gap-2 mb-4">
                    <input
                        type="text"
                        placeholder="Search by name or wallet..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        className="flex-1 bg-slate-900 border border-cyan-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                    />
                    <button onClick={handleSearch} disabled={loading}
                        className="bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white px-4 py-2 rounded font-bold text-sm flex items-center gap-2">
                        <Search size={14} /> {loading ? '...' : 'Search'}
                    </button>
                </div>

                {loading && <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-cyan-500"></div></div>}

                {results !== null && !selected && !loading && (
                    <div>
                        {results.length === 0 ? (
                            <div className="text-slate-500 text-sm">No players found.</div>
                        ) : (
                            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                                {results.map(p => (
                                    <button key={p.id} onClick={() => setSelected(p)}
                                        className="w-full text-left bg-slate-900/60 border border-slate-700 hover:border-cyan-600 rounded-lg px-3 py-2 transition-colors">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <div className="font-bold text-white text-sm">{p.save_data?.pilotName || p.save_data?.player_name || <span className="text-slate-500 italic">Unnamed</span>}</div>
                                                <div className="text-[10px] text-slate-500 font-mono mt-0.5">{p.wallet_address?.slice(0,10)}...{p.wallet_address?.slice(-6)} · {moment(p.updated_date).fromNow()}</div>
                                            </div>
                                            <div className="text-right shrink-0 ml-3">
                                                <div className="text-[10px] text-yellow-400 font-mono">{(p.save_data?.gold || 0).toLocaleString()} G</div>
                                                <div className="text-[10px] text-red-400 font-mono">{(p.save_data?.totalKills || 0).toLocaleString()} kills</div>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {selected && (
                    <div className="mt-4">
                        <button onClick={() => setSelected(null)} className="text-xs text-slate-400 hover:text-white mb-3 flex items-center gap-1">← Back to results</button>
                        <div className="bg-slate-900/60 border border-cyan-700/50 rounded-xl p-4">
                            <PlayerSaveEditor
                                player={selected}
                                onClose={() => setSelected(null)}
                                onSaved={(updated) => {
                                    setSelected(updated);
                                    setResults(prev => prev ? prev.map(p => p.id === updated.id ? updated : p) : prev);
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}