import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { SaveManager } from '../game/SaveManager';
import { CharacterUnlockManager } from '../game/CharacterUnlocks';
import { CHARACTERS, ARENAS, DIFFICULTIES, WEAPONS, TRAIL_COSMETICS, SKIN_COSMETICS, getCharacterMastery } from '../game/Constants';

// Hub sector picker should ONLY show selectable storyline sectors. Filter out
// special-purpose arenas that are launched from dedicated UIs and would otherwise
// leak in (and worse, show as "LOCKED" because they're not in unlockedArenasByCharacter):
//   - quantum_meteor  → launched from Squads → Meteor tab
//   - world_boss_arena → launched from Global Raid page
//   - endless         → launched via the dedicated ENDLESS button, not this cycler
const HUB_SECTOR_BLOCKLIST = new Set(['quantum_meteor', 'world_boss_arena', 'endless']);
const SECTOR_ARENAS = ARENAS.filter(a => !HUB_SECTOR_BLOCKLIST.has(a.id));

// Outer Galaxy (S11-S20) partition for the Hub sector tab split (added 2026-06-04).
// IDs must match the 10 new ARENAS entries appended in game/Constants.js. The
// Inner/Outer split powers the tabbed sector picker — players default to Inner
// Galaxy on first visit; endgame players who last ran an Outer Galaxy sector
// land back on the Outer tab automatically via the selection-sync effect.
const OUTER_GALAXY_IDS = new Set([
    'galactic_core', 'pillars', 'saturnian', 'andromeda', 'painters_spiral',
    'harmony', 'chromatic', 'stormfront', 'supernova', 'devourer',
]);
const INNER_SECTOR_ARENAS = SECTOR_ARENAS.filter(a => !OUTER_GALAXY_IDS.has(a.id));
const OUTER_SECTOR_ARENAS = SECTOR_ARENAS.filter(a => OUTER_GALAXY_IDS.has(a.id));
import { ArrowRight, ArrowLeft, ChevronLeft, ChevronRight, Coins } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from "@/components/ui/use-toast";
import { useCurrency } from '@/lib/CurrencyContext';
import { IN_GAME_SKUS } from '@/lib/skuMap';
import moment from 'moment';
import { SoundManager } from '../game/SoundManager';
import { isS6OrLater } from '@/lib/seasonGate';
import BountiesPanel from '../components/game/BountiesPanel';
import BuildSummary from '../components/game/BuildSummary';
import { Skull, Crosshair, Zap, Shield, Star } from 'lucide-react';
import SpaceBackground from '../components/game/SpaceBackground';
import CurrencyHeader from '../components/game/CurrencyHeader';
import CosmeticPreview from '../components/game/CosmeticPreview';
import CharacterStatPills from '../components/game/CharacterStatPills';
import OmenXAuthButton from '../components/game/OmenXAuthButton';
import OmenXGate from '../components/game/OmenXGate';
import OmenXConfirmation from '../components/game/OmenXConfirmation';
import SandboxHubCard from '../components/game/SandboxHubCard';
import { useOmenXUser } from '@/hooks/useOmenXUser';
import { useOmenXVip } from '@/hooks/useOmenXVip';
import { useOmenXConfirmation } from '@/hooks/useOmenXConfirmation';
import { useOmenXPurchasesDisabled } from '@/hooks/useOmenXPurchasesDisabled';

import { subscribePlayerData, ensureNftsFetched, refreshBalance } from '@/lib/playerDataCache';
import { normalizeNftCharacterName } from '@/lib/nftNameNormalize';

function getOmenXAuth() {
    try { return JSON.parse(localStorage.getItem('omenx_auth_data')); } catch { return null; }
}

export default function Hub({ isCarousel }) {
    const navigate = useNavigate();
    const initialSave = SaveManager.load() || {};
    const safeInitialSave = {
        unlockedCharacters: (initialSave?.unlockedCharacters ?? []).length > 0 ? initialSave.unlockedCharacters : ['neobyte'],
        unlockedArenasByCharacter: initialSave?.unlockedArenasByCharacter ?? {},
        unlockedCosmetics: (initialSave?.unlockedCosmetics?.length ?? 0) > 0 ? initialSave.unlockedCosmetics : ['default'],
        cosmetics: initialSave?.cosmetics ?? {},
        gold: initialSave?.gold ?? 0,
        sessionBuffs: initialSave?.sessionBuffs ?? {},
        characterKills: initialSave?.characterKills ?? {},
        foundCharacters: initialSave?.foundCharacters ?? [],
        encounteredEnemies: initialSave?.encounteredEnemies ?? [],
        enemyKills: initialSave?.enemyKills ?? {},
        relicFragments: initialSave?.relicFragments ?? 0,
        cosmicTokens: initialSave?.cosmicTokens ?? 0,
        lastSelectedChar: initialSave?.lastSelectedChar,
        lastSelectedArena: initialSave?.lastSelectedArena,
        lastSelectedDifficulty: initialSave?.lastSelectedDifficulty,
        lastSelectedWeapon: initialSave?.lastSelectedWeapon,
        hasSetProfileName: initialSave?.hasSetProfileName,
        bounties: initialSave?.bounties,
        maxTimeSurvived: initialSave?.maxTimeSurvived ?? 0,
        totalGoldEarned: initialSave?.totalGoldEarned ?? 0,
        maxLevelReached: initialSave?.maxLevelReached ?? 0,
        totalKills: initialSave?.totalKills ?? 0
    };
    const [save, setSave] = useState(safeInitialSave);
    const [omenxAuth, setOmenxAuth] = useState(null);
    const [pendingLaunch, setPendingLaunch] = useState(null); // 'normal' | 'endless'
    const [syncReady, setSyncReady] = useState(false);
    // Once we've applied the cloud-saved character/arena/difficulty/weapon to local
    // state ONCE, we never re-sync those fields from external save updates again —
    // otherwise every background save (including the user's own picks being written
    // back) would clobber the active selection.
    const initialSelectionApplied = React.useRef(false);
    const { vip: vipLevel } = useOmenXVip();
    const { nfts } = useCurrency();

    // Track timestamps of saves WE wrote, so we can ignore the saveUpdated echo
    // they trigger (otherwise every character cycle causes a re-render flicker).
    const ownSaveTimestamps = React.useRef(new Set());

    React.useEffect(() => {
        const handleSaveUpdated = (e) => {
            if (!syncReady) return;
            const incoming = e.detail || {};
            // Ignore our own saves echoing back through the event bus.
            if (incoming.updated_at && ownSaveTimestamps.current.has(incoming.updated_at)) {
                ownSaveTimestamps.current.delete(incoming.updated_at);
                return;
            }
            setSave(prev => ({
                ...incoming,
                // Preserve the user's live selection — owned by local state.
                lastSelectedChar: prev.lastSelectedChar,
                lastSelectedArena: prev.lastSelectedArena,
                lastSelectedDifficulty: prev.lastSelectedDifficulty,
                lastSelectedWeapon: prev.lastSelectedWeapon,
            }));
        };
        window.addEventListener('saveUpdated', handleSaveUpdated);
        return () => window.removeEventListener('saveUpdated', handleSaveUpdated);
    }, [syncReady]);

    // Compute NFT-unlocked characters for UI only (do NOT persist via SaveManager —
    // syncSave is server-authoritative and blocks client-side unlockedCharacters writes).
    // The cloud already grants NFT unlocks via its own logic; this just makes them
    // visible immediately in the UI without waiting for the next cloud sync round-trip.
    const nftUnlockedChars = React.useMemo(() => {
        return (nfts || [])
            .map(nft => normalizeNftCharacterName(nft.metadata?.name))
            .filter(charId => charId && CHARACTERS.find(c => c.id === charId));
    }, [nfts]);

    // Merge save's cloud-authoritative unlockedCharacters with NFT unlocks (UI only).
    // ALWAYS force-include 'neobyte' — it's the universal starter every player owns.
    // Without this fallback, a brand new player whose cloud save returns
    // unlockedCharacters: [] would see NeoByte as locked, blocking the LAUNCH button
    // even though the local default seeded it correctly (Texxy/Zebrina bug 2026-05-03).
    const effectiveUnlockedCharacters = React.useMemo(() => {
        return [...new Set(['neobyte', ...(save.unlockedCharacters || []), ...nftUnlockedChars])];
    }, [save.unlockedCharacters, nftUnlockedChars]);

    const { user: omenxUser } = useOmenXUser();

    React.useEffect(() => {
         let isMounted = true;
         const initOmenX = async () => {
             const auth = getOmenXAuth();
             if (!isMounted) return;
             setOmenxAuth(auth);

             if (auth?.walletAddress) {
                 try {
                     await SaveManager.initialize();
                     if (!isMounted) return;

                     // Load merged save (initialize() has completed by now)
                     const mergedSave = SaveManager.load();
                     if (!isMounted) return;

                     // Use centralized cache for player data (deduped)
                     subscribePlayerData(() => {});
                     // Trigger NFT fetch if not already cached — required to unlock NFT characters
                     ensureNftsFetched();

                     setSave(mergedSave);

                     // VIP level is now fetched via useOmenXVip hook globally
                    if (vipLevel > 0 && isMounted) {
                        const s = SaveManager.load();
                        if (s.vipLevel !== vipLevel) {
                            s.vipLevel = vipLevel;
                            SaveManager.save(s);
                            setSave(s);
                        }
                    }
                } catch (e) {
                    console.error('Failed to initialize SaveManager:', e);
                }
                if (isMounted) setSyncReady(true);
            } else {
                setSyncReady(true);
            }
        };
        initOmenX();
        return () => { isMounted = false; };
    }, [vipLevel]);

    const [selectedChar, setSelectedChar] = useState(save.lastSelectedChar || 'neobyte');
    const [selectedArena, setSelectedArena] = useState(save.lastSelectedArena || 'station');
    const [selectedDifficulty, setSelectedDifficulty] = useState(save.lastSelectedDifficulty || 'normal');
    const [selectedWeapon, setSelectedWeapon] = useState(save.lastSelectedWeapon || 'neoBlaster');
    const [charTab, setCharTab] = useState('loadout');
    // Inner/Outer Galaxy tab — persisted via localStorage so endgame players who
    // last played Outer Galaxy land back on it. Also synced from save.lastSelectedArena
    // on initial mount (see selection-apply effect below) — that takes precedence
    // over localStorage so the tab tracks the player's actual last run.
    const [galaxyTab, setGalaxyTab] = useState(() => {
        try { return localStorage.getItem('hub_galaxy_tab') || 'inner'; } catch { return 'inner'; }
    });
    const { toast } = useToast();
    const { omenxBalance } = useCurrency();
    const touchStartX = React.useRef(null);
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [buffPurchasing, setBuffPurchasing] = useState(false);
    const { pending: buffPending, confirm: confirmBuffPurchase } = useOmenXConfirmation('hub-xp-buff');
    const { disabled: omenxBlocked, message: omenxBlockedMsg } = useOmenXPurchasesDisabled();

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const getAvailableWeapons = (charId) => {
        return [WEAPONS['neoBlaster']].filter(Boolean);
    };

    const prevCharRef = useRef(selectedChar);

    React.useEffect(() => {
        if (prevCharRef.current !== selectedChar) {
            setSelectedWeapon('neoBlaster');
            prevCharRef.current = selectedChar;
        } else {
            const available = getAvailableWeapons(selectedChar);
            if (!available.find(w => w.id === selectedWeapon)) {
                setSelectedWeapon(available[0]?.id || 'neoBlaster');
            }
        }
    }, [selectedChar, selectedWeapon]);
    
    // When save data arrives from cloud (after init), sync the selection state
    // to whatever was last used — but only ONCE. After that, the user's picks
    // are owned by local state; later save events must NOT overwrite them.
    React.useEffect(() => {
        if (!syncReady || initialSelectionApplied.current) return;
        if (save.lastSelectedChar && save.lastSelectedChar !== selectedChar) setSelectedChar(save.lastSelectedChar);
        if (save.lastSelectedArena && save.lastSelectedArena !== selectedArena) {
            // Guard: if the cloud save persists a blocked arena (e.g. someone
            // landed on quantum_meteor / world_boss_arena via the old buggy
            // cycler), snap back to 'station' so they aren't permanently stuck
            // on a LOCKED tile they can't launch from.
            const safeArena = HUB_SECTOR_BLOCKLIST.has(save.lastSelectedArena) ? 'station' : save.lastSelectedArena;
            setSelectedArena(safeArena);
            // Sync the Inner/Outer galaxy tab to match the loaded arena — overrides
            // the localStorage default so endgame players whose last run was Outer
            // Galaxy land directly on that tab without an extra click.
            setGalaxyTab(OUTER_GALAXY_IDS.has(safeArena) ? 'outer' : 'inner');
        }
        if (save.lastSelectedDifficulty && save.lastSelectedDifficulty !== selectedDifficulty) setSelectedDifficulty(save.lastSelectedDifficulty);
        if (save.lastSelectedWeapon && save.lastSelectedWeapon !== selectedWeapon) setSelectedWeapon(save.lastSelectedWeapon);
        initialSelectionApplied.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [syncReady, save.lastSelectedChar, save.lastSelectedArena, save.lastSelectedDifficulty, save.lastSelectedWeapon]);

    React.useEffect(() => {
        // Persist selection to save (debounced — avoids hammering localStorage and
        // dispatching saveUpdated on every rapid arrow-cycle, which used to cause
        // BuildSummary/cosmetic-preview to flicker as state churned).
        if (!syncReady) return;
        const t = setTimeout(() => {
            const current = SaveManager.load();
            const newSave = {
                ...current,
                lastSelectedChar: selectedChar,
                lastSelectedArena: selectedArena,
                lastSelectedDifficulty: selectedDifficulty,
                lastSelectedWeapon: selectedWeapon,
            };
            // Mark this timestamp so the saveUpdated listener can ignore the echo.
            const ts = Date.now();
            newSave.updated_at = ts;
            ownSaveTimestamps.current.add(ts);
            SaveManager.save(newSave);
        }, 250);
        return () => clearTimeout(t);
    }, [syncReady, selectedChar, selectedArena, selectedDifficulty, selectedWeapon]);

    // OmenX-only mode: skip Base44 reward claims

    const checkAndLaunch = async (mode) => {
        SoundManager.playUIClick();
        launchGame(mode);
    };

    const launchGame = async (mode) => {
        // Prefetch save from backend so Game page finds it in localStorage immediately (no blocking wait)
        const auth = getOmenXAuth();
        if (auth?.walletAddress && auth?.accessToken) {
            base44.functions.invoke('loadSave', { walletAddress: auth.walletAddress, accessToken: auth.accessToken })
                .then(({ data: response }) => {
                    if (response?.saveData) {
                        const existing = localStorage.getItem('cosmic_sloth_save');
                        if (existing) {
                            const merged = { ...JSON.parse(existing), ...(typeof response.saveData === 'string' ? JSON.parse(response.saveData) : response.saveData) };
                            localStorage.setItem('cosmic_sloth_save', JSON.stringify(merged));
                        } else {
                            localStorage.setItem('cosmic_sloth_save', JSON.stringify(response.saveData));
                        }
                    }
                })
                .catch(() => {}); // non-blocking, game will handle failure
        }
        navigate('/game', { state: { characterId: selectedChar, arenaId: selectedArena, difficultyId: selectedDifficulty, startingWeaponId: selectedWeapon, isEndless: mode === 'endless' } });
    };

    const startGame = () => checkAndLaunch('normal');

    // Inner/Outer Galaxy tab — derived data + switch handler.
    // visibleSectorArenas is the list the sector cycler iterates through.
    // showOuterNewBadge surfaces ★ NEW on the Outer tab until the selected
    // character has unlocked at least one Outer Galaxy sector.
    const visibleSectorArenas = galaxyTab === 'outer' ? OUTER_SECTOR_ARENAS : INNER_SECTOR_ARENAS;
    const charUnlockedArenas = save?.unlockedArenasByCharacter?.[selectedChar] || ['station'];
    const showOuterNewBadge = !charUnlockedArenas.some(id => OUTER_GALAXY_IDS.has(id));
    const switchGalaxyTab = (tab) => {
        if (tab === galaxyTab) return;
        SoundManager.playUIClick();
        setGalaxyTab(tab);
        try { localStorage.setItem('hub_galaxy_tab', tab); } catch {}
        // If the currently-selected sector isn't in the new galaxy, snap to its
        // first sector so the cycler always starts on a valid entry.
        const arenas = tab === 'outer' ? OUTER_SECTOR_ARENAS : INNER_SECTOR_ARENAS;
        if (!arenas.find(a => a.id === selectedArena)) {
            setSelectedArena(arenas[0].id);
        }
    };

    // If not logged in with OmenX, show a gate (bypass in preview)
    if (!syncReady) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>;
    if (!save) return <div>Loading...</div>;
    if (!syncReady) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>;

    return (
      <OmenXGate isCarousel={isCarousel}>
        <div className={`${isCarousel ? 'min-h-full' : 'min-h-screen'} relative text-slate-200 p-1.5 pb-16 md:p-6 font-sans`}>
            {!isCarousel && <SpaceBackground />}
            <div className="max-w-6xl mx-auto relative z-10">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-1 md:gap-4 mb-1 md:mb-4 border-b border-fuchsia-900/40 pb-1 md:pb-4">
                    <div>
                        {!isCarousel && (
                            <button 
                                onClick={() => { SoundManager.playUIClick(); navigate('/'); }}
                                className="mb-2 md:mb-4 flex items-center gap-1.5 md:gap-2 text-slate-400 hover:text-white transition-colors font-bold text-xs md:text-sm bg-slate-900 px-2 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg border border-slate-700 w-fit"
                            >
                                <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> Main Menu
                            </button>
                        )}
                        <h1 className="text-xl md:text-4xl font-black tracking-widest uppercase" style={{ background: 'linear-gradient(90deg, #0CA7B8, #D946EF, #0CA7B8)', backgroundSize: '200%', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', dropShadow: '0 0 10px rgba(217,70,239,0.5)' }}>SLOTH COMMAND</h1>
                        <p className="text-slate-500 mt-0 md:text-sm text-[10px] tracking-widest uppercase hidden md:block">⚡ Rest · Upgrade · Prepare for the Cosmic Void</p>
                    </div>
                    <CurrencyHeader />
                </header>

                <div className="flex flex-col gap-2 md:gap-6">
                    <div className="flex-1 bg-[#0b0416]/60 backdrop-blur-xl rounded-xl md:rounded-2xl p-1.5 md:p-4 border border-[#D946EF]/30 shadow-[0_0_50px_rgba(217,70,239,0.15),inset_0_1px_0_rgba(255,255,255,0.1)]">
                        <div className="h-full flex flex-col justify-between">
                                <div>
                                    <h2 className="text-base md:text-lg font-bold text-white mb-2 md:mb-3 tracking-widest uppercase flex items-center gap-2"><span className="text-cyan-400">▶</span> Mission Briefing</h2>
                                    
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-1.5 md:gap-4 mb-1.5 md:mb-4">
                                        <div>
                                        <h3 className="text-xs md:text-sm text-slate-400 mb-1.5 md:mb-2">Select Operative</h3>
                                        <div 
                                            className="relative bg-[#0b0416]/80 backdrop-blur-xl rounded-lg md:rounded-xl border border-cyan-500/50 hover:border-cyan-400 overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.2)] select-none touch-pan-y transition-colors"
                                            onTouchStart={(e) => {
                                                touchStartX.current = e.changedTouches[0].screenX;
                                            }}
                                            onTouchEnd={(e) => {
                                                if (touchStartX.current === null) return;
                                                const touchEndX = e.changedTouches[0].screenX;
                                                const diff = touchStartX.current - touchEndX;
                                                if (diff > 50) {
                                                    const idx = CHARACTERS.findIndex(c => c.id === selectedChar);
                                                    setSelectedChar(CHARACTERS[idx >= CHARACTERS.length - 1 ? 0 : idx + 1].id);
                                                    SoundManager.playUIClick();
                                                } else if (diff < -50) {
                                                    const idx = CHARACTERS.findIndex(c => c.id === selectedChar);
                                                    setSelectedChar(CHARACTERS[idx <= 0 ? CHARACTERS.length - 1 : idx - 1].id);
                                                    SoundManager.playUIClick();
                                                }
                                                touchStartX.current = null;
                                            }}
                                        >
                                            {(() => {
                                                const char = CHARACTERS.find(c => c.id === selectedChar);
                                                const isUnlocked = effectiveUnlockedCharacters.includes(char?.id);
                                                const canAfford = save.gold >= char.cost;
                                                const isFindable = ['glitch', 'holodrift', 'codebreaker', 'dataphantom', 'neonvortex', 'synthbeats', 'skybyte'].includes(char.id);
                                                
                                                return (
                                                    <>
                                                        <div 
                                                            className="absolute inset-0 opacity-80 bg-contain bg-no-repeat transition-all duration-500"
                                                            style={{ 
                                                                backgroundImage: char.image ? `url(${char.image})` : 'none', 
                                                                backgroundPosition: '85% center',
                                                                filter: `drop-shadow(0 0 10px ${SKIN_COSMETICS.find(s => s.id === (save.cosmetics?.skins?.[char.id] || `${char.id}_default`))?.color || char.color})`
                                                            }}
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-r from-[#0b0416] via-[#0b0416]/90 to-transparent pointer-events-none" />
                                                        
                                                        <div className="relative flex items-center justify-between p-2.5 md:p-4 min-h-[110px] md:min-h-[140px]">
                                                            <button 
                                                                onClick={() => {
                                                                    const idx = CHARACTERS.findIndex(c => c.id === selectedChar);
                                                                    const newIdx = idx <= 0 ? CHARACTERS.length - 1 : idx - 1;
                                                                    setSelectedChar(CHARACTERS[newIdx].id);
                                                                    SoundManager.playUIClick();
                                                                }}
                                                                className="p-1.5 md:p-2 bg-[#0b0416]/80 border border-cyan-500/30 rounded-full hover:border-cyan-400 hover:bg-cyan-500/20 text-cyan-100 transition-all z-10 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                                                            >
                                                                <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
                                                            </button>
                                                            
                                                            <div className="text-left z-10 flex-1 px-2 md:px-4 flex flex-col items-start">
                                                                {(() => {
                                                                    const charKills = save.characterKills?.[char.id] || 0;
                                                                    const mastery = getCharacterMastery(charKills);
                                                                    return (
                                                                        <>
                                                                            <h4 className="text-lg md:text-xl font-bold mb-0.5 flex flex-wrap items-center gap-2" style={{ color: char.color, textShadow: `0 0 10px ${char.color}80` }}>
                                                                                {char.name}
                                                                                <span className="text-xs bg-slate-900/80 px-2 py-1 rounded-full border border-slate-700 font-mono tracking-normal flex items-center gap-1" style={{ textShadow: 'none', color: '#fff' }} title={mastery.current.bonusDesc !== 'None' ? `Mastery Bonus: ${mastery.current.bonusDesc}` : 'No Mastery Bonus'}>
                                                                                    {mastery.current.badge} {mastery.current.title}
                                                                                </span>
                                                                            </h4>
                                                                            <div className="text-[10px] text-slate-400 mb-1.5 font-mono">
                                                                                Kills: <span className="text-white">{charKills.toLocaleString()}</span> {mastery.next ? <span className="text-slate-500">/ {mastery.next.killsRequired.toLocaleString()} for {mastery.next.title} ({mastery.next.bonusDesc})</span> : <span className="text-yellow-400">(MAX)</span>}
                                                                            </div>
                                                                        </>
                                                                    );
                                                                })()}
                                                                <div className="flex gap-2 mb-2 w-full pr-4 relative z-20">
                                                                    <button onClick={(e) => { e.stopPropagation(); setCharTab('loadout'); SoundManager.playUIClick(); }} className={`text-[10px] font-bold px-3 py-1.5 rounded border transition-colors ${charTab === 'loadout' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50' : 'bg-slate-800/50 text-slate-400 border-slate-700/50'}`}>LOADOUT</button>
                                                                    <button onClick={(e) => { e.stopPropagation(); setCharTab('cosmetics'); SoundManager.playUIClick(); }} className={`text-[10px] font-bold px-3 py-1.5 rounded border transition-colors ${charTab === 'cosmetics' ? 'bg-pink-500/20 text-pink-300 border-pink-500/50' : 'bg-slate-800/50 text-slate-400 border-slate-700/50'}`}>COSMETICS</button>
                                                                </div>
                                                                {charTab === 'loadout' ? (
                                                                    <>
                                                                        <p className="text-[10px] md:text-xs text-slate-300 mb-1 max-w-[80%] leading-tight">
                                                                            {char.desc}
                                                                        </p>
                                                                        <CharacterStatPills char={char} baseline={CHARACTERS[0]} />
                                                                    </>
                                                                ) : (
                                                                    <div className="w-full pr-4 flex flex-col gap-2 relative z-50">
                                                                        <div className="h-[60px] md:h-[80px] w-full rounded-md overflow-hidden border border-pink-500/30 shrink-0 shadow-[0_0_15px_rgba(217,70,239,0.2)]">
                                                                            <CosmeticPreview 
                                                                                trailId={save.cosmetics?.trail || 'default'} 
                                                                                killEffectId={save.cosmetics?.killEffect || 'none'}
                                                                                playerColor={SKIN_COSMETICS.find(s => s.id === (save.cosmetics?.skins?.[char.id] || `${char.id}_default`))?.color || char.color}
                                                                                charId={char.id}
                                                                            />
                                                                        </div>
                                                                        <select
                                                                            value={save.cosmetics?.skins?.[char.id] || `${char.id}_default`}
                                                                            onChange={(e) => {
                                                                                SoundManager.playUIClick();
                                                                                const newSave = { ...save, cosmetics: { ...save.cosmetics, skins: { ...(save.cosmetics?.skins || {}), [char.id]: e.target.value } } };
                                                                                SaveManager.save(newSave);
                                                                                setSave(newSave);
                                                                            }}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className="w-full bg-[#0b0416]/90 text-white text-xs border border-pink-500/50 rounded p-1 outline-none focus:border-pink-400"
                                                                        >
                                                                            <option disabled>-- Select Skin --</option>
                                                                            {SKIN_COSMETICS.filter(s => s.charId === char.id).map(s => {
                                                                                                                 const unlockedSkins = save?.unlockedCosmetics ?? ['default'];
                                                                                                                 const isOwned = s.goldCost === 0 || (Array.isArray(unlockedSkins) && unlockedSkins.includes(s.id));
                                                                                if (!isOwned) return null;
                                                                                return <option key={s.id} value={s.id}>{s.icon} {s.name}</option>;
                                                                            })}
                                                                        </select>
                                                                        
                                                                        <select
                                                                            value={save.cosmetics?.trail || 'default'}
                                                                            onChange={(e) => {
                                                                                SoundManager.playUIClick();
                                                                                const newSave = { ...save, cosmetics: { ...save.cosmetics, trail: e.target.value } };
                                                                                SaveManager.save(newSave);
                                                                                setSave(newSave);
                                                                            }}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className="w-full bg-[#0b0416]/90 text-white text-xs border border-pink-500/50 rounded p-1 outline-none focus:border-pink-400"
                                                                        >
                                                                            <option disabled>-- Select Trail --</option>
                                                                            {TRAIL_COSMETICS.map(t => {
                                                                                 const unlockedTrails = save?.unlockedCosmetics ?? ['default'];
                                                                                 const isOwned = Array.isArray(unlockedTrails) && unlockedTrails.includes(t.id);
                                                                                if (!isOwned) return null;
                                                                                return <option key={t.id} value={t.id}>{t.icon} {t.name}</option>;
                                                                            })}
                                                                        </select>
                                                                    </div>
                                                                )}
                                                                
                                                                {!isUnlocked && (
                                                                    <div className="px-3 py-1 rounded font-bold text-xs bg-[#0b0416]/50 text-slate-400 border border-slate-700/50 mt-1 inline-flex items-center gap-1.5 w-fit">
                                                                        🎯 Own NFT or Reach Kill Milestones
                                                                    </div>
                                                                )}
                                                                {isUnlocked && (
                                                                    <span className="inline-flex items-center gap-1 text-cyan-300 font-black tracking-widest text-[10px] bg-cyan-950/60 px-2 py-1 rounded border border-cyan-500/50 backdrop-blur-sm mt-1 shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                                                                        ✓ UNLOCKED
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <button 
                                                                onClick={() => {
                                                                    const idx = CHARACTERS.findIndex(c => c.id === selectedChar);
                                                                    const newIdx = idx >= CHARACTERS.length - 1 ? 0 : idx + 1;
                                                                    setSelectedChar(CHARACTERS[newIdx].id);
                                                                    SoundManager.playUIClick();
                                                                }}
                                                                className="p-2 bg-slate-900/80 rounded-full hover:bg-slate-700 text-white transition-colors z-10"
                                                            >
                                                                <ChevronRight className="w-6 h-6" />
                                                            </button>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                        </div>

                                        <div>
                                        <div className="flex items-center justify-between mb-1.5 md:mb-2 gap-2">
                                            <h3 className="text-xs md:text-sm text-slate-400">Select Sector</h3>
                                            {/* Inner / Outer Galaxy tab buttons. Outer gets a violet glow when active
                                                + a ★ NEW badge until the selected character unlocks any S11+ sector. */}
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => switchGalaxyTab('inner')}
                                                    className={`text-[9px] md:text-[10px] font-bold px-2 md:px-3 py-1 md:py-1.5 rounded border transition-colors ${
                                                        galaxyTab === 'inner'
                                                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                                                            : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:text-slate-200'
                                                    }`}
                                                >
                                                    INNER
                                                </button>
                                                <button
                                                    onClick={() => switchGalaxyTab('outer')}
                                                    className={`text-[9px] md:text-[10px] font-bold px-2 md:px-3 py-1 md:py-1.5 rounded border transition-all relative ${
                                                        galaxyTab === 'outer'
                                                            ? 'bg-violet-500/20 text-violet-300 border-violet-500/50 shadow-[0_0_12px_rgba(139,92,246,0.4)]'
                                                            : 'bg-slate-800/50 text-slate-400 border-slate-700/50 hover:text-slate-200'
                                                    }`}
                                                >
                                                    OUTER
                                                    {showOuterNewBadge && (
                                                        <span className="ml-1 inline-block text-[7px] md:text-[8px] bg-fuchsia-500 text-white px-1 py-px rounded font-black align-middle">★ NEW</span>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                        <div 
                                            className={`relative bg-[#0b0416]/80 backdrop-blur-xl rounded-lg md:rounded-xl border overflow-hidden select-none touch-pan-y transition-colors ${
                                                galaxyTab === 'outer'
                                                    ? 'border-violet-500/50 hover:border-violet-400 shadow-[0_0_20px_rgba(139,92,246,0.25)]'
                                                    : 'border-cyan-500/50 hover:border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.2)]'
                                            }`}
                                            onTouchStart={(e) => {
                                                touchStartX.current = e.changedTouches[0].screenX;
                                            }}
                                            onTouchEnd={(e) => {
                                                if (touchStartX.current === null) return;
                                                const touchEndX = e.changedTouches[0].screenX;
                                                const diff = touchStartX.current - touchEndX;
                                                if (diff > 50) {
                                                    const idx = visibleSectorArenas.findIndex(a => a.id === selectedArena);
                                                    setSelectedArena(visibleSectorArenas[idx >= visibleSectorArenas.length - 1 ? 0 : idx + 1].id);
                                                    SoundManager.playUIClick();
                                                } else if (diff < -50) {
                                                    const idx = visibleSectorArenas.findIndex(a => a.id === selectedArena);
                                                    setSelectedArena(visibleSectorArenas[idx <= 0 ? visibleSectorArenas.length - 1 : idx - 1].id);
                                                    SoundManager.playUIClick();
                                                }
                                                touchStartX.current = null;
                                            }}
                                        >
                                            <div 
                                                className="absolute inset-0 opacity-40 bg-cover bg-center transition-all duration-500"
                                                style={{ backgroundImage: `url(${visibleSectorArenas.find(a => a.id === selectedArena)?.image})` }}
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0416] via-[#0b0416]/70 to-transparent pointer-events-none" />
                                            
                                            <div className="relative flex items-center justify-between p-2 md:p-3 min-h-[72px] md:min-h-[96px]">
                                                <button 
                                                    onClick={() => {
                                                        const idx = visibleSectorArenas.findIndex(a => a.id === selectedArena);
                                                        const newIdx = idx <= 0 ? visibleSectorArenas.length - 1 : idx - 1;
                                                        setSelectedArena(visibleSectorArenas[newIdx].id);
                                                        SoundManager.playUIClick();
                                                    }}
                                                    className="p-1.5 md:p-2 bg-[#0b0416]/80 border border-cyan-500/30 rounded-full hover:border-cyan-400 hover:bg-cyan-500/20 text-cyan-100 transition-all z-10 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                                                >
                                                    <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
                                                </button>
                                                
                                                <div className="text-center z-10 flex-1 px-2 md:px-4">
                                                    <h4 className="text-lg md:text-xl font-bold text-white mb-0.5 md:mb-1 drop-shadow-md">
                                                        {visibleSectorArenas.find(a => a.id === selectedArena)?.name}
                                                    </h4>
                                                    {!((save?.unlockedArenasByCharacter?.[selectedChar] || ['station']).includes(selectedArena)) ? (
                                                        <span className="inline-flex items-center gap-1 text-rose-300 font-black tracking-widest text-[9px] md:text-[10px] bg-rose-950/60 px-1.5 py-0.5 md:px-2 md:py-1 rounded border border-rose-500/50 backdrop-blur-sm shadow-[0_0_10px_rgba(244,63,94,0.2)]">
                                                            🔒 LOCKED
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-cyan-300 font-black tracking-widest text-[9px] md:text-[10px] bg-cyan-950/60 px-1.5 py-0.5 md:px-2 md:py-1 rounded border border-cyan-500/50 backdrop-blur-sm shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                                                            ✓ UNLOCKED
                                                        </span>
                                                    )}
                                                </div>

                                                <button 
                                                    onClick={() => {
                                                        const idx = visibleSectorArenas.findIndex(a => a.id === selectedArena);
                                                        const newIdx = idx >= visibleSectorArenas.length - 1 ? 0 : idx + 1;
                                                        setSelectedArena(visibleSectorArenas[newIdx].id);
                                                        SoundManager.playUIClick();
                                                    }}
                                                    className="p-1.5 md:p-2 bg-[#0b0416]/80 border border-cyan-500/30 rounded-full hover:border-cyan-400 hover:bg-cyan-500/20 text-cyan-100 transition-all z-10 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                                                >
                                                    <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
                                                </button>
                                            </div>
                                        </div>
                                        </div>

                                        <div>
                                        <h3 className="text-xs md:text-sm text-slate-400 mb-1.5 md:mb-2">Cosmic Difficulty</h3>
                                        {(() => {
                                            const diffColors = {
                                                normal: { border: 'border-cyan-400', text: 'text-cyan-400', shadow: 'shadow-[0_0_15px_rgba(34,211,238,0.4)]' },
                                                hard: { border: 'border-pink-500', text: 'text-pink-400', shadow: 'shadow-[0_0_15px_rgba(236,72,153,0.4)]' },
                                                cosmic: { border: 'border-violet-500', text: 'text-violet-400', shadow: 'shadow-[0_0_15px_rgba(139,92,246,0.5)]' }
                                            };
                                            const currentColors = diffColors[selectedDifficulty] || diffColors.normal;
                                            return (
                                        <div 
                                            className={`relative bg-[#0b0416]/80 backdrop-blur-xl rounded-lg md:rounded-xl border ${currentColors.border} overflow-hidden ${currentColors.shadow} select-none touch-pan-y transition-all duration-300`}
                                            onTouchStart={(e) => {
                                                touchStartX.current = e.changedTouches[0].screenX;
                                            }}
                                            onTouchEnd={(e) => {
                                                if (touchStartX.current === null) return;
                                                const touchEndX = e.changedTouches[0].screenX;
                                                const diff = touchStartX.current - touchEndX;
                                                if (diff > 50) {
                                                    const idx = DIFFICULTIES.findIndex(d => d.id === selectedDifficulty);
                                                    setSelectedDifficulty(DIFFICULTIES[idx >= DIFFICULTIES.length - 1 ? 0 : idx + 1].id);
                                                    SoundManager.playUIClick();
                                                } else if (diff < -50) {
                                                    const idx = DIFFICULTIES.findIndex(d => d.id === selectedDifficulty);
                                                    setSelectedDifficulty(DIFFICULTIES[idx <= 0 ? DIFFICULTIES.length - 1 : idx - 1].id);
                                                    SoundManager.playUIClick();
                                                }
                                                touchStartX.current = null;
                                            }}
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-t from-[#0b0416] via-[#0b0416]/70 to-transparent pointer-events-none" />
                                            
                                            <div className="relative flex items-center justify-between p-2 md:p-3 min-h-[72px] md:min-h-[96px]">
                                                <button 
                                                    onClick={() => {
                                                        const idx = DIFFICULTIES.findIndex(d => d.id === selectedDifficulty);
                                                        const newIdx = idx <= 0 ? DIFFICULTIES.length - 1 : idx - 1;
                                                        setSelectedDifficulty(DIFFICULTIES[newIdx].id);
                                                        SoundManager.playUIClick();
                                                    }}
                                                    className="p-1.5 md:p-2 bg-[#0b0416]/80 border border-cyan-500/30 rounded-full hover:border-cyan-400 hover:bg-cyan-500/20 text-cyan-100 transition-all z-10 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                                                >
                                                    <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
                                                </button>
                                                
                                                <div className="text-center z-10 flex-1 px-2 md:px-4">
                                                    <h4 className={`text-lg md:text-xl font-bold ${currentColors.text} mb-0.5 md:mb-1 drop-shadow-md transition-colors duration-300`}>
                                                        {DIFFICULTIES.find(d => d.id === selectedDifficulty)?.name}
                                                    </h4>
                                                    <p className="text-[10px] md:text-xs text-slate-300">
                                                        {DIFFICULTIES.find(d => d.id === selectedDifficulty)?.desc}
                                                    </p>
                                                </div>

                                                <button 
                                                    onClick={() => {
                                                        const idx = DIFFICULTIES.findIndex(d => d.id === selectedDifficulty);
                                                        const newIdx = idx >= DIFFICULTIES.length - 1 ? 0 : idx + 1;
                                                        setSelectedDifficulty(DIFFICULTIES[newIdx].id);
                                                        SoundManager.playUIClick();
                                                    }}
                                                    className="p-1.5 md:p-2 bg-[#0b0416]/80 border border-cyan-500/30 rounded-full hover:border-cyan-400 hover:bg-cyan-500/20 text-cyan-100 transition-all z-10 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                                                >
                                                    <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
                                                </button>
                                            </div>
                                        </div>
                                        );
                                        })()}
                                        </div>
                                    </div>
                                </div>

                                {(() => {
                                    const isCharUnlocked = effectiveUnlockedCharacters.includes(selectedChar);
                                    const isArenaUnlocked = (save?.unlockedArenasByCharacter?.[selectedChar] || ['station']).includes(selectedArena);
                                    const canLaunch = isCharUnlocked && isArenaUnlocked;
                                    
                                    const sessionBuffs = save.sessionBuffs || {};
                                    const hasXpBuff = sessionBuffs.xpExpiry > currentTime;
                                    
                                    const formatTimeLeft = (ms) => {
                                        const totalSeconds = Math.floor(ms / 1000);
                                        const mins = Math.floor(totalSeconds / 60);
                                        const secs = totalSeconds % 60;
                                        return `${mins}:${secs.toString().padStart(2, '0')}`;
                                    };
                                    
                                    const timeLeft = hasXpBuff ? formatTimeLeft(sessionBuffs.xpExpiry - currentTime) : '';
                                    
                                    const buyBuff = () => {
                                        if (omenxBlocked) return;
                                        if ((omenxBalance ?? 0) < 10) return;
                                        if (hasXpBuff || buffPurchasing) return; // prevent double-buy while one is in flight or already active
                                        SoundManager.playUIClick();
                                        confirmBuffPurchase(10, '+50% XP Buff (60 min)', async () => {
                                            // Re-check inside the async callback — guards against double-tap
                                            // on the confirm modal queuing two purchases (Texxy bug 2026-05-03).
                                            if (buffPurchasing) return;
                                            setBuffPurchasing(true);
                                            try {
                                                // Server-authoritative: purchaseSku grants the buff using the
                                                // server clock and rejects if one is already active. Client
                                                // never sets xpExpiry directly anymore.
                                                const res = await base44.functions.invoke('purchaseSku', {
                                                    skuId: IN_GAME_SKUS.xpSession,
                                                    quantity: 1,
                                                    grantInfo: { type: 'xp_buff' },
                                                });
                                                if (!res.data?.success) {
                                                    toast({ title: 'Purchase Failed', description: res.data?.error || 'Try again.' });
                                                    return;
                                                }
                                                // Adopt server-returned saveData (authoritative xpExpiry from server clock)
                                                if (res.data.saveData) {
                                                    const merged = { ...SaveManager.load(), ...res.data.saveData };
                                                    SaveManager.save(merged);
                                                    setSave(merged);
                                                }
                                                refreshBalance();
                                                toast({ title: "Buff Activated", description: `+50% XP for 60 minutes!` });
                                            } catch (err) {
                                                // base44.functions.invoke throws on non-2xx responses (e.g. 400 "buff already active",
                                                // 401, 500). Without this catch the error was silent — toast never showed and the
                                                // button just snapped back to "Buy" with no feedback (Anubis bug 2026-05-05).
                                                const serverMsg = err?.response?.data?.error || err?.data?.error || err?.message || 'Try again.';
                                                console.error('[XP Buff] purchase failed:', serverMsg, err);
                                                toast({ title: 'Purchase Failed', description: serverMsg });
                                            } finally {
                                                setBuffPurchasing(false);
                                            }
                                        });
                                    };
                                    
                                    return (
                                        <div className="flex flex-col gap-2 md:gap-3 mt-2 md:mt-6 pt-2 md:pt-4 border-t border-slate-700/40">

                                            <BuildSummary save={save} selectedChar={selectedChar} currentTime={currentTime} />

                                            {/* S8 Sandbox — self-gates to S8+ (returns null pre-S8, no visual space taken). */}
                                            <SandboxHubCard
                                                selectedChar={selectedChar}
                                                selectedArena={selectedArena}
                                                selectedDifficulty={selectedDifficulty}
                                                selectedWeapon={selectedWeapon}
                                            />

                                            <button
                                                onClick={() => { SoundManager.playUIClick(); navigate('/loadouts'); }}
                                                className="relative bg-[#0b0416]/80 backdrop-blur-xl rounded-lg md:rounded-xl border border-cyan-500/50 hover:border-cyan-400 overflow-hidden shadow-[0_0_15px_rgba(6,182,212,0.15)] hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all group"
                                                title="Save & swap full configurations"
                                            >
                                                <div className="relative flex items-center justify-between p-2 md:p-3 min-h-[72px] md:min-h-[96px]">
                                                    <span className="flex items-center gap-2 md:gap-3 z-10">
                                                        <span className="text-xl md:text-2xl">💾</span>
                                                        <span className="flex flex-col items-start">
                                                            <span className="text-sm md:text-lg font-black tracking-widest uppercase text-white group-hover:text-cyan-200 transition-colors">
                                                                Loadout Presets
                                                            </span>
                                                            <span className="text-[10px] md:text-xs text-slate-400 group-hover:text-slate-300 font-normal normal-case tracking-normal">
                                                                Save & swap full configurations
                                                            </span>
                                                        </span>
                                                    </span>
                                                    <span className="text-cyan-300 text-lg md:text-xl font-black group-hover:translate-x-1 transition-transform z-10">→</span>
                                                </div>
                                            </button>

                                            <button
                                                onClick={buyBuff}
                                                disabled={hasXpBuff || buffPurchasing || (omenxBalance ?? 0) < 10 || omenxBlocked}
                                                title={omenxBlocked ? (omenxBlockedMsg || 'OMENX purchases are temporarily disabled.') : undefined}
                                                className={`w-full flex items-center justify-between gap-2 md:gap-3 rounded-lg md:rounded-xl px-3 md:px-4 py-2 md:py-2.5 border transition-all group ${
                                                    omenxBlocked
                                                        ? 'bg-slate-900/60 border-slate-700 opacity-60 cursor-not-allowed'
                                                        : hasXpBuff
                                                            ? 'bg-emerald-950/60 border-emerald-500/60 cursor-default'
                                                            : (omenxBalance ?? 0) < 10 || buffPurchasing
                                                                ? 'bg-slate-900/60 border-slate-700 opacity-60 cursor-not-allowed'
                                                                : 'bg-gradient-to-r from-emerald-950/40 via-cyan-950/30 to-purple-950/40 hover:from-emerald-900/60 hover:via-cyan-900/40 hover:to-purple-900/60 border-emerald-500/40 hover:border-emerald-400'
                                                }`}
                                            >
                                                <span className="flex items-center gap-2 md:gap-3">
                                                    <span className="text-base md:text-lg">{omenxBlocked ? '🔒' : '✨'}</span>
                                                    <span className="flex flex-col items-start">
                                                        <span className="text-[11px] md:text-sm font-black tracking-widest uppercase text-white">
                                                            {omenxBlocked ? '+50% XP Buff — Paused' : hasXpBuff ? `+50% XP Active (${timeLeft})` : '+50% XP Buff · 60 min'}
                                                        </span>
                                                        <span className="text-[9px] md:text-[11px] text-emerald-300/70 font-normal normal-case tracking-normal hidden sm:inline">
                                                            {omenxBlocked ? 'OMENX purchases temporarily disabled' : 'Boost XP gain for your next session'}
                                                        </span>
                                                    </span>
                                                </span>
                                                {!omenxBlocked && !hasXpBuff && !buffPurchasing && (
                                                    <span className="flex items-center gap-1 bg-purple-950/60 border border-purple-500/50 px-2 md:px-2.5 py-1 md:py-1.5 rounded shrink-0">
                                                        <span className="text-purple-300 font-black text-xs md:text-sm">10</span>
                                                        <span className="text-purple-400 font-bold text-[9px] md:text-[10px] tracking-wider">OMENX</span>
                                                    </span>
                                                )}
                                                {!omenxBlocked && buffPurchasing && (
                                                    <span className="text-slate-400 text-xs md:text-sm font-bold">Processing…</span>
                                                )}
                                            </button>

                                            <div className="flex flex-row gap-1.5 md:gap-3 sticky bottom-2 md:static z-30 bg-[#0b0416]/95 md:bg-transparent backdrop-blur-md md:backdrop-blur-none p-2 md:p-0 -mx-2 md:mx-0 rounded-xl md:rounded-none border border-cyan-500/30 md:border-0 shadow-[0_-4px_20px_rgba(0,0,0,0.6)] md:shadow-none">
                                            <button
                                                onClick={() => canLaunch && checkAndLaunch('normal')}
                                                disabled={!canLaunch}
                                                className={`flex-1 text-white text-sm md:text-xl font-black py-3.5 md:py-5 rounded-lg md:rounded-xl flex items-center justify-center gap-2 transition-all transform tracking-widest uppercase ${
                                                    canLaunch
                                                    ? 'bg-gradient-to-r from-[#0CA7B8] to-cyan-400 hover:from-cyan-400 hover:to-[#0CA7B8] hover:scale-[1.02] active:scale-95 shadow-[0_0_30px_rgba(12,167,184,0.5),inset_0_1px_0_rgba(255,255,255,0.2)]'
                                                    : 'bg-slate-800/60 text-slate-600 cursor-not-allowed border border-slate-700/50'
                                                }`}
                                            >
                                                {!isCharUnlocked ? (
                                                    <>LOCKED</>
                                                ) : !isArenaUnlocked ? (
                                                    <>LOCKED</>
                                                ) : (
                                                    <>LAUNCH <ArrowRight className="w-5 h-5 md:w-5 md:h-5" /></>
                                                )}
                                            </button>
                                            
                                            <div className="flex-1 flex flex-col gap-0.5">
                                                <button
                                                    onClick={() => canLaunch && checkAndLaunch('endless')}
                                                    disabled={!canLaunch}
                                                    className={`w-full text-white text-sm md:text-xl font-black py-3.5 md:py-5 rounded-lg md:rounded-xl flex items-center justify-center gap-2 transition-all transform tracking-widest uppercase ${
                                                        canLaunch
                                                        ? 'bg-gradient-to-r from-[#D946EF] to-fuchsia-400 hover:from-fuchsia-400 hover:to-[#D946EF] hover:scale-[1.02] active:scale-95 shadow-[0_0_30px_rgba(217,70,239,0.5),inset_0_1px_0_rgba(255,255,255,0.2)]'
                                                        : 'bg-slate-800/60 text-slate-600 cursor-not-allowed border border-slate-700/50'
                                                    }`}
                                                >
                                                    {!isCharUnlocked ? (
                                                        <>LOCKED</>
                                                    ) : !isArenaUnlocked ? (
                                                        <>LOCKED</>
                                                    ) : (
                                                        <>ENDLESS <ArrowRight className="w-5 h-5 md:w-5 md:h-5" /></>
                                                    )}
                                                </button>
                                                {canLaunch && (
                                                    <div className="text-[8px] md:text-[10px] text-fuchsia-300/70 text-center tracking-wider uppercase font-bold leading-tight hidden md:block">
                                                        {isS6OrLater() ? 'Score, Mastery & Uncapped Rewards' : 'Score & Mastery — Gold capped (~720/min, 10k max)'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        </div>
                                    );
                                })()}
                            </div>
                    </div>

                </div>
            </div>
            {buffPending && (
                <OmenXConfirmation
                    amount={buffPending.amount}
                    itemName={buffPending.itemName}
                    onConfirm={buffPending.onConfirm}
                    onCancel={buffPending.onCancel}
                    pageId="hub-xp-buff"
                />
            )}
        </div>
      </OmenXGate>
    );
}