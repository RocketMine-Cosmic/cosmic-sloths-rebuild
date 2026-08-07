import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { RefreshCw } from 'lucide-react';
import PlayerSearchInput from './PlayerSearchInput';

// Admin tool: force-refresh a player's NFT inventory from OmenX.
// Useful when a player upgrades an NFT's rarity (e.g. Common → Epic) but their
// in-game NFT Dashboard / multipliers are still showing the old rarity due to
// the local 5-min cache cooldown. This bumps a nonce on their PlayerSave so
// their next page load wipes the cache and pulls fresh data.

const RARITY_BADGE = {
    legendary: 'bg-yellow-900/40 text-yellow-300 border-yellow-600/50',
    epic:      'bg-purple-900/40 text-purple-300 border-purple-600/50',
    rare:      'bg-blue-900/40 text-blue-300 border-blue-600/50',
    uncommon:  'bg-green-900/40 text-green-300 border-green-600/50',
    common:    'bg-slate-800/50 text-slate-300 border-slate-600/50',
};

export default function AdminRefreshNFTs({ walletAddress }) {
    const [selected, setSelected] = useState(null);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const refresh = async () => {
        if (!selected) return;
        setBusy(true); setError(''); setResult(null);
        try {
            const res = await base44.functions.invoke('adminRefreshPlayerNFTs', {
                walletAddress: selected.wallet_address,
                adminKey: sessionStorage.getItem('admin_key') || undefined,
            });
            if (res.data?.error) throw new Error(res.data.error);
            setResult(res.data);
        } catch (e) { setError(e.message); }
        setBusy(false);
    };

    return (
        <div className="bg-[#0b0416]/80 border border-cyan-900/50 rounded-xl p-4">
            <h2 className="text-base font-bold text-cyan-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <RefreshCw size={16} /> Refresh Player NFTs
            </h2>
            <div className="text-xs text-slate-400 mb-4">
                Pulls the player's latest NFT inventory directly from OmenX (bypasses their 5-min cache) and stamps their save so the dashboard refreshes on next page load. Use when a player reports their NFTs / rarity not updating after a mint or rarity upgrade.
            </div>

            <div className="mb-3">
                <PlayerSearchInput selected={selected} onSelect={(p) => { setSelected(p); setResult(null); setError(''); }} accent="emerald" />
            </div>

            {selected && (
                <button
                    onClick={refresh}
                    disabled={busy}
                    className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-4 py-1.5 rounded font-bold text-sm flex items-center gap-2"
                >
                    <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
                    {busy ? 'Refreshing…' : 'Force Refresh NFTs'}
                </button>
            )}

            {error && <div className="mt-3 text-sm font-mono text-red-400">✗ {error}</div>}

            {result && (
                <div className="mt-4 bg-slate-900/60 border border-cyan-700/40 rounded-lg p-3">
                    <div className="text-xs font-bold text-emerald-400 mb-2">
                        ✓ Refreshed — {result.nftCount} NFT{result.nftCount === 1 ? '' : 's'} found · Save {result.stamped ? 'stamped' : 'NOT stamped (no PlayerSave row)'}
                    </div>
                    {result.summary?.length > 0 ? (
                        <div className="space-y-1.5">
                            {result.summary.map((nft, i) => {
                                const rarityKey = (nft.rarity || '').toLowerCase();
                                const badgeClass = RARITY_BADGE[rarityKey] || RARITY_BADGE.common;
                                return (
                                    <div key={i} className="flex items-center justify-between gap-2 bg-slate-950/50 border border-slate-800 rounded px-2 py-1.5 text-xs">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-bold text-white capitalize">{nft.name}</span>
                                            <span className={`${badgeClass} text-[10px] font-bold px-2 py-0.5 rounded border capitalize`}>{nft.rarity}</span>
                                        </div>
                                        <span className="text-[10px] text-slate-500 font-mono truncate">{nft.tokenId}</span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-xs text-slate-400 italic">No NFTs found for this wallet.</div>
                    )}
                    <div className="text-[10px] text-slate-500 mt-2 leading-snug">
                        The player will see updated NFTs/rarity when they next reload the app or navigate between pages. Their next game run will write the updated multipliers to their save.
                    </div>
                </div>
            )}
        </div>
    );
}