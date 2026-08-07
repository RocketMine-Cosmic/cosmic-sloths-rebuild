import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { RefreshCw, Sparkles } from 'lucide-react';
import PlayerSearchInput from './PlayerSearchInput';

// Force-refreshes a player's NFT inventory from OmenX upstream and stamps
// `_nftRefreshNonce` on their PlayerSave so their client wipes its local
// NFT cache on next load (no need for them to wait the 5-min cooldown).
//
// Returns the fresh NFT list so support can verify exactly what the player
// owns *right now* (including rarity), which is the most common ticket:
// "I bought/sold an NFT and the bonuses haven't updated."

const RARITY_COLORS = {
    common:    'text-slate-300 border-slate-600 bg-slate-900/60',
    uncommon:  'text-green-300 border-green-600 bg-green-950/40',
    rare:      'text-blue-300 border-blue-600 bg-blue-950/40',
    epic:      'text-purple-300 border-purple-600 bg-purple-950/40',
    legendary: 'text-amber-300 border-amber-600 bg-amber-950/40',
};

export default function AdminRefreshPlayerNFTs() {
    const [selected, setSelected] = useState(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const refresh = async () => {
        if (!selected?.wallet_address) return;
        setBusy(true); setError(''); setResult(null);
        try {
            const res = await base44.functions.invoke('adminRefreshPlayerNFTs', {
                walletAddress: selected.wallet_address,
                adminKey: sessionStorage.getItem('admin_key') || undefined,
            });
            if (res.data?.error) throw new Error(res.data.error);
            setResult(res.data);
        } catch (e) {
            setError(e.message || 'Refresh failed');
        }
        setBusy(false);
    };

    return (
        <div className="bg-[#0b0416]/80 border border-cyan-900/50 rounded-xl p-4">
            <h2 className="text-base font-bold text-cyan-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Sparkles size={16} /> Force-Refresh Player NFTs
            </h2>
            <div className="text-xs text-slate-400 mb-4">
                Pulls the player's current NFT inventory directly from OmenX (bypassing the 5-min client cache) and stamps their save so their client wipes its local NFT cache on next load. Use when a player reports their NFT bonuses haven't updated after buying/selling.
            </div>

            <div className="mb-3">
                <PlayerSearchInput selected={selected} onSelect={(p) => { setSelected(p); setResult(null); setError(''); }} accent="emerald" />
            </div>

            {selected && (
                <div className="bg-slate-900/60 border border-cyan-700/40 rounded-lg p-3 space-y-3">
                    <button
                        onClick={refresh}
                        disabled={busy}
                        className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-4 py-2 rounded font-bold text-sm flex items-center gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                        {busy ? 'Refreshing…' : 'Pull Fresh NFTs from OmenX'}
                    </button>

                    {error && (
                        <div className="text-red-400 text-sm font-mono">✗ {error}</div>
                    )}

                    {result && (
                        <div className="space-y-2">
                            <div className="text-emerald-400 text-sm font-mono">
                                ✓ Found {result.nftCount} NFT{result.nftCount === 1 ? '' : 's'}{result.stamped ? ' · save stamped (client will refresh on next load)' : ' · no PlayerSave row found, nothing to stamp'}
                            </div>

                            {result.summary?.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {result.summary.map((nft, i) => {
                                        const rarityKey = String(nft.rarity || '').toLowerCase();
                                        const cls = RARITY_COLORS[rarityKey] || RARITY_COLORS.common;
                                        return (
                                            <div key={i} className={`border rounded px-2.5 py-1.5 text-xs ${cls}`}>
                                                <div className="font-bold capitalize">{nft.name}</div>
                                                <div className="opacity-75 text-[10px] uppercase tracking-wider mt-0.5">
                                                    {nft.rarity}{nft.tokenId ? ` · #${nft.tokenId}` : ''}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-slate-500 text-xs italic">Player owns no NFTs.</div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}