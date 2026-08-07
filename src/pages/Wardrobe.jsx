import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { SaveManager } from '@/game/SaveManager';
import { CHARACTERS } from '@/game/Constants';
import { SoundManager } from '@/game/SoundManager';
import { ensureChestAssetsLoaded } from '@/lib/chestCosmeticAssets';
import SpaceBackground from '@/components/game/SpaceBackground';
import CurrencyHeader from '@/components/game/CurrencyHeader';
import OmenXGate from '@/components/game/OmenXGate';
import WardrobeCard from '@/components/wardrobe/WardrobeCard';
import WardrobePreviewModal from '@/components/wardrobe/WardrobePreviewModal';
import CosmeticPreview from '@/components/game/CosmeticPreview';
import {
    ALL_WARDROBE_ITEMS,
    CATEGORY_TABS,
    SOURCE_FILTERS,
    isItemOwned,
    getEquippedId,
} from '@/components/wardrobe/wardrobeData';
import { TRAIL_COSMETICS, KILL_COSMETICS, SKIN_COSMETICS } from '@/game/Constants';

export default function Wardrobe({ isCarousel }) {
    const navigate = useNavigate();
    const [save, setSave] = useState(SaveManager.load());
    const [activeCategory, setActiveCategory] = useState('pilot_icon');
    const [activeSource, setActiveSource] = useState('all');
    const [previewItem, setPreviewItem] = useState(null);
    // Temp-equipped trail / kill_fx ids for the big top preview canvas.
    // Mirrors the old Armoury behaviour: clicking Preview on an unowned card
    // shows it live in the top canvas without actually saving anything.
    const [previewTrailId, setPreviewTrailId] = useState(null);
    const [previewKillId, setPreviewKillId] = useState(null);

    // Skin tab is per-character — track which character is being browsed.
    const unlockedChars = useMemo(() => {
        return ['neobyte', ...((save.unlockedCharacters || []).filter(c => c !== 'neobyte'))];
    }, [save.unlockedCharacters]);
    const [skinCharIndex, setSkinCharIndex] = useState(0);
    const currentSkinChar = CHARACTERS.find(c => c.id === unlockedChars[skinCharIndex % unlockedChars.length]) || CHARACTERS[0];

    useEffect(() => {
        const handle = (e) => setSave(e.detail);
        window.addEventListener('saveUpdated', handle);
        return () => window.removeEventListener('saveUpdated', handle);
    }, []);

    // Warm the chest asset URL cache on mount so cards / previews render the
    // real generated images on first paint (rather than emoji-then-pop).
    // forceRender flip ensures the grid re-renders once the URLs land.
    const [, forceRender] = useState(0);
    useEffect(() => {
        ensureChestAssetsLoaded().then(() => forceRender(n => n + 1));
    }, []);

    // Filter to the active category, then apply source filter.
    const visibleItems = useMemo(() => {
        let items = ALL_WARDROBE_ITEMS.filter(i => i.category === activeCategory);
        if (activeCategory === 'skin') {
            items = items.filter(i => i.charId === currentSkinChar.id);
        }
        if (activeSource === 'all') return items;
        if (activeSource === 'owned')    return items.filter(i => isItemOwned(i, save));
        if (activeSource === 'standard') return items.filter(i => i.source === 'standard' || i.source === 'free');
        if (activeSource === 'chest')    return items.filter(i => i.source === 'chest');
        if (activeSource === 'locked')   return items.filter(i => !isItemOwned(i, save));
        return items;
    }, [activeCategory, activeSource, save, currentSkinChar.id]);

    const handleEquip = (item) => {
        SoundManager.playUIClick();
        const s = SaveManager.load();
        // Mutate the right save slot for the item's category. Chest categories
        // live on save.profile.*; standard categories use the legacy cosmetics
        // object the rest of the codebase still reads from.
        if (item.category === 'trail') {
            s.cosmetics = { ...(s.cosmetics || {}), trail: item.id };
        } else if (item.category === 'kill_fx') {
            s.cosmetics = { ...(s.cosmetics || {}), killEffect: item.id };
        } else if (item.category === 'skin') {
            s.cosmetics = { ...(s.cosmetics || {}), skins: { ...((s.cosmetics || {}).skins || {}), [item.charId]: item.id } };
        } else {
            const slotKey = {
                pilot_icon:  'equipped_animated_icon',
                lb_frame:    'equipped_lb_frame',
                title_flair: 'equipped_title_style',
                meteor_fx:   'equipped_meteor_fx',
            }[item.category];
            if (slotKey) {
                s.profile = { ...(s.profile || {}), [slotKey]: item.id };
            }
        }
        SaveManager.save(s);
        setSave(s);
        SaveManager.syncToBackendImmediate();
    };

    // Per-category counts for the source filter pills.
    const sourceCounts = useMemo(() => {
        let base = ALL_WARDROBE_ITEMS.filter(i => i.category === activeCategory);
        if (activeCategory === 'skin') base = base.filter(i => i.charId === currentSkinChar.id);
        return {
            all: base.length,
            owned:    base.filter(i => isItemOwned(i, save)).length,
            standard: base.filter(i => i.source === 'standard' || i.source === 'free').length,
            chest:    base.filter(i => i.source === 'chest').length,
            locked:   base.filter(i => !isItemOwned(i, save)).length,
        };
    }, [activeCategory, save, currentSkinChar.id]);

    return (
        <OmenXGate isCarousel={isCarousel}>
        <div className={`${isCarousel ? 'min-h-full' : 'min-h-screen'} relative text-slate-200 p-2 pb-20 md:p-6 font-sans`}>
            {!isCarousel && <SpaceBackground />}
            <div className="max-w-5xl mx-auto">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 md:gap-4 mb-4 md:mb-6 border-b border-slate-800 pb-2 md:pb-4">
                    <div>
                        {!isCarousel && (
                            <button
                                onClick={() => { SoundManager.playUIClick(); navigate('/'); }}
                                className="mb-2 md:mb-4 flex items-center gap-1.5 md:gap-2 text-slate-400 hover:text-white transition-colors font-bold text-xs md:text-sm bg-slate-900 px-2 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg border border-slate-700 w-fit"
                            >
                                <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> Main Menu
                            </button>
                        )}
                        <h1
                            className="text-2xl md:text-4xl font-black uppercase tracking-widest"
                            style={{ background: 'linear-gradient(90deg, #22d3ee, #c084fc, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 10px rgba(34,211,238,0.4))' }}
                        >
                            WARDROBE
                        </h1>
                        <p className="text-slate-400 mt-0.5 md:text-sm text-xs tracking-widest uppercase">Every cosmetic, in one place.</p>
                    </div>
                    <CurrencyHeader />
                </header>

                {/* Heads-up about the standard / chest reframe */}
                <div className="mb-4 bg-slate-900/70 border border-cyan-700/40 rounded-lg px-3 py-2 text-xs text-slate-300 leading-snug">
                    <strong className="text-cyan-300">Standard cosmetics</strong> are moving to a <strong>Support-the-Devs</strong> GMT tier — purchasing returns when GMT launches. Anything you already own stays equippable.{' '}
                    <strong className="text-amber-300">Chest cosmetics</strong> drop from VIP chests once they ship.
                </div>

                {/* Category tabs */}
                <div className="flex flex-wrap gap-2 mb-3">
                    {CATEGORY_TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => { SoundManager.playUIClick(); setActiveCategory(tab.id); setActiveSource('all'); setPreviewTrailId(null); setPreviewKillId(null); }}
                            className={`px-3 py-1.5 md:px-4 md:py-2 rounded-xl font-black tracking-widest uppercase text-[10px] md:text-xs transition-all flex items-center gap-1.5 ${
                                activeCategory === tab.id
                                    ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.3)]'
                                    : 'bg-[#0b0416]/80 border border-slate-700/50 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-200'
                            }`}
                        >
                            <span>{tab.icon}</span> {tab.label}
                        </button>
                    ))}
                </div>

                {/* Source filter pills */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                    {SOURCE_FILTERS.map(f => (
                        <button
                            key={f.id}
                            onClick={() => { SoundManager.playUIClick(); setActiveSource(f.id); }}
                            className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
                                activeSource === f.id
                                    ? 'bg-fuchsia-600/70 text-white'
                                    : 'bg-slate-900 text-slate-500 hover:bg-slate-800'
                            }`}
                        >
                            {f.label} <span className="ml-1 opacity-60">{sourceCounts[f.id] ?? 0}</span>
                        </button>
                    ))}
                </div>

                {/* Live preview canvas — same big preview the Armoury used to show.
                    Renders for trail / kill_fx categories. Temp-previewed ids
                    (set by clicking a card's Preview button) override the
                    equipped values without saving. */}
                {(activeCategory === 'trail' || activeCategory === 'kill_fx') && (() => {
                    const equippedTrail = save.cosmetics?.trail || 'default';
                    const equippedKill  = save.cosmetics?.killEffect || 'none';
                    const trailId = previewTrailId || equippedTrail;
                    const killId  = previewKillId  || equippedKill;
                    const equippedSkinId = save.cosmetics?.skins?.[currentSkinChar.id] || `${currentSkinChar.id}_default`;
                    const playerColor = SKIN_COSMETICS.find(s => s.id === equippedSkinId)?.color
                                       || currentSkinChar.color
                                       || '#00cfff';
                    const trailName = TRAIL_COSMETICS.find(t => t.id === trailId)?.name
                                     || ALL_WARDROBE_ITEMS.find(i => i.id === trailId)?.name
                                     || trailId;
                    const killName  = KILL_COSMETICS.find(k => k.id === killId)?.name
                                     || ALL_WARDROBE_ITEMS.find(i => i.id === killId)?.name
                                     || killId;
                    return (
                        <div className="mb-4">
                            <CosmeticPreview
                                trailId={trailId}
                                killEffectId={killId}
                                charId={currentSkinChar.id}
                                playerColor={playerColor}
                            />
                            <div className="flex gap-3 mt-2 text-xs text-slate-400 justify-center flex-wrap">
                                <span>Trail: <strong className={previewTrailId ? 'text-amber-400' : 'text-pink-400'}>{trailName}</strong>{previewTrailId && <span className="text-amber-500/70 ml-1">(previewing)</span>}</span>
                                <span>Kill Effect: <strong className={previewKillId ? 'text-amber-400' : 'text-pink-400'}>{killName}</strong>{previewKillId && <span className="text-amber-500/70 ml-1">(previewing)</span>}</span>
                                {(previewTrailId || previewKillId) && (
                                    <button
                                        onClick={() => { SoundManager.playUIClick(); setPreviewTrailId(null); setPreviewKillId(null); }}
                                        className="text-slate-500 hover:text-white underline"
                                    >
                                        clear preview
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* Skin tab character selector */}
                {activeCategory === 'skin' && (
                    <div className="flex items-center justify-between bg-slate-800 p-1.5 md:p-2 rounded-xl mb-4 border border-slate-700">
                        <button
                            onClick={() => { SoundManager.playUIClick(); setSkinCharIndex(i => (i - 1 + unlockedChars.length) % unlockedChars.length); }}
                            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full overflow-hidden border-2" style={{ borderColor: currentSkinChar.color }}>
                                {currentSkinChar.image
                                    ? <img src={currentSkinChar.image} alt={currentSkinChar.name} className="w-full h-full object-cover" />
                                    : <div className="w-full h-full bg-slate-800" />
                                }
                            </div>
                            <div className="font-bold text-white text-sm">
                                {currentSkinChar.name}
                                <div className="text-[10px] text-slate-500 font-normal">{(skinCharIndex % unlockedChars.length) + 1} / {unlockedChars.length}</div>
                            </div>
                        </div>
                        <button
                            onClick={() => { SoundManager.playUIClick(); setSkinCharIndex(i => (i + 1) % unlockedChars.length); }}
                            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
                        >
                            <ChevronRight className="w-6 h-6" />
                        </button>
                    </div>
                )}

                {/* Grid */}
                <div className="flex-1 bg-[#0b0416]/60 backdrop-blur-xl rounded-xl md:rounded-2xl p-2 md:p-5 border border-cyan-500/20 shadow-[0_0_50px_rgba(34,211,238,0.1),inset_0_1px_0_rgba(255,255,255,0.05)] min-h-[400px]">
                    {visibleItems.length === 0 ? (
                        <div className="text-slate-500 text-center py-16 text-sm">
                            Nothing here yet for this filter.
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 md:gap-3">
                            {visibleItems.map(item => {
                                const owned = isItemOwned(item, save);
                                const equippedId = getEquippedId(item.category, save, item.charId || currentSkinChar.id);
                                const equipped = equippedId === item.id;
                                return (
                                    <WardrobeCard
                                        key={item.id}
                                        item={item}
                                        owned={owned}
                                        equipped={equipped}
                                        onPreview={() => {
                                            SoundManager.playUIClick();
                                            // Trails / kill FX: temp-equip on the top preview canvas
                                            // (no modal — exactly like the old Armoury).
                                            if (item.category === 'trail') {
                                                setPreviewTrailId(prev => prev === item.id ? null : item.id);
                                            } else if (item.category === 'kill_fx') {
                                                setPreviewKillId(prev => prev === item.id ? null : item.id);
                                            } else {
                                                // Everything else still uses the modal (skin colour, chest categories).
                                                setPreviewItem(item);
                                            }
                                        }}
                                        onEquip={() => handleEquip(item)}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {previewItem && (
                <WardrobePreviewModal
                    item={previewItem}
                    save={save}
                    charId={previewItem.charId || currentSkinChar.id}
                    onClose={() => setPreviewItem(null)}
                />
            )}
        </div>
        </OmenXGate>
    );
}