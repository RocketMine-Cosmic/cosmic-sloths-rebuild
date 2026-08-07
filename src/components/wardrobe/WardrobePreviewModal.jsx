import React from 'react';
import { X, Lock } from 'lucide-react';
import CosmeticPreview from '@/components/game/CosmeticPreview';
import TitleFlairDemo from './TitleFlairDemo';
import LbFrameDemo from './LbFrameDemo';
import AnimatedIconDemo from './AnimatedIconDemo';
import { getChestAssetUrl } from '@/lib/chestCosmeticAssets';

// Live preview for any Wardrobe item.
//
// Trails / kill FX: render the existing CosmeticPreview canvas with the
// item temporarily applied — same path the Armoury used to use.
// Skins: render a styled character circle in the chosen color.
// Chest categories — proper live previews per category:
//   pilot_icon   → AnimatedIconDemo using the generated asset
//   lb_frame     → LbFrameDemo (9-slice on a sample LB row)
//   title_flair  → TitleFlairDemo (CSS animations applied to sample text)
//   meteor_fx    → asset image overlay (squad-feed mock)
// Falls back to a placeholder card when an asset URL isn't available.
export default function WardrobePreviewModal({ item, save, charId, onClose }) {
    if (!item) return null;

    const renderPreview = () => {
        if (item.category === 'trail' || item.category === 'kill_fx') {
            return (
                <CosmeticPreview
                    trailId={item.category === 'trail' ? item.id : (save?.cosmetics?.trail || 'default')}
                    killEffectId={item.category === 'kill_fx' ? item.id : (save?.cosmetics?.killEffect || 'none')}
                    charId={charId}
                    playerColor="#00cfff"
                />
            );
        }
        if (item.category === 'skin') {
            return (
                <CosmeticPreview
                    trailId={save?.cosmetics?.trail || 'default'}
                    killEffectId={save?.cosmetics?.killEffect || 'none'}
                    charId={item.charId || charId}
                    playerColor={item.color || '#00cfff'}
                />
            );
        }

        // Chest category previews — strip the prefix to get the flair id for
        // title_style_* (e.g. 'title_style_blue_flame' → 'blue_flame').
        if (item.category === 'title_flair') {
            const flairId = item.id.replace(/^title_style_/, '');
            return <TitleFlairDemo flairId={flairId} />;
        }
        if (item.category === 'lb_frame') {
            return <LbFrameDemo frameId={item.id} frameUrl={getChestAssetUrl(item.id)} />;
        }
        if (item.category === 'pilot_icon') {
            return <AnimatedIconDemo iconId={item.id} iconUrl={getChestAssetUrl(item.id)} />;
        }
        if (item.category === 'meteor_fx') {
            const url = getChestAssetUrl(item.id);
            if (!url) {
                return (
                    <div className="w-full bg-slate-950 rounded-lg flex items-center justify-center py-10 text-slate-500 text-xs">
                        Asset not yet generated.
                    </div>
                );
            }
            return (
                <div className="w-full bg-slate-950 rounded-lg flex flex-col items-center justify-center gap-3 py-10">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">meteor strike fx preview</div>
                    <div className="w-full max-w-md bg-slate-900/60 border border-slate-700 rounded-lg px-4 py-3 flex items-center gap-3">
                        <img src={url} alt="meteor fx" className="w-16 h-8 object-contain meteor-fx-gold-lightning" />
                        <div className="flex-1 text-xs">
                            <div className="text-amber-300 font-bold">⚡ You struck the meteor!</div>
                            <div className="text-slate-400">Deals bonus damage to squadmates' targets.</div>
                        </div>
                    </div>
                    <div className="text-xs text-slate-500">Shown in the squad activity feed</div>
                </div>
            );
        }

        // Chest-only categories — placeholder until assets ship.
        return (
            <div className="w-full bg-slate-950 rounded-lg flex flex-col items-center justify-center gap-3 text-center px-4 py-10">
                <div className="text-6xl opacity-70">{item.icon}</div>
                <div className="text-amber-300/80 text-sm flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Live preview lands when the asset is generated.
                </div>
            </div>
        );
    };

    return (
        <div
            className="fixed inset-0 bg-black/85 backdrop-blur flex items-center justify-center p-4 z-50"
            onClick={onClose}
        >
            <div
                className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                    <div>
                        <div className="text-[10px] uppercase tracking-widest text-slate-500">{item.category.replace('_', ' ')}</div>
                        <div className="text-white font-bold text-lg">{item.name}</div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto">
                    {renderPreview()}
                    <p className="text-slate-300 text-sm mt-3">{item.desc}</p>
                </div>
            </div>
        </div>
    );
}