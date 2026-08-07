import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Trash2, Check, X, Play, Sparkles, Shield, Swords, Gem } from 'lucide-react';
import { SaveManager } from '../game/SaveManager';
import { CHARACTERS, ARENAS, DIFFICULTIES, RELICS, TRAIL_COSMETICS, SKIN_COSMETICS } from '../game/Constants';
import { SoundManager } from '../game/SoundManager';
import SpaceBackground from '../components/game/SpaceBackground';
import OmenXGate from '../components/game/OmenXGate';
import CurrencyHeader from '../components/game/CurrencyHeader';
import PoolBiasPanel from '../components/loadouts/PoolBiasPanel';
import { useCurrency } from '@/lib/CurrencyContext';
import { ensureNftsFetched } from '@/lib/playerDataCache';

const SLOT_COUNT = 3;
const SLOT_THEMES = [
    { border: 'border-cyan-500/50', accent: 'text-cyan-300', bg: 'bg-cyan-950/30', glow: 'shadow-[0_0_20px_rgba(6,182,212,0.25)]', btn: 'bg-cyan-600 hover:bg-cyan-500' },
    { border: 'border-fuchsia-500/50', accent: 'text-fuchsia-300', bg: 'bg-fuchsia-950/30', glow: 'shadow-[0_0_20px_rgba(217,70,239,0.25)]', btn: 'bg-fuchsia-600 hover:bg-fuchsia-500' },
    { border: 'border-amber-500/50', accent: 'text-amber-300', bg: 'bg-amber-950/30', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.25)]', btn: 'bg-amber-600 hover:bg-amber-500' },
];

export default function Loadouts({ isCarousel }) {
    const navigate = useNavigate();
    const [save, setSave] = useState(SaveManager.load());
    const [confirmDelete, setConfirmDelete] = useState(null);
    const { nfts } = useCurrency();

    useEffect(() => { ensureNftsFetched(); }, []);

    useEffect(() => {
        const handler = (e) => setSave(e.detail);
        window.addEventListener('saveUpdated', handler);
        return () => window.removeEventListener('saveUpdated', handler);
    }, []);

    const nftUnlockedChars = useMemo(() => (nfts || [])
        .map(n => n.metadata?.name?.toLowerCase())
        .filter(c => c && CHARACTERS.find(ch => ch.id === c)), [nfts]);
    const effectiveUnlockedCharacters = useMemo(
        () => [...new Set([...(save.unlockedCharacters || ['neobyte']), ...nftUnlockedChars])],
        [save.unlockedCharacters, nftUnlockedChars]
    );

    const presets = save.loadoutPresets || [null, null, null];

    const persist = (newPresets) => {
        const newSave = { ...save, loadoutPresets: newPresets };
        SaveManager.save(newSave);
        setSave(newSave);
    };

    const handleSaveCurrent = (slotIndex) => {
        SoundManager.playUIClick();
        const charId = save.lastSelectedChar || 'neobyte';
        const preset = {
            charId,
            arenaId: save.lastSelectedArena || 'station',
            difficultyId: save.lastSelectedDifficulty || 'normal',
            skinId: save.cosmetics?.skins?.[charId] || `${charId}_default`,
            trailId: save.cosmetics?.trail || 'default',
            equippedRelics: [...(save.equippedRelics || [])],
            savedAt: Date.now(),
        };
        const next = [...presets];
        while (next.length < SLOT_COUNT) next.push(null);
        next[slotIndex] = preset;
        persist(next);
    };

    const handleApply = (slotIndex, andLaunch = false) => {
        const preset = presets[slotIndex];
        if (!preset) return;
        SoundManager.playUIClick();

        const charValid = effectiveUnlockedCharacters.includes(preset.charId);
        const finalChar = charValid ? preset.charId : (save.lastSelectedChar || 'neobyte');
        const unlockedForChar = save.unlockedArenasByCharacter?.[finalChar] || ['station'];
        const arenaValid = unlockedForChar.includes(preset.arenaId);
        const finalArena = arenaValid ? preset.arenaId : 'station';
        const difficultyValid = !!DIFFICULTIES.find(d => d.id === preset.difficultyId);
        const finalDifficulty = difficultyValid ? preset.difficultyId : 'normal';

        const ownedRelics = save.unlockedRelics || [];
        const validRelics = (preset.equippedRelics || []).filter(rId => ownedRelics.includes(rId)).slice(0, 2);
        const ownedSkins = save.unlockedSkins || [];
        const skinValid = preset.skinId && (preset.skinId.endsWith('_default') || ownedSkins.includes(preset.skinId));
        const ownedTrails = save.unlockedCosmetics || ['default'];
        const trailValid = preset.trailId && ownedTrails.includes(preset.trailId);

        const newSave = {
            ...save,
            lastSelectedChar: finalChar,
            lastSelectedArena: finalArena,
            lastSelectedDifficulty: finalDifficulty,
            equippedRelics: validRelics,
            cosmetics: {
                ...(save.cosmetics || {}),
                ...(skinValid ? { skins: { ...(save.cosmetics?.skins || {}), [finalChar]: preset.skinId } } : {}),
                ...(trailValid ? { trail: preset.trailId } : {}),
            },
        };
        SaveManager.save(newSave);
        setSave(newSave);

        if (andLaunch) {
            // Send user back to Sloth Lounge with the loadout applied — they hit Launch from there.
            navigate('/?slide=1');
        }
    };

    const handleDelete = (slotIndex) => {
        SoundManager.playUIClick();
        const next = [...presets];
        while (next.length < SLOT_COUNT) next.push(null);
        next[slotIndex] = null;
        persist(next);
        setConfirmDelete(null);
    };

    return (
        <OmenXGate isCarousel={isCarousel}>
            <div className={`${isCarousel ? 'min-h-full' : 'min-h-screen'} relative text-slate-200 p-2 pb-20 md:p-6 font-sans`}>
                {!isCarousel && <SpaceBackground />}
                <div className="max-w-5xl mx-auto relative z-10">
                    <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 md:gap-4 mb-4 md:mb-6 border-b border-slate-800 pb-2 md:pb-4">
                        <div>
                            {!isCarousel && (
                                <button
                                    onClick={() => { SoundManager.playUIClick(); navigate('/?slide=1'); }}
                                    className="mb-2 md:mb-4 flex items-center gap-1.5 md:gap-2 text-slate-400 hover:text-white transition-colors font-bold text-xs md:text-sm bg-slate-900 px-2 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg border border-slate-700 w-fit"
                                >
                                    <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> Sloth Lounge
                                </button>
                            )}
                            <h1 className="text-2xl md:text-4xl font-black uppercase tracking-widest flex items-center gap-2"
                                style={{ background: 'linear-gradient(90deg, #06B6D4, #D946EF, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 0 10px rgba(217,70,239,0.5))' }}>
                                <Save className="w-6 h-6 md:w-8 md:h-8 text-cyan-400" /> Loadout Presets
                            </h1>
                            <p className="text-slate-400 mt-0.5 md:text-sm text-xs tracking-widest uppercase">
                                Save & swap full configurations in one tap
                            </p>
                        </div>
                        <CurrencyHeader />
                    </header>

                    <PoolBiasPanel save={save} setSave={setSave} />

                    <div className="bg-[#0b0416]/60 backdrop-blur-xl border border-slate-700/50 rounded-xl p-3 md:p-5 mb-4 text-xs md:text-sm text-slate-300 leading-relaxed">
                        <span className="font-bold text-cyan-300">How it works:</span> A preset captures your current
                        <span className="text-fuchsia-300 font-bold"> character</span>,
                        <span className="text-emerald-300 font-bold"> sector</span>,
                        <span className="text-amber-300 font-bold"> difficulty</span>,
                        <span className="text-pink-300 font-bold"> skin</span>,
                        <span className="text-cyan-300 font-bold"> trail</span>, and
                        <span className="text-purple-300 font-bold"> equipped relics</span>.
                        Tap <span className="font-bold text-white">Apply</span> to load a preset back into the Sloth Lounge.
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                        {Array.from({ length: SLOT_COUNT }).map((_, i) => {
                            const preset = presets[i];
                            const theme = SLOT_THEMES[i];
                            const isEmpty = !preset;
                            const isConfirming = confirmDelete === i;

                            const char = preset ? CHARACTERS.find(c => c.id === preset.charId) : null;
                            const arena = preset ? ARENAS.find(a => a.id === preset.arenaId) : null;
                            const difficulty = preset ? DIFFICULTIES.find(d => d.id === preset.difficultyId) : null;
                            const skin = preset ? SKIN_COSMETICS.find(s => s.id === preset.skinId) : null;
                            const trail = preset ? TRAIL_COSMETICS.find(t => t.id === preset.trailId) : null;
                            const relicData = preset ? (preset.equippedRelics || []).map(rId => RELICS.find(r => r.id === rId)).filter(Boolean) : [];

                            return (
                                <div key={i}
                                    className={`rounded-xl border-2 p-3 md:p-4 flex flex-col gap-3 ${isEmpty ? 'bg-slate-950/50 border-slate-800' : `${theme.bg} ${theme.border} ${theme.glow}`}`}>
                                    <div className="flex items-center justify-between">
                                        <span className={`text-sm md:text-base font-black tracking-widest uppercase ${isEmpty ? 'text-slate-500' : theme.accent}`}>
                                            Slot {i + 1}
                                        </span>
                                        {!isEmpty && (
                                            <button
                                                onClick={() => isConfirming ? handleDelete(i) : setConfirmDelete(i)}
                                                title={isConfirming ? 'Confirm delete' : 'Delete preset'}
                                                className={`p-1.5 rounded transition-colors ${isConfirming ? 'bg-red-600 text-white' : 'text-slate-500 hover:text-red-400 hover:bg-red-950/40'}`}
                                            >
                                                {isConfirming ? <Check className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                                            </button>
                                        )}
                                    </div>

                                    {isEmpty ? (
                                        <div className="flex-1 flex flex-col items-center justify-center py-8 md:py-12 text-center gap-2">
                                            <Save className="w-8 h-8 md:w-10 md:h-10 text-slate-700" />
                                            <div className="text-sm text-slate-500 italic">Empty Slot</div>
                                            <div className="text-[10px] md:text-xs text-slate-600 px-2">
                                                Save your current Sloth Lounge selections here
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex-1 flex flex-col gap-2.5">
                                            {/* Character row */}
                                            <div className="flex items-center gap-2.5 bg-slate-950/40 rounded-lg p-2 border border-slate-800">
                                                <div className="w-12 h-12 rounded-full overflow-hidden border-2 shrink-0" style={{ borderColor: char?.color || '#888' }}>
                                                    {char?.image ? <img src={char.image} alt={char.name} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-800" />}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className={`text-sm font-bold truncate ${theme.accent}`}>{char?.name || preset.charId}</div>
                                                    <div className="text-[10px] text-slate-400 truncate">{arena?.name || preset.arenaId}</div>
                                                    <div className="text-[10px] text-slate-500 capitalize">{difficulty?.name || preset.difficultyId} difficulty</div>
                                                </div>
                                            </div>

                                            {/* Cosmetics row */}
                                            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                                                <div className="bg-slate-950/40 border border-slate-800 rounded px-2 py-1.5 flex items-center gap-1.5 min-w-0">
                                                    <div className="w-3 h-3 rounded-full shrink-0 border border-slate-600" style={{ background: skin?.color || char?.color || '#888' }} />
                                                    <span className="text-slate-500 shrink-0">Skin:</span>
                                                    <span className="text-white font-bold truncate">{skin?.name || 'Default'}</span>
                                                </div>
                                                <div className="bg-slate-950/40 border border-slate-800 rounded px-2 py-1.5 flex items-center gap-1.5 min-w-0">
                                                    <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
                                                    <span className="text-slate-500 shrink-0">Trail:</span>
                                                    <span className="text-white font-bold truncate">{trail?.name || 'Default'}</span>
                                                </div>
                                            </div>

                                            {/* Relics */}
                                            <div className="bg-slate-950/40 border border-slate-800 rounded p-2">
                                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-1.5 uppercase tracking-widest font-bold">
                                                    <Gem className="w-3 h-3 text-purple-400" /> Relics ({relicData.length}/2)
                                                </div>
                                                {relicData.length > 0 ? (
                                                    <div className="flex flex-col gap-1">
                                                        {relicData.map(r => (
                                                            <div key={r.id} className="flex items-center gap-1.5 text-[11px]">
                                                                <span className="text-base">{r.icon}</span>
                                                                <span className="text-purple-200 font-bold truncate">{r.name}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-[10px] text-slate-600 italic">No relics equipped</div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Action buttons */}
                                    <div className="flex flex-col gap-1.5 mt-auto">
                                        {!isEmpty && (
                                            <>
                                                <button
                                                    onClick={() => handleApply(i, true)}
                                                    className={`w-full py-2.5 rounded-lg font-black text-xs tracking-widest uppercase transition-all hover:scale-[1.02] active:scale-95 text-white flex items-center justify-center gap-1.5 ${theme.btn} shadow-md`}
                                                >
                                                    <Play className="w-3.5 h-3.5" /> Apply & Go
                                                </button>
                                                <button
                                                    onClick={() => handleApply(i, false)}
                                                    className={`w-full py-1.5 rounded-lg font-black text-[10px] tracking-widest uppercase transition-all hover:scale-[1.02] active:scale-95 ${theme.bg} border ${theme.border} ${theme.accent} hover:brightness-125`}
                                                >
                                                    Apply Only
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => handleSaveCurrent(i)}
                                            className="w-full py-1.5 rounded-lg font-black text-[10px] tracking-widest uppercase transition-all hover:scale-[1.02] active:scale-95 bg-slate-800/80 hover:bg-slate-700 border border-slate-600 text-slate-300 hover:text-white"
                                        >
                                            {isEmpty ? 'Save Current Loadout' : 'Overwrite With Current'}
                                        </button>
                                    </div>

                                    {isConfirming && (
                                        <button
                                            onClick={() => setConfirmDelete(null)}
                                            className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center justify-center gap-1"
                                        >
                                            <X className="w-3 h-3" /> Cancel delete
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </OmenXGate>
    );
}