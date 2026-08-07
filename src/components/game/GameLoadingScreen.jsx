import React from 'react';

// Read pilot identity straight from the canonical save.profile so the loading
// screen confirms the player's callsign IS set before the run starts (Waeoo
// bug 2026-05-14 — callsigns silently fell off and players only noticed in
// the leaderboard after the run). Falls back to legacy top-level fields and
// localStorage omenx_auth_data if the new profile object hasn't hydrated yet.
function readPilotIdentity() {
    try {
        const save = JSON.parse(localStorage.getItem('cosmic_sloth_save') || 'null') || {};
        const profile = save.profile || {};
        const auth = JSON.parse(localStorage.getItem('omenx_auth_data') || 'null') || {};
        return {
            icon:  profile.pilot_icon  || save.pilot_icon  || auth.pilot_icon  || '🦥',
            name:  profile.player_name || save.player_name || save.pilotName || auth.player_name || 'Pilot',
            title: profile.player_title || save.player_title || '',
        };
    } catch {
        return { icon: '🦥', name: 'Pilot', title: '' };
    }
}

export default function GameLoadingScreen() {
    const pilot = readPilotIdentity();
    return (
        <div className="fixed inset-0 z-[100] bg-[#020408] flex items-center justify-center overflow-hidden">
            {/* Animated nebula glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-fuchsia-500/10 blur-3xl animate-pulse" style={{ animationDelay: '0.7s' }} />
            </div>

            <div className="relative z-10 flex flex-col items-center gap-6 px-6">
                <div className="text-5xl md:text-7xl animate-bounce">🦥</div>

                <h1
                    className="text-2xl md:text-4xl font-black tracking-widest uppercase text-center"
                    style={{
                        background: 'linear-gradient(90deg, #0CA7B8, #D946EF, #0CA7B8)',
                        backgroundSize: '200%',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        animation: 'shimmer 3s linear infinite',
                    }}
                >
                    Initializing Sloth Mayhem
                </h1>

                {/* Pilot identity card — confirms callsign/title/icon are set
                    before the run starts so players catch fall-offs early. */}
                <div className="flex items-center gap-3 bg-slate-900/70 border border-cyan-500/30 rounded-lg px-4 py-2 max-w-[90vw]">
                    <span className="text-2xl md:text-3xl leading-none">{pilot.icon}</span>
                    <div className="text-left leading-tight min-w-0">
                        <div className="text-cyan-100 text-sm md:text-base font-bold font-mono truncate">{pilot.name}</div>
                        {pilot.title && (
                            <div className="text-cyan-400/70 text-[10px] md:text-xs uppercase tracking-wide truncate">{pilot.title}</div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 text-cyan-300 text-xs md:text-sm font-mono tracking-widest uppercase">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span>Loading operative · syncing save · arming weapons</span>
                </div>

                <div className="w-48 md:w-64 h-1 bg-slate-900 border border-cyan-500/30 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-cyan-500 via-fuchsia-500 to-cyan-500"
                        style={{
                            backgroundSize: '200% 100%',
                            animation: 'loadbar 1.5s ease-in-out infinite',
                        }}
                    />
                </div>
            </div>

            <style>{`
                @keyframes shimmer {
                    0% { background-position: 0% 50%; }
                    100% { background-position: 200% 50%; }
                }
                @keyframes loadbar {
                    0% { background-position: 100% 0; }
                    100% { background-position: -100% 0; }
                }
            `}</style>
        </div>
    );
}