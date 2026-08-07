import React from 'react';
import { Play, Pause } from 'lucide-react';

// Tiny visualizer bars — purely decorative, animated when this track is playing.
function Visualizer({ active }) {
    return (
        <div className="flex items-end gap-0.5 h-5 w-8">
            {[0, 1, 2, 3, 4].map(i => (
                <div
                    key={i}
                    className={`w-1 rounded-sm transition-all ${active ? 'bg-cyan-400' : 'bg-slate-600'}`}
                    style={{
                        height: active ? `${30 + Math.sin((Date.now() / 200) + i) * 30 + 30}%` : '20%',
                        animation: active ? `viz-bar-${i} 0.${6 + i}s ease-in-out infinite alternate` : 'none',
                    }}
                />
            ))}
            <style>{`
                @keyframes viz-bar-0 { from { height: 20%; } to { height: 90%; } }
                @keyframes viz-bar-1 { from { height: 80%; } to { height: 30%; } }
                @keyframes viz-bar-2 { from { height: 40%; } to { height: 100%; } }
                @keyframes viz-bar-3 { from { height: 70%; } to { height: 25%; } }
                @keyframes viz-bar-4 { from { height: 30%; } to { height: 85%; } }
            `}</style>
        </div>
    );
}

function formatDuration(seconds) {
    if (!seconds || !isFinite(seconds)) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

export default function JukeboxTrackRow({ track, index, duration, isPlaying, isPaused, menuEnabled, gameEnabled, onPlay, onToggleMenu, onToggleGame }) {
    return (
        <div className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
            isPlaying
                ? 'bg-cyan-950/40 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                : 'bg-slate-900/60 border-slate-700/50 hover:border-slate-600'
        }`}>
            {/* Track number / play button */}
            <button
                onClick={onPlay}
                className="w-10 h-10 shrink-0 rounded-full bg-slate-800 border border-slate-600 hover:bg-cyan-900 hover:border-cyan-500 flex items-center justify-center text-cyan-300 transition-colors"
                title={isPlaying && !isPaused ? 'Now playing' : 'Play this track'}
            >
                {isPlaying && !isPaused ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            {/* Track info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-500 w-5 text-right">
                        {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className={`font-bold truncate ${isPlaying ? 'text-cyan-300' : 'text-slate-200'}`}>
                        {track.name}
                    </span>
                    {duration > 0 && (
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            {formatDuration(duration)}
                        </span>
                    )}
                </div>
            </div>

            {/* Visualizer */}
            <Visualizer active={isPlaying && !isPaused} />

            {/* Per-context toggles */}
            <div className="flex gap-2 shrink-0">
                <button
                    onClick={onToggleMenu}
                    className={`px-2 py-1 rounded text-[10px] font-bold tracking-widest uppercase border transition-colors ${
                        menuEnabled
                            ? 'bg-fuchsia-900/40 border-fuchsia-500 text-fuchsia-300 hover:bg-fuchsia-900/60'
                            : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                    }`}
                    title={menuEnabled ? 'Plays in menus' : 'Disabled in menus'}
                >
                    Menu
                </button>
                <button
                    onClick={onToggleGame}
                    className={`px-2 py-1 rounded text-[10px] font-bold tracking-widest uppercase border transition-colors ${
                        gameEnabled
                            ? 'bg-orange-900/40 border-orange-500 text-orange-300 hover:bg-orange-900/60'
                            : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                    }`}
                    title={gameEnabled ? 'Plays in-game' : 'Disabled in-game'}
                >
                    Game
                </button>
            </div>
        </div>
    );
}