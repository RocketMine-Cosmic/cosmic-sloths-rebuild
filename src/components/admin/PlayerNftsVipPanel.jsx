import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, Crown, RefreshCw } from 'lucide-react';

// Admin-only panel for inspecting a target wallet's NFT inventory + VIP level.
// Calls getPlayerNftsAndVip — admin-gated server-side.
export default function PlayerNftsVipPanel({ walletAddress }) {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');

    const fetchData = async () => {
        if (!walletAddress) return;
        setLoading(true);
        setErr('');
        try {
            const res = await base44.functions.invoke('getPlayerNftsAndVip', { walletAddress });
            if (res.data?.error) {
                setErr(res.data.error);
                setData(null);
            } else {
                setData(res.data);
            }
        } catch (e) {
            setErr(e.message || 'Failed to fetch');
            setData(null);
        }
        setLoading(false);
    };

    const handleToggle = () => {
        const next = !open;
        setOpen(next);
        if (next && !data && !loading) fetchData();
    };

    return (
        <div className="border border-purple-700/40 rounded-lg overflow-hidden">
            <button onClick={handleToggle}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-purple-950/40 hover:bg-purple-900/40 transition-colors">
                <span className="font-bold text-sm uppercase tracking-wider text-purple-300 flex items-center gap-2">
                    <Sparkles size={14} /> NFTs & VIP
                </span>
                <span className="text-[10px] text-slate-400">{open ? 'hide' : 'view'}</span>
            </button>

            {open && (
                <div className="p-4 bg-slate-950/40 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="text-[10px] text-slate-500 font-mono break-all">{walletAddress}</div>
                        <button onClick={fetchData} disabled={loading}
                            className="bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white px-3 py-1 rounded text-[11px] font-bold flex items-center gap-1.5 transition-colors">
                            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                            {loading ? 'Loading…' : 'Refresh'}
                        </button>
                    </div>

                    {err && <div className="text-xs text-red-400 font-mono">✗ {err}</div>}

                    {data && (
                        <>
                            <div className="bg-slate-900/60 border border-yellow-700/40 rounded-lg p-3 flex items-center gap-3">
                                <Crown size={18} className="text-yellow-400" />
                                <div>
                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">VIP Level</div>
                                    <div className="text-lg font-black text-yellow-300">{data.vipLevel ?? 0}</div>
                                </div>
                            </div>

                            <div className="bg-slate-900/60 border border-cyan-700/40 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">NFTs</div>
                                    <div className="text-[11px] text-cyan-300 font-mono">{data.nfts?.length || 0} owned</div>
                                </div>
                                {data.nftError && (
                                    <div className="text-[11px] text-red-400 font-mono mb-2">⚠ NFT fetch error: {data.nftError}</div>
                                )}
                                {(!data.nfts || data.nfts.length === 0) ? (
                                    <div className="text-[11px] text-slate-500">No NFTs owned.</div>
                                ) : (
                                    <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                                        {data.nfts.map((nft, idx) => {
                                            const name = nft.metadata?.name || nft.name || 'Unknown';
                                            const collection = nft.contractAddress || nft.collection || '';
                                            const tokenId = nft.tokenId ?? nft.id ?? '';
                                            return (
                                                <div key={idx} className="flex items-center justify-between text-[11px] py-1 border-b border-slate-800/50 last:border-0">
                                                    <span className="text-white font-mono truncate mr-2">{name}</span>
                                                    <span className="text-slate-500 font-mono shrink-0">
                                                        {tokenId ? `#${tokenId}` : ''} {collection ? `· ${collection.slice(0, 10)}…` : ''}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}