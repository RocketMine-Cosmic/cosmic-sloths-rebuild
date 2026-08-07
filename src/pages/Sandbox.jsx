import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, FlaskConical, AlertTriangle, Infinity as InfinityIcon, Clock } from 'lucide-react';
import SpaceBackground from '../components/game/SpaceBackground';
import { CHARACTERS, ARENAS, DIFFICULTIES } from '../game/Constants';
import { SoundManager } from '../game/SoundManager';
import { SaveManager } from '../game/SaveManager';
import { isS8OrLater } from '@/lib/seasonGate';

// S8 Sandbox / Test Play — dedicated setup page per docs/s8/PLAN_SANDBOX_TEST_PLAY.md.
// Redesigned to match the Hub's HUD aesthetic: arena backdrops, character
// portrait, glow-treated pickers, mission-briefing header. Same launch flow.

const SANDBOX_ARENA_BLOCKLIST = new Set(['quantum_meteor', 'world_boss_arena']);
const SECTOR_OPTIONS = ARENAS.filter(a => !SANDBOX_ARENA_BLOCKLIST.has(a.id));
const ENDLESS_OPTION = { id: '__endless__', name: 'Endless (Cosmic Void)', image: SECTOR_OPTIONS[0]?.image, endless: true };
const ALL_ARENA_OPTIONS = [...SECTOR_OPTIONS, ENDLESS_OPTION];

const STARTING_LEVELS = [1, 5, 10, 15, 20, 30];

// Difficulty tint palette — mirrors Hub.jsx so difficulty pickers feel unified.
const DIFF_COLORS = {
    easy:   { border: 'border-emerald-400/60', ring: 'shadow-[0_0_20px_rgba(52,211,153,0.35)]', text: 'text-emerald-300' },
    normal: { border: 'border-cyan-400/60',    ring: 'shadow-[0_0_20px_rgba(34,211,238,0.35)]', text: 'text-cyan-300' },
    hard:   { border: 'border-pink-500/60',    ring: 'shadow-[0_0_20px_rgba(236,72,153,0.4)]',  text: 'text-pink-300' },
    cosmic: { border: 'border-violet-500/60',  ring: 'shadow-[0_0_20px_rgba(139,92,246,0.5)]',  text: 'text-violet-300' },
};

export default function Sandbox() {
    const navigate = useNavigate();

    useEffect(() => {
        if (!isS8OrLater()) navigate('/');
    }, [navigate]);

    const initial = (() => {
        try { return JSON.parse(localStorage.getItem('sandbox_setup') || '{}'); } catch { return {}; }
    })();

    const [charId, setCharId] = useState(initial.charId || 'neobyte');
    const [arenaId, setArenaId] = useState(initial.arenaId || 'station');
    const [difficultyId, setDifficultyId] = useState(initial.difficultyId || 'normal');
    const [startLevel, setStartLevel] = useState(initial.startLevel || 1);

    const character = CHARACTERS.find(c => c.id === charId) || CHARACTERS[0];
    const arenaOpt = ALL_ARENA_OPTIONS.find(a => a.id === arenaId) || ALL_ARENA_OPTIONS[0];
    const difficulty = DIFFICULTIES.find(d => d.id === difficultyId) || DIFFICULTIES[1];
    const diffTint = DIFF_COLORS[difficultyId] || DIFF_COLORS.normal;

    const cycle = (list, currentId, dir, setter) => {
        SoundManager.playUIClick();
        const idx = list.findIndex(x => x.id === currentId);
        const next = (idx + dir + list.length) % list.length;
        setter(list[next].id);
    };

    const launch = () => {
        SoundManager.playUIClick();
        try { localStorage.setItem('sandbox_setup', JSON.stringify({ charId, arenaId, difficultyId, startLevel })); } catch {}

        const save = SaveManager.load() || {};
        save.unlockedCharacters = save.unlockedCharacters || ['neobyte'];
        SaveManager.save(save);

        const isEndless = arenaId === ENDLESS_OPTION.id;
        navigate('/game', {
            state: {
                characterId: charId,
                arenaId: isEndless ? 'endless' : arenaId,
                difficultyId,
                isEndless,
                sandbox: true,
                sandboxStartLevel: startLevel,
                forceUnlocked: true,
            },
        });
    };

    return (
        <div className="min-h-screen text-slate-200 p-3 md:p-6 font-sans relative">
            <SpaceBackground />
            <div className="max-w-5xl mx-auto relative z-10">
                {/* Header — matches Hub's "SLOTH COMMAND" style */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-2 md:gap-4 mb-4 md:mb-6 border-b border-yellow-500/30 pb-3 md:pb-4">
                    <div>
                        <button
                            onClick={() => { SoundManager.playUIClick(); navigate('/'); }}
                            className="mb-2 md:mb-3 flex items-center gap-1.5 md:gap-2 text-slate-400 hover:text-white transition-colors font-bold text-xs md:text-sm bg-slate-900 px-2.5 py-1 md:px-3 md:py-1.5 rounded-md md:rounded-lg border border-slate-700 w-fit"
                        >
                            <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" /> Main Menu
                        </button>
                        <h1 className="text-2xl md:text-4xl font-black tracking-widest uppercase flex items-center gap-3" style={{ background: 'linear-gradient(90deg, #facc15, #f59e0b, #facc15)', backgroundSize: '200%', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            <FlaskConical className="w-7 h-7 md:w-9 md:h-9 text-yellow-400" style={{ filter: 'drop-shadow(0 0 8px rgba(234,179,8,0.6))' }} />
                            PRACTICE RANGE
                        </h1>
                        <p className="text-yellow-500/70 mt-0.5 text-[10px] md:text-sm tracking-widest uppercase">⚡ Try Builds · No Rewards · Everything Unlocked</p>
                    </div>
                </header>

                {/* Warning banner */}
                <div className="bg-gradient-to-r from-yellow-950/60 via-amber-950/40 to-yellow-950/60 border-2 border-yellow-600/60 rounded-xl p-3 md:p-4 mb-4 md:mb-6 flex items-start gap-3 shadow-[0_0_25px_rgba(234,179,8,0.15)]">
                    <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 text-yellow-400 shrink-0 mt-0.5" />
                    <div className="text-xs md:text-sm text-yellow-100">
                        <div className="font-black tracking-widest uppercase mb-1 text-yellow-300">Practice Range — No Rewards</div>
                        <div className="text-yellow-200/80 font-normal normal-case leading-relaxed">
                            No score, no leaderboard, no gold, no XP, no kill credit, no achievement or bounty progress. Every character, sector, and difficulty is unlocked. Spawn enemies, grant weapons, and force level-ups from the in-run dev panel <span className="inline-flex items-center gap-1 bg-yellow-900/40 px-1.5 py-0.5 rounded font-black">🔧</span>.
                        </div>
                    </div>
                </div>

                {/* Main briefing panel — Hub-style container */}
                <div className="bg-[#0b0416]/60 backdrop-blur-xl rounded-2xl p-3 md:p-5 border border-yellow-500/30 shadow-[0_0_50px_rgba(234,179,8,0.1),inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <h2 className="text-sm md:text-lg font-bold text-white mb-3 md:mb-4 tracking-widest uppercase flex items-center gap-2">
                        <span className="text-yellow-400">▶</span> Practice Briefing
                    </h2>

                    {/* Character banner — full-bleed portrait, matches Hub */}
                    <div className="mb-3 md:mb-4">
                        <h3 className="text-[10px] md:text-xs text-yellow-300/80 font-black tracking-[0.25em] uppercase mb-1.5 md:mb-2">Select Operative</h3>
                        <div className="relative bg-[#0b0416]/80 backdrop-blur-xl rounded-xl border border-cyan-500/50 overflow-hidden shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                            <div
                                className="absolute inset-0 opacity-80 bg-contain bg-no-repeat"
                                style={{
                                    backgroundImage: character.image ? `url(${character.image})` : 'none',
                                    backgroundPosition: '88% center',
                                    filter: `drop-shadow(0 0 12px ${character.color})`,
                                }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-r from-[#0b0416] via-[#0b0416]/85 to-transparent pointer-events-none" />
                            <div className="relative flex items-center justify-between p-3 md:p-4 min-h-[110px] md:min-h-[140px]">
                                <button
                                    onClick={() => cycle(CHARACTERS, charId, -1, setCharId)}
                                    className="p-1.5 md:p-2 bg-[#0b0416]/80 border border-cyan-500/40 rounded-full hover:border-cyan-400 hover:bg-cyan-500/20 text-cyan-100 transition-all z-10 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                                >
                                    <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
                                </button>
                                <div className="text-left z-10 flex-1 px-3 md:px-4">
                                    <h4 className="text-xl md:text-3xl font-black mb-1" style={{ color: character.color, textShadow: `0 0 12px ${character.color}80` }}>
                                        {character.name}
                                    </h4>
                                    <p className="text-[11px] md:text-sm text-slate-300 max-w-[80%] leading-snug">{character.desc}</p>
                                    <span className="inline-flex items-center gap-1 text-yellow-300 font-black tracking-widest text-[9px] md:text-[10px] bg-yellow-950/60 px-2 py-1 rounded border border-yellow-500/50 backdrop-blur-sm mt-2 shadow-[0_0_10px_rgba(234,179,8,0.2)]">
                                        🎯 PRACTICE · ALL UNLOCKED
                                    </span>
                                </div>
                                <button
                                    onClick={() => cycle(CHARACTERS, charId, 1, setCharId)}
                                    className="p-1.5 md:p-2 bg-[#0b0416]/80 border border-cyan-500/40 rounded-full hover:border-cyan-400 hover:bg-cyan-500/20 text-cyan-100 transition-all z-10 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                                >
                                    <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Sector + Difficulty row — image-backed cards like Hub */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-3 md:mb-4">
                        {/* Sector */}
                        <div>
                            <h3 className="text-[10px] md:text-xs text-fuchsia-300/80 font-black tracking-[0.25em] uppercase mb-1.5 md:mb-2">Select Sector</h3>
                            <div className="relative bg-[#0b0416]/80 backdrop-blur-xl rounded-xl border border-fuchsia-500/50 overflow-hidden shadow-[0_0_20px_rgba(217,70,239,0.15)]">
                                <div
                                    className="absolute inset-0 opacity-50 bg-cover bg-center"
                                    style={{ backgroundImage: `url(${arenaOpt.image})` }}
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0416] via-[#0b0416]/70 to-transparent pointer-events-none" />
                                <div className="relative flex items-center justify-between p-2.5 md:p-3 min-h-[92px] md:min-h-[104px]">
                                    <button
                                        onClick={() => cycle(ALL_ARENA_OPTIONS, arenaId, -1, setArenaId)}
                                        className="p-1.5 md:p-2 bg-[#0b0416]/80 border border-fuchsia-500/40 rounded-full hover:border-fuchsia-400 hover:bg-fuchsia-500/20 text-fuchsia-100 transition-all z-10"
                                    >
                                        <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
                                    </button>
                                    <div className="text-center z-10 flex-1 px-2">
                                        <h4 className="text-lg md:text-2xl font-black text-white mb-1 drop-shadow-md truncate">{arenaOpt.name}</h4>
                                        <div className="inline-flex items-center gap-1.5 text-[10px] md:text-xs text-fuchsia-200 bg-fuchsia-950/50 px-2 py-0.5 rounded border border-fuchsia-500/40">
                                            {arenaOpt.endless
                                                ? <><InfinityIcon className="w-3 h-3" /> Infinite duration</>
                                                : <><Clock className="w-3 h-3" /> {Math.floor((ARENAS.find(a => a.id === arenaId)?.duration || 180) / 60)} min run</>}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => cycle(ALL_ARENA_OPTIONS, arenaId, 1, setArenaId)}
                                        className="p-1.5 md:p-2 bg-[#0b0416]/80 border border-fuchsia-500/40 rounded-full hover:border-fuchsia-400 hover:bg-fuchsia-500/20 text-fuchsia-100 transition-all z-10"
                                    >
                                        <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Difficulty */}
                        <div>
                            <h3 className={`text-[10px] md:text-xs font-black tracking-[0.25em] uppercase mb-1.5 md:mb-2 ${diffTint.text}/80`}>Cosmic Difficulty</h3>
                            <div className={`relative bg-[#0b0416]/80 backdrop-blur-xl rounded-xl border ${diffTint.border} overflow-hidden ${diffTint.ring} transition-all duration-300`}>
                                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0416] via-[#0b0416]/70 to-transparent pointer-events-none" />
                                <div className="relative flex items-center justify-between p-2.5 md:p-3 min-h-[92px] md:min-h-[104px]">
                                    <button
                                        onClick={() => cycle(DIFFICULTIES, difficultyId, -1, setDifficultyId)}
                                        className={`p-1.5 md:p-2 bg-[#0b0416]/80 border ${diffTint.border} rounded-full hover:bg-white/5 transition-all z-10`}
                                    >
                                        <ChevronLeft className={`w-5 h-5 md:w-6 md:h-6 ${diffTint.text}`} />
                                    </button>
                                    <div className="text-center z-10 flex-1 px-2">
                                        <h4 className={`text-lg md:text-2xl font-black mb-1 drop-shadow-md ${diffTint.text}`}>{difficulty.name}</h4>
                                        <p className="text-[10px] md:text-xs text-slate-300 line-clamp-2">{difficulty.desc}</p>
                                    </div>
                                    <button
                                        onClick={() => cycle(DIFFICULTIES, difficultyId, 1, setDifficultyId)}
                                        className={`p-1.5 md:p-2 bg-[#0b0416]/80 border ${diffTint.border} rounded-full hover:bg-white/5 transition-all z-10`}
                                    >
                                        <ChevronRight className={`w-5 h-5 md:w-6 md:h-6 ${diffTint.text}`} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Starting level */}
                    <div>
                        <h3 className="text-[10px] md:text-xs text-amber-300/80 font-black tracking-[0.25em] uppercase mb-1.5 md:mb-2">Starting Level</h3>
                        <div className="relative bg-[#0b0416]/80 backdrop-blur-xl rounded-xl border border-amber-500/50 overflow-hidden shadow-[0_0_20px_rgba(245,158,11,0.12)] p-2.5 md:p-3 min-h-[92px] md:min-h-[104px] flex flex-col justify-center">
                            <div className="flex flex-wrap gap-1.5 md:gap-2">
                                {STARTING_LEVELS.map(lv => (
                                    <button
                                        key={lv}
                                        onClick={() => { SoundManager.playUIClick(); setStartLevel(lv); }}
                                        className={`px-2.5 py-1 md:px-3 md:py-1.5 rounded-lg font-black text-xs md:text-sm transition-all border ${
                                            startLevel === lv
                                                ? 'bg-amber-500/30 text-amber-200 border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)] scale-105'
                                                : 'bg-slate-900/60 text-slate-300 border-slate-700 hover:border-amber-500/50 hover:text-amber-200'
                                        }`}
                                    >
                                        Lv {lv}
                                    </button>
                                ))}
                            </div>
                            <div className="text-[9px] md:text-[11px] text-amber-200/60 mt-1.5 md:mt-2 leading-tight">
                                {startLevel > 1
                                    ? `${startLevel - 1} instant level-ups on spawn — pick your build before mobs arrive.`
                                    : 'Start fresh at level 1.'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Launch button */}
                <button
                    onClick={launch}
                    className="mt-4 md:mt-6 w-full relative group bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:via-yellow-300 hover:to-amber-400 text-slate-950 font-black tracking-[0.3em] uppercase py-4 md:py-5 rounded-xl text-base md:text-2xl flex items-center justify-center gap-3 md:gap-4 shadow-[0_0_30px_rgba(234,179,8,0.5),inset_0_1px_0_rgba(255,255,255,0.3)] hover:shadow-[0_0_50px_rgba(234,179,8,0.8)] hover:scale-[1.01] active:scale-95 transition-all border-2 border-yellow-300/50"
                >
                    <FlaskConical className="w-6 h-6 md:w-7 md:h-7" />
                    Enter Practice Range
                    <ArrowRight className="w-6 h-6 md:w-7 md:h-7 group-hover:translate-x-1 transition-transform" />
                </button>
            </div>
        </div>
    );
}