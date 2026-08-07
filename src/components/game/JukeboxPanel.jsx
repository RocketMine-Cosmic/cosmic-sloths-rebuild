import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SkipBack, SkipForward, Volume2, VolumeX, CheckSquare, Square, Music } from 'lucide-react';
import { SoundManager } from '../../game/SoundManager';
import { MUSIC_TRACKS } from '../../game/MusicTracks';
import JukeboxTrackRow from './JukeboxTrackRow';
import SfxCategoryToggles from './SfxCategoryToggles';

export default function JukeboxPanel() {
    const [, setTick] = useState(0);
    const [bgmVol, setBgmVol] = useState(SoundManager.bgm.volume);
    const [isMuted, setIsMuted] = useState(SoundManager.isMuted());
    const [isPaused, setIsPaused] = useState(SoundManager.bgm.paused);
    const [durations, setDurations] = useState({});

    // Load each track's duration once via a metadata-only fetch (no playback).
    useEffect(() => {
        const audios = [];
        MUSIC_TRACKS.forEach(track => {
            const a = new Audio();
            a.preload = 'metadata';
            a.src = track.url;
            const onLoaded = () => {
                setDurations(d => ({ ...d, [track.id]: a.duration }));
            };
            a.addEventListener('loadedmetadata', onLoaded);
            audios.push({ a, onLoaded });
        });
        return () => audios.forEach(({ a, onLoaded }) => {
            a.removeEventListener('loadedmetadata', onLoaded);
            a.src = '';
        });
    }, []);

    // Force re-render on jukebox state changes (track changed, toggles flipped, etc.)
    useEffect(() => {
        const unsub = SoundManager.subscribe(() => setTick(t => t + 1));
        const onPlay = () => setIsPaused(false);
        const onPause = () => setIsPaused(true);
        SoundManager.bgm.addEventListener('play', onPlay);
        SoundManager.bgm.addEventListener('pause', onPause);
        return () => {
            unsub();
            SoundManager.bgm.removeEventListener('play', onPlay);
            SoundManager.bgm.removeEventListener('pause', onPause);
        };
    }, []);

    const currentTrack = SoundManager.getCurrentTrack();
    const currentId = currentTrack?.id;

    const handlePlayTrack = (id) => {
        if (currentId === id && !SoundManager.bgm.paused) {
            SoundManager.bgm.pause();
        } else if (currentId === id && SoundManager.bgm.paused) {
            SoundManager.playBGM();
        } else {
            SoundManager.playTrack(id);
        }
    };

    const handleVolume = (e) => {
        const v = parseFloat(e.target.value);
        setBgmVol(v);
        SoundManager.setBgmVolume(v);
    };

    const handleToggleMute = () => {
        SoundManager.toggleMute();
        setIsMuted(SoundManager.isMuted());
    };

    const handleToggleAll = (context) => {
        const allEnabled = MUSIC_TRACKS.every(t => SoundManager.isTrackEnabled(t.id, context));
        if (allEnabled) SoundManager.disableAll(context);
        else SoundManager.enableAll(context);
    };

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-[#0b0416]/80 backdrop-blur-xl border border-fuchsia-500/30 shadow-[0_0_30px_rgba(217,70,239,0.2)] rounded-2xl p-4 md:p-6"
        >
            {/* Now Playing display */}
            <div className="bg-gradient-to-r from-fuchsia-950/50 via-purple-950/50 to-cyan-950/50 border border-fuchsia-500/40 rounded-xl p-4 md:p-5 mb-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-fuchsia-500/5 to-transparent animate-pulse pointer-events-none" />
                <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4 relative z-10">
                    <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-gradient-to-br from-fuchsia-600 to-purple-700 border-2 border-fuchsia-400 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(217,70,239,0.5)]">
                        <Music className={`w-6 h-6 md:w-7 md:h-7 text-white ${isPaused ? '' : 'animate-pulse'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-bold tracking-widest text-fuchsia-400 uppercase mb-0.5">Now Playing</div>
                        <div className="text-lg md:text-2xl font-black text-white truncate">
                            {currentTrack ? currentTrack.name : '— Silence —'}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                            {SoundManager.context === 'game' ? '🎮 In-Game Playlist' : '🚀 Menu Playlist'} · {SoundManager.getActivePlaylistTracks().length} track{SoundManager.getActivePlaylistTracks().length === 1 ? '' : 's'}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => SoundManager.playPrev()}
                            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-cyan-300 hover:text-white transition-colors"
                            title="Previous track"
                        >
                            <SkipBack className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => SoundManager.playNext()}
                            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-cyan-300 hover:text-white transition-colors"
                            title="Next track"
                        >
                            <SkipForward className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleToggleMute}
                            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-cyan-300 hover:text-white transition-colors"
                            title={isMuted ? 'Unmute' : 'Mute'}
                        >
                            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                {/* Volume slider */}
                <div className={`mt-4 ${isMuted ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="flex items-center gap-3">
                        <Volume2 className="w-3 h-3 text-slate-400" />
                        <input
                            type="range"
                            min="0" max="1" step="0.01"
                            value={bgmVol}
                            onChange={handleVolume}
                            disabled={isMuted}
                            className="flex-1 accent-fuchsia-500"
                        />
                        <span className="text-xs font-mono text-slate-300 w-10 text-right">{Math.round(bgmVol * 100)}%</span>
                    </div>
                </div>
            </div>

            {/* SFX category toggles */}
            <SfxCategoryToggles />

            {/* Bulk-toggle helper buttons */}
            <div className="flex flex-wrap gap-2 mb-4 text-xs">
                <button
                    onClick={() => handleToggleAll('menu')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-fuchsia-950/40 hover:bg-fuchsia-900/50 border border-fuchsia-500/40 text-fuchsia-300 rounded-lg font-bold tracking-wider uppercase transition-colors"
                >
                    {MUSIC_TRACKS.every(t => SoundManager.isTrackEnabled(t.id, 'menu')) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                    Menu Playlist
                </button>
                <button
                    onClick={() => handleToggleAll('game')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-950/40 hover:bg-orange-900/50 border border-orange-500/40 text-orange-300 rounded-lg font-bold tracking-wider uppercase transition-colors"
                >
                    {MUSIC_TRACKS.every(t => SoundManager.isTrackEnabled(t.id, 'game')) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                    Game Playlist
                </button>
            </div>

            {/* Track list */}
            <div className="space-y-2">
                {MUSIC_TRACKS.map((track, idx) => (
                    <JukeboxTrackRow
                        key={track.id}
                        track={track}
                        index={idx}
                        duration={durations[track.id]}
                        isPlaying={currentId === track.id}
                        isPaused={isPaused}
                        menuEnabled={SoundManager.isTrackEnabled(track.id, 'menu')}
                        gameEnabled={SoundManager.isTrackEnabled(track.id, 'game')}
                        onPlay={() => handlePlayTrack(track.id)}
                        onToggleMenu={() => SoundManager.setTrackEnabled(track.id, 'menu', !SoundManager.isTrackEnabled(track.id, 'menu'))}
                        onToggleGame={() => SoundManager.setTrackEnabled(track.id, 'game', !SoundManager.isTrackEnabled(track.id, 'game'))}
                    />
                ))}
            </div>

            <div className="mt-5 text-[10px] text-slate-500 text-center tracking-wider uppercase">
                Toggle <span className="text-fuchsia-400">Menu</span> / <span className="text-orange-400">Game</span> to curate which tracks play in each context.
            </div>
        </motion.div>
    );
}