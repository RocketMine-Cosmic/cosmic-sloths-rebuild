import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SaveManager } from '../game/SaveManager';
import { CHARACTERS } from '../game/Constants';
import { ArrowLeft, Zap, Coins } from 'lucide-react';
import { SoundManager } from '../game/SoundManager';
import SpaceBackground from '../components/game/SpaceBackground';
import OmenXGate from '../components/game/OmenXGate';
import CurrencyHeader from '../components/game/CurrencyHeader';
import { useOmenXUser } from '@/hooks/useOmenXUser';
import { subscribePlayerData, refreshNFTs, getNFTCooldownEnd, ensureNftsFetched } from '@/lib/playerDataCache';
import RefreshOmenXDataButton from '../components/game/RefreshOmenXDataButton';
import { normalizeNftCharacterName } from '@/lib/nftNameNormalize';

export default function NFTDashboard({ isCarousel }) {
    const navigate = useNavigate();
    const { user: omenxUser } = useOmenXUser();
    const [nfts, setNfts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Lazy-fetch NFTs only when this page mounts (deferred from boot)
        ensureNftsFetched();
        // Read NFTs from the unified player-data cache — no extra network call.
        const unsub = subscribePlayerData((data) => {
            if (data) {
                setNfts(data.nfts || []);
                setLoading(false);
            }
        });
        return unsub;
    }, []);

    const getCharacterData = (charName) => {
        // Strip "_am" Asset Managers suffix so the new collection still resolves
        // to the same in-game character as the original collection.
        const normalized = normalizeNftCharacterName(charName);
        const char = CHARACTERS.find(c => c.id === normalized);
        return char || null;
    };

    const getRarityColor = (rarity) => {
        const rarityMap = {
            legendary: { border: 'border-2 border-yellow-500', shadow: 'shadow-[0_0_30px_rgba(234,179,8,0.2)]', glow: 'drop-shadow(0 0 15px rgba(234,179,8,0.4))' },
            epic: { border: 'border-2 border-purple-500', shadow: 'shadow-[0_0_30px_rgba(147,51,234,0.2)]', glow: 'drop-shadow(0 0 15px rgba(147,51,234,0.4))' },
            rare: { border: 'border-2 border-blue-500', shadow: 'shadow-[0_0_30px_rgba(37,99,235,0.2)]', glow: 'drop-shadow(0 0 15px rgba(37,99,235,0.4))' },
            uncommon: { border: 'border-2 border-green-500', shadow: 'shadow-[0_0_30px_rgba(22,163,74,0.2)]', glow: 'drop-shadow(0 0 15px rgba(22,163,74,0.4))' },
            common: { border: 'border-2 border-slate-500', shadow: 'shadow-[0_0_30px_rgba(71,85,105,0.2)]', glow: 'drop-shadow(0 0 15px rgba(71,85,105,0.3))' }
        };
        return rarityMap[rarity?.toLowerCase()] || rarityMap.common;
    };



    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <OmenXGate isCarousel={isCarousel}>
        <div className={`${isCarousel ? 'min-h-full' : 'min-h-screen'} relative text-slate-200 p-2 pb-20 md:p-6 font-sans`}>
            {!isCarousel && <SpaceBackground />}
            <div className="max-w-5xl mx-auto relative z-10">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 md:gap-4 mb-4 md:mb-6 border-b border-slate-800 pb-2 md:pb-4">
                    <div>
                        {!isCarousel && (
                            <button 
                                onClick={() => { SoundManager.playUIClick(); navigate('/profile'); }}
                                className="mb-2 md:mb-4 flex items-center gap-1.5 md:gap-2 text-slate-400 hover:text-white transition-colors font-bold text-xs md:text-sm bg-slate-900 px-2 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg border border-slate-700 w-fit"
                            >
                                <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> Back
                            </button>
                        )}
                        <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest" style={{ background: 'linear-gradient(90deg, #A78BFA, #EC4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 10px rgba(168,85,247,0.5))' }}>
                            COSMIC VAULT
                        </h1>
                        <p className="text-slate-400 mt-0.5 md:text-sm text-xs tracking-widest uppercase">View your NFTs and exclusive perks.</p>
                        <div className="mt-2 md:mt-3">
                            <RefreshOmenXDataButton
                                label="Sync NFTs & Rarity"
                                title="Pull the latest NFT inventory and rarity changes from OmenX"
                                onRefresh={refreshNFTs}
                                getCooldownEnd={getNFTCooldownEnd}
                            />
                        </div>
                    </div>
                    <CurrencyHeader />
                </header>

                {nfts.length === 0 ? (
                    <div className="bg-[#0b0416]/60 backdrop-blur-xl rounded-xl md:rounded-2xl p-8 md:p-12 border border-slate-700 text-center">
                        <div className="text-4xl mb-3">💎</div>
                        <h2 className="text-xl md:text-2xl font-bold text-white mb-2">No NFTs Found</h2>
                        <p className="text-slate-400">You don't currently hold any eligible NFTs.</p>
                    </div>
                ) : (
                    <>
                        {/* NFT Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-8">
                            {nfts.filter(nft => getCharacterData(nft.metadata?.name || '')).map((nft, idx) => {
                                const charData = getCharacterData(nft.metadata?.name || '');
                                const charName = (nft.metadata?.name || '').toLowerCase();
                                const rarity = nft.metadata?.attributes?.find(attr => attr.trait_type === 'rarity')?.value;
                                const rarityColor = getRarityColor(rarity);
                                
                                return (
                                    <div key={idx} className={`bg-[#0b0416]/60 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border ${rarityColor.border} ${rarityColor.shadow}`}>
                                        <div className="flex items-start gap-4">
                                            {charData?.image ? (
                                                <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden border-2 md:border-4 ${rarityColor.border.split(' ')[1]} shrink-0`} style={{ filter: rarityColor.glow }}>
                                                                 <img src={charData.image} alt={charData.name} className="w-full h-full object-cover" />
                                                             </div>
                                                         ) : (
                                                             <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full bg-slate-800 border-2 md:border-4 ${rarityColor.border.split(' ')[1]} shrink-0`} />
                                            )}
                                            
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2 mb-1">
                                                    <h3 className="text-lg md:text-xl font-bold text-purple-300 truncate">
                                                        {nft.metadata?.name || 'Unknown NFT'}
                                                    </h3>
                                                    {charData && (
                                                        <span className="bg-purple-900/50 text-purple-300 text-[10px] font-bold px-2 py-1 rounded-md border border-purple-500/50 whitespace-nowrap">
                                                            CHARACTER
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                                                        ⚡ Instant unlock + perks active
                                                    </div>
                                                    {rarity && (() => {
                                                        const rarityBadgeMap = {
                                                            legendary: 'bg-yellow-900/50 text-yellow-300 border-yellow-600/50',
                                                            epic: 'bg-purple-900/50 text-purple-300 border-purple-600/50',
                                                            rare: 'bg-blue-900/50 text-blue-300 border-blue-600/50',
                                                            uncommon: 'bg-green-900/50 text-green-300 border-green-600/50',
                                                            common: 'bg-slate-800/50 text-slate-300 border-slate-600/50'
                                                        };
                                                        const badgeClass = rarityBadgeMap[rarity?.toLowerCase()] || rarityBadgeMap.common;
                                                        return <span className={`${badgeClass} text-[10px] font-bold px-2 py-0.5 rounded border capitalize`}>{rarity}</span>;
                                                    })()}
                                                </div>
                                                <p className="text-slate-400 text-xs md:text-sm leading-snug mb-2">
                                                    {nft.metadata?.description || 'NFT'}
                                                </p>
                                                <div className="text-[10px] text-slate-500 font-mono truncate">
                                                    {nft.tokenId}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Rarity-Based Perks */}
                        <div className="bg-[#0b0416]/60 backdrop-blur-xl rounded-xl md:rounded-2xl p-4 md:p-6 border border-amber-500/30 shadow-[0_0_30px_rgba(234,179,8,0.15)]">
                            <h2 className="text-lg md:text-xl font-bold text-amber-400 mb-4 flex items-center gap-2">
                                ⚡ Rarity-Based Perks (Per Run)
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                                <div className="p-3 md:p-4 rounded-lg border border-slate-600 bg-slate-800/30">
                                    <h3 className="text-xs md:text-sm font-bold text-slate-400 uppercase mb-2">Common</h3>
                                    <div className="text-xs md:text-sm text-slate-300">+5% Gold, +5% Relic Fragments</div>
                                </div>
                                <div className="p-3 md:p-4 rounded-lg border border-green-600/50 bg-green-950/20">
                                    <h3 className="text-xs md:text-sm font-bold text-green-300 uppercase mb-2">Uncommon</h3>
                                    <div className="text-xs md:text-sm text-green-200">+7% Gold, +8% Relic Fragments</div>
                                </div>
                                <div className="p-3 md:p-4 rounded-lg border border-blue-600/50 bg-blue-950/20">
                                    <h3 className="text-xs md:text-sm font-bold text-blue-300 uppercase mb-2">Rare</h3>
                                    <div className="text-xs md:text-sm text-blue-200">+10% Gold, +10% Relic Fragments</div>
                                </div>
                                <div className="p-3 md:p-4 rounded-lg border border-purple-600/50 bg-purple-950/20">
                                    <h3 className="text-xs md:text-sm font-bold text-purple-300 uppercase mb-2">Epic</h3>
                                    <div className="text-xs md:text-sm text-purple-200">+12% Gold, +13% Relic Fragments</div>
                                </div>
                                <div className="p-3 md:p-4 rounded-lg border border-yellow-600/50 bg-yellow-950/20">
                                    <h3 className="text-xs md:text-sm font-bold text-yellow-300 uppercase mb-2">Legendary</h3>
                                    <div className="text-xs md:text-sm text-yellow-200">+15% Gold, +15% Relic Fragments</div>
                                </div>
                            </div>
                        </div>

                        {/* Perks Info */}
                        <div className="mt-6 bg-slate-900/40 border border-slate-700 rounded-lg p-4 text-xs md:text-sm text-slate-400">
                            <p className="leading-relaxed">
                                <strong className="text-slate-200">NFT Holder Benefits:</strong> All holders of OmenX NFTs receive permanent in-game bonuses that apply to every run, helping you progress faster and save on upgrades.
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
        </OmenXGate>
    );
}