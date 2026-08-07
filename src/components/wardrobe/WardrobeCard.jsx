import React from 'react';
import { Lock, Eye } from 'lucide-react';
import { getChestAssetUrl } from '@/lib/chestCosmeticAssets';
import {
    isStandardLbFrame, getStandardLbFrame,
    isStandardAnimatedIcon, getStandardAnimatedIcon,
} from '@/lib/standardCosmetics';
import StandardIconSigil from './StandardIconSigils';
import ChestIconImage from '@/components/game/ChestIconImage';

const RARITY_STYLES = {
    free:     { label: 'Free',     ring: 'border-slate-700',      text: 'text-slate-400' },
    standard: { label: 'Standard', ring: 'border-slate-600',      text: 'text-slate-300' },
    epic:     { label: 'Epic',     ring: 'border-cyan-500/70',    text: 'text-cyan-300' },
    mythic:   { label: 'Mythic',   ring: 'border-amber-500/80',   text: 'text-amber-200' },
    reward:   { label: 'Reward',   ring: 'border-yellow-600/70',  text: 'text-yellow-300' },
};

export default function WardrobeCard({ item, owned, equipped, onPreview, onEquip }) {
    const rarity = RARITY_STYLES[item.rarity] || RARITY_STYLES.standard;

    // Three primary action states:
    //   1. Owned + equipped  → "Equipped" pill
    //   2. Owned + not eq.   → "Equip" button (calls onEquip)
    //   3. Not owned         → disabled CTA — standard = "Coming soon",
    //                          chest = "Chest only", reward = "Quest milestone"
    let cta;
    if (owned && equipped) {
        cta = <div className="w-full py-1.5 rounded-md text-center text-[11px] font-black uppercase tracking-widest text-pink-300 bg-pink-900/40 border border-pink-500/50">Equipped</div>;
    } else if (owned) {
        cta = (
            <button
                onClick={onEquip}
                className="w-full py-1.5 rounded-md text-[11px] font-bold uppercase tracking-widest bg-slate-700 hover:bg-slate-600 text-white transition-colors"
            >
                Equip
            </button>
        );
    } else if (item.source === 'chest') {
        cta = (
            <div className="w-full py-1.5 rounded-md text-center text-[10px] font-bold uppercase tracking-widest text-amber-300/80 bg-amber-950/40 border border-amber-700/40 flex items-center justify-center gap-1">
                <Lock className="w-3 h-3" /> Drops from chests
            </div>
        );
    } else if (item.source === 'reward') {
        cta = (
            <div className="w-full py-1.5 rounded-md text-center text-[10px] font-bold uppercase tracking-widest text-yellow-300/80 bg-yellow-950/40 border border-yellow-700/40">
                Quest milestone reward
            </div>
        );
    } else {
        // Standard cosmetic — purchase disabled pending GMT scope (see design doc).
        cta = (
            <div className="w-full py-1.5 rounded-md text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-800/70 border border-slate-700">
                Coming soon
            </div>
        );
    }

    return (
        <div className={`bg-slate-900/70 border-2 rounded-xl p-2.5 flex flex-col gap-2 transition-all ${equipped ? 'border-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.3)]' : rarity.ring + ' hover:border-slate-500'}`}>
            <button
                onClick={onPreview}
                className="aspect-square bg-slate-950/80 rounded-lg flex items-center justify-center relative overflow-hidden group"
                title="Preview"
            >
                {(() => {
                    // Standard CSS-only LB frame — render a mini sample frame.
                    if (item.category === 'lb_frame' && isStandardLbFrame(item.id)) {
                        const f = getStandardLbFrame(item.id);
                        if (f.kind === 'gradient') {
                            return (
                                <div className={`w-[88%] h-[28%] rounded-md ${f.anim}`} style={{ padding: '2px', backgroundImage: f.gradient, backgroundSize: '200% 100%' }}>
                                    <div className="w-full h-full rounded-sm bg-slate-900" />
                                </div>
                            );
                        }
                        return <div className={`w-[88%] h-[28%] rounded-md bg-slate-900 ${f.anim}`} style={f.style} />;
                    }
                    // Standard CSS-only animated pilot icon — render the themed medallion.
                    if (item.category === 'pilot_icon' && isStandardAnimatedIcon(item.id)) {
                        const std = getStandardAnimatedIcon(item.id);
                        return (
                            <div
                                className="relative w-20 h-20 rounded-full flex items-center justify-center overflow-hidden"
                                style={{
                                    background: std.plate,
                                    border: `2px solid ${std.rim}`,
                                    boxShadow: `inset 0 0 10px rgba(255,255,255,0.18), 0 0 18px ${std.rim}aa, 0 0 38px ${std.rim}55`,
                                }}
                            >
                                <span
                                    className="absolute inset-[3px] rounded-full pointer-events-none"
                                    style={{ background: 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.28) 0%, transparent 55%)' }}
                                />
                                <div className={`${std.anim} relative z-10`} style={{ width: '92%', height: '92%' }}>
                                    <StandardIconSigil id={std.id} color={std.rim} />
                                </div>
                            </div>
                        );
                    }
                    // Show the actual generated asset thumbnail for chest categories
                    // that have one. Falls through to the original emoji / colour swatch
                    // for everything else (and chest items whose asset isn't ready yet).
                    const chestUrl = ['pilot_icon', 'lb_frame', 'meteor_fx'].includes(item.category)
                        ? getChestAssetUrl(item.id) : null;
                    if (chestUrl) {
                        // Chest pilot icons render via ChestIconImage so the thumbnail
                        // gets the same halo / overlay animation as the live medallion.
                        if (item.category === 'pilot_icon') {
                            return (
                                <div className="w-full h-full rounded-full overflow-hidden">
                                    <ChestIconImage url={chestUrl} animatedId={item.id} alt={item.name} />
                                </div>
                            );
                        }
                        // LB frames are 8:1 banners — contain to show the whole frame.
                        const fit = item.category === 'lb_frame' ? 'object-contain' : 'object-cover';
                        return <img src={chestUrl} alt={item.name} className={`w-full h-full ${fit}`} />;
                    }
                    if (item.category === 'title_flair') {
                        const flairId = item.id.replace(/^title_style_/, '');
                        return (
                            <span className={`title-flair-${flairId} text-base md:text-lg font-bold tracking-wide px-2`}>
                                {item.name}
                            </span>
                        );
                    }
                    if (item.category === 'skin' && item.color) {
                        return (
                            <div
                                className="w-16 h-16 rounded-full border-4"
                                style={{ background: item.color, borderColor: item.color + '60', boxShadow: `0 0 30px ${item.color}40` }}
                            />
                        );
                    }
                    return <span className="text-5xl">{item.icon || '✨'}</span>;
                })()}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className={`absolute top-1 left-1 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest rounded bg-slate-950/80 border ${rarity.ring} ${rarity.text}`}>
                    {rarity.label}
                </span>
            </button>

            <div className="min-h-[2.25rem]">
                <div className="font-bold text-xs text-white leading-tight truncate">{item.name}</div>
                <div className="text-[10px] text-slate-400 leading-tight line-clamp-2">{item.desc}</div>
            </div>

            {cta}
        </div>
    );
}