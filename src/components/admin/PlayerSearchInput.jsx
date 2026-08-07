import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Search, X } from 'lucide-react';

/**
 * Reusable player search input for admin tools.
 *
 * Lets staff search by player NAME or wallet address, picks a result, and
 * passes the full player record (id, wallet_address, save_data, ...) up to
 * the parent via `onSelect`. Once a player is selected, shows a small
 * "selected" pill with a clear/× button.
 *
 * Props:
 *   - selected: the currently-selected player object (or null)
 *   - onSelect: (player|null) => void
 *   - placeholder: optional override for the input placeholder
 *   - accent: 'amber' | 'red' | 'emerald' (border colour of result list)
 */
export default function PlayerSearchInput({ selected, onSelect, placeholder = 'Wallet address or player name…', accent = 'amber' }) {
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState([]);
    const [error, setError] = useState('');

    const accentBorder = {
        amber: 'focus:border-amber-500 hover:border-amber-600',
        red: 'focus:border-red-500 hover:border-red-600',
        emerald: 'focus:border-emerald-500 hover:border-emerald-600',
    }[accent] || 'focus:border-cyan-500';

    const accentBg = {
        amber: 'bg-amber-600 hover:bg-amber-500',
        red: 'bg-red-600 hover:bg-red-500',
        emerald: 'bg-emerald-700 hover:bg-emerald-600',
    }[accent] || 'bg-cyan-600 hover:bg-cyan-500';

    const search = async () => {
        if (!query.trim()) return;
        setSearching(true); setResults([]); setError('');
        try {
            const res = await base44.functions.invoke('getAdminDataExtended', { type: 'playerSearch', query: query.trim() });
            const players = res.data?.players || [];
            setResults(players);
            if (!players.length) setError('No players found.');
        } catch (e) { setError(e.message); }
        setSearching(false);
    };

    const pick = (p) => {
        onSelect(p);
        setResults([]);
        setQuery('');
        setError('');
    };

    const clear = () => {
        onSelect(null);
        setResults([]);
        setQuery('');
        setError('');
    };

    if (selected) {
        return (
            <div className="bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                        {selected.save_data?.pilotName || selected.player_name || 'Unnamed'}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">{selected.wallet_address}</div>
                </div>
                <button onClick={clear} className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 shrink-0">
                    <X size={12} /> change
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && search()}
                    placeholder={placeholder}
                    className={`flex-1 bg-slate-900 border border-slate-700 text-white rounded px-3 py-1.5 text-sm font-mono focus:outline-none ${accentBorder}`}
                />
                <button
                    onClick={search}
                    disabled={searching || !query.trim()}
                    className={`${accentBg} disabled:opacity-50 text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-2`}
                >
                    <Search size={14} /> {searching ? '…' : 'Find'}
                </button>
            </div>
            {error && <div className="text-xs text-slate-400 italic">{error}</div>}
            {results.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                    {results.map(p => {
                        const currentName = p.save_data?.pilotName || p.save_data?.player_name || p.player_name || 'Unnamed';
                        const isHistorical = p._matchedVia && p._matchedVia !== 'current';
                        return (
                            <button
                                key={p.id}
                                onClick={() => pick(p)}
                                className={`w-full text-left bg-slate-900/60 border border-slate-700 rounded px-3 py-1.5 transition-colors ${accentBorder}`}
                            >
                                <div className="text-sm font-bold text-white">{currentName}</div>
                                <div className="text-[10px] text-slate-500 font-mono">{p.wallet_address?.slice(0,10)}…{p.wallet_address?.slice(-6)}</div>
                                {isHistorical && p._matchedName && (
                                    <div className="text-[10px] text-amber-400 mt-0.5 italic">
                                        ↳ matched old name: <span className="font-mono not-italic">{p._matchedName}</span>
                                        <span className="text-slate-500 ml-1">({p._matchedVia === 'historical_squad' ? 'squad' : 'runs'})</span>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}