import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SoundManager } from '../../game/SoundManager';
import { SFXManager } from '../../game/SFXManager';
import { X, Volume2, VolumeX, SkipBack, SkipForward, Play, Pause, Music } from 'lucide-react';

export default function SettingsModal({ onClose }) {
    const [bgmVol, setBgmVol] = useState(SoundManager.bgm.volume);
    const [sfxVol, setSfxVol] = useState(SFXManager.sfxVolume);
    const [isMuted, setIsMuted] = useState(SoundManager.isMuted());
    const [currentTrack, setCurrentTrack] = useState(SoundManager.getCurrentTrack());
    const [isPlaying, setIsPlaying] = useState(!SoundManager.bgm.paused);
    const [sfxCats, setSfxCats] = useState({ ...SFXManager.categories });
    const [lowFx, setLowFx] = useState(() => {
        try { return localStorage.getItem('cosmic_low_fx_mode') === '1'; } catch { return false; }
    });

    const toggleLowFx = () => {
        const next = !lowFx;
        setLowFx(next);
        try { localStorage.setItem('cosmic_low_fx_mode', next ? '1' : '0'); } catch {}
        SFXManager.playUIClick();
    };

    const toggleCat = (cat) => {
        const next = !sfxCats[cat];
        SFXManager.setCategoryEnabled(cat, next);
        setSfxCats({ ...SFXManager.categories });
        if (next) SFXManager.playUIClick();
    };

    const SFX_CATEGORIES = [
        { id: 'weapons', label: 'Weapons' },
        { id: 'pickups', label: 'Pickups' },
        { id: 'enemies', label: 'Enemies' },
        { id: 'player', label: 'Player Hits' },
        { id: 'ui', label: 'UI Clicks' },
        { id: 'events', label: 'Events' },
    ];

    useEffect(() => {
        const unsub = SoundManager.subscribe(() => {
            setCurrentTrack(SoundManager.getCurrentTrack());
            setIsPlaying(!SoundManager.bgm.paused);
        });
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        SoundManager.bgm.addEventListener('play', onPlay);
        SoundManager.bgm.addEventListener('pause', onPause);
        return () => {
            unsub();
            SoundManager.bgm.removeEventListener('play', onPlay);
            SoundManager.bgm.removeEventListener('pause', onPause);
        };
    }, []);

    const handleBgmChange = (e) => {
        const val = parseFloat(e.target.value);
        setBgmVol(val);
        SoundManager.setBgmVolume(val);
    };

    const handleSfxChange = (e) => {
        const val = parseFloat(e.target.value);
        setSfxVol(val);
        SFXManager.setSfxVolume(val);
    };

    const handleSfxRelease = () => {
        SFXManager.playUIClick(); // Feedback when they stop dragging
    };

    const handleToggleMute = () => {
        const isNowMuted = !SoundManager.isMuted();
        SoundManager.toggleMute();
        SFXManager.toggleMute(!isNowMuted);
        setIsMuted(isNowMuted);
    };

    const handlePrev = () => { SFXManager.playUIClick(); SoundManager.playPrev(); };
    const handleNext = () => { SFXManager.playUIClick(); SoundManager.playNext(); };
    const handlePlayPause = () => {
        SFXManager.playUIClick();
        if (SoundManager.bgm.paused) {
            SoundManager.playBGM();
        } else {
            SoundManager.bgm.pause();
        }
    };
    const handleTestSfx = () => SFXManager.playLevelUp();

    return (
        <div data-allow-touchmove role="dialog" className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[60] p-4">
            <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-slate-900 border-2 border-cyan-500 p-6 md:p-8 rounded-xl max-w-sm w-full text-white font-mono relative"
            >
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
                >
                    <X size={24} />
                </button>
                
                <h2 className="text-3xl font-bold text-cyan-400 mb-8 text-center">SETTINGS</h2>
                
                <div className="space-y-6">
                    <div>
                        <div className="flex justify-between mb-2 items-center">
                            <label className="font-bold text-slate-300">Master Audio</label>
                            <button onClick={handleToggleMute} className="text-cyan-400 hover:text-cyan-300 bg-slate-800 p-2 rounded-lg border border-slate-700">
                                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                            </button>
                        </div>
                        <div className="text-sm text-slate-500 mb-4">
                            {isMuted ? 'Audio is currently muted.' : 'Audio is enabled.'}
                        </div>
                    </div>

                    <div className={isMuted ? 'opacity-50 pointer-events-none' : ''}>
                        <div className="flex justify-between mb-2">
                            <label className="font-bold text-slate-300">Music Volume</label>
                            <span className="text-cyan-400">{Math.round(bgmVol * 100)}%</span>
                        </div>
                        <input 
                            type="range" 
                            min="0" max="1" step="0.01" 
                            value={bgmVol} 
                            onChange={handleBgmChange}
                            disabled={isMuted}
                            className="w-full accent-cyan-500"
                        />

                        {/* Now Playing + transport */}
                        <div className="mt-3 bg-slate-800/60 border border-slate-700 rounded-lg p-2.5">
                            <div className="flex items-center gap-2 mb-2">
                                <Music size={14} className="text-cyan-400 shrink-0" />
                                <div className="text-[10px] uppercase tracking-widest text-slate-500">Now Playing</div>
                            </div>
                            <div className="text-sm text-white truncate mb-2.5" title={currentTrack?.name}>
                                {currentTrack?.name || '—'}
                            </div>
                            <div className="flex items-center justify-center gap-2">
                                <button onClick={handlePrev} disabled={isMuted} className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white p-2 rounded-lg transition-colors">
                                    <SkipBack size={16} />
                                </button>
                                <button onClick={handlePlayPause} disabled={isMuted} className="bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white p-2.5 rounded-lg transition-colors">
                                    {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                                </button>
                                <button onClick={handleNext} disabled={isMuted} className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white p-2 rounded-lg transition-colors">
                                    <SkipForward size={16} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className={isMuted ? 'opacity-50 pointer-events-none' : ''}>
                        <div className="flex justify-between mb-2 items-center">
                            <label className="font-bold text-slate-300">SFX Volume</label>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleTestSfx}
                                    disabled={isMuted}
                                    className="text-[10px] uppercase tracking-widest bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-cyan-300 border border-slate-700 px-2 py-1 rounded transition-colors"
                                >
                                    Test
                                </button>
                                <span className="text-cyan-400">{Math.round(sfxVol * 100)}%</span>
                            </div>
                        </div>
                        <input 
                            type="range" 
                            min="0" max="1" step="0.01" 
                            value={sfxVol} 
                            onChange={handleSfxChange}
                            onMouseUp={handleSfxRelease}
                            onTouchEnd={handleSfxRelease}
                            disabled={isMuted}
                            className="w-full accent-cyan-500"
                        />

                        {/* Per-category SFX toggles */}
                        <div className="mt-3 bg-slate-800/60 border border-slate-700 rounded-lg p-2.5">
                            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">SFX Categories</div>
                            <div className="grid grid-cols-2 gap-1.5">
                                {SFX_CATEGORIES.map(cat => {
                                    const on = sfxCats[cat.id] !== false;
                                    return (
                                        <button
                                            key={cat.id}
                                            onClick={() => toggleCat(cat.id)}
                                            className={`text-xs font-bold px-2 py-1.5 rounded border transition-colors ${on ? 'bg-cyan-900/40 border-cyan-500/60 text-cyan-200 hover:bg-cyan-900/60' : 'bg-slate-900 border-slate-700 text-slate-500 hover:bg-slate-800'}`}
                                        >
                                            {on ? '✓ ' : '✕ '}{cat.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between mb-2 items-center">
                            <label className="font-bold text-slate-300">Low FX Mode</label>
                            <button
                                onClick={toggleLowFx}
                                className={`text-xs font-bold px-3 py-1.5 rounded border transition-colors ${lowFx ? 'bg-cyan-900/60 border-cyan-500 text-cyan-200' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                            >
                                {lowFx ? '✓ ON' : '✕ OFF'}
                            </button>
                        </div>
                        <div className="text-xs text-slate-500">
                            Reduces particle effects and explosion visuals to keep your phone cool. Recommended on mobile during heavy runs.
                        </div>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="w-full mt-4 bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-3 rounded-lg font-bold text-lg transition-colors shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                >
                    Done
                </button>
            </motion.div>
        </div>
    );
}