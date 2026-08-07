import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { subscribe as subscribeMaintenance, getStatus as getMaintenanceStatus } from '@/lib/maintenanceStatus';
import { AlertTriangle, Wrench, RefreshCw } from 'lucide-react';
import { APP_VERSION, compareVersions, reloadToLatest } from '@/lib/version';

// Wraps the app and shows either a top banner ('soft') or a full-screen overlay
// blocking /game ('hard'). Polls every 30s. Fails OPEN — if the function errors
// we treat it as 'off' so a backend hiccup never locks players out.
//
// Soft = "rollover incoming, finish your run" — game still playable.
// Hard = "rollover in progress" — /game route blocked, but players can stay on
//        any other page (squads, chat, leaderboard, profile).
export default function MaintenanceGate() {
    const [state, setState] = useState(() => {
        const s = getMaintenanceStatus();
        return {
            mode: s.mode || 'off',
            message: s.message || '',
            minClientVersion: s.minClientVersion || '',
            minClientVersionMessage: s.minClientVersionMessage || '',
        };
    });
    // Admins bypass the HARD gate so they can smoke-test runs during a rollover
    // (otherwise nobody could verify the rollover worked). Checked once on mount —
    // role doesn't change mid-session. Falls back to non-admin on any error.
    const [isAdmin, setIsAdmin] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    // Subscribe to the SHARED maintenance cache — no per-component polling.
    // Previously this hit getMaintenanceMode every 30s on its own; combined with
    // the other 3 callers that was the bulk of the 429 storm.
    useEffect(() => {
        const unsub = subscribeMaintenance(s => {
            setState({
                mode: s.mode || 'off',
                message: s.message || '',
                minClientVersion: s.minClientVersion || '',
                minClientVersionMessage: s.minClientVersionMessage || '',
            });
        });
        // One-shot admin check.
        let cancelled = false;
        base44.auth.me()
            .then(u => { if (!cancelled) setIsAdmin(u?.role === 'admin'); })
            .catch(() => { /* not signed in or call failed — treat as non-admin */ });
        return () => { cancelled = true; unsub(); };
    }, []);

    // If hard mode and player is on /game, push them out so they can't start a run.
    // Admins are exempt — they need /game accessible to verify the rollover worked.
    useEffect(() => {
        if (state.mode === 'hard' && location.pathname === '/game' && !isAdmin) {
            navigate('/hub', { replace: true });
        }
    }, [state.mode, location.pathname, navigate, isAdmin]);

    // Version gate — checked BEFORE the maintenance-mode early return so an
    // outdated client gets pushed to update even when maintenance is 'off'.
    // Admins bypass (same rationale as the hard maintenance gate — they need to
    // be able to verify a build pre-rollout). Empty server config = no gate.
    const versionOutdated = !!state.minClientVersion
        && compareVersions(APP_VERSION, state.minClientVersion) < 0;
    if (versionOutdated && !isAdmin) {
        return (
            <div className="fixed inset-0 z-[10000] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-[#0b0416] border-2 border-cyan-500 rounded-xl p-6 md:p-8 text-center shadow-[0_0_40px_rgba(6,182,212,0.3)]">
                    <div className="flex justify-center mb-4">
                        <div className="w-16 h-16 rounded-full bg-cyan-500/20 flex items-center justify-center">
                            <RefreshCw className="w-8 h-8 text-cyan-300 animate-spin" style={{ animationDuration: '3s' }} />
                        </div>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-black uppercase tracking-widest text-cyan-300 mb-3">
                        Update Required
                    </h1>
                    <p className="text-slate-200 text-sm md:text-base mb-2 leading-relaxed">
                        {state.minClientVersionMessage || 'A new version of Cosmic Sloths is available. Please reload to continue playing.'}
                    </p>
                    <p className="text-xs text-slate-500 mb-5">
                        Your version: <span className="text-slate-300 font-mono">v{APP_VERSION}</span>
                        {' — '}
                        Required: <span className="text-cyan-300 font-mono">v{state.minClientVersion}</span>
                    </p>
                    <button
                        onClick={reloadToLatest}
                        className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-black tracking-widest uppercase py-3 rounded-lg transition-colors shadow-[0_0_20px_rgba(6,182,212,0.4)] flex items-center justify-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Reload Now
                    </button>
                </div>
            </div>
        );
    }

    if (state.mode === 'off') return null;

    // Admins see a small persistent pill instead of the SOFT banner / HARD overlay
    // so the maintenance state is still visible (they shouldn't forget to flip OFF)
    // but the game stays fully playable for smoke tests.
    if (isAdmin) {
        return (
            <div className="fixed bottom-2 right-2 z-[9999] bg-amber-600/95 text-white text-[10px] md:text-xs font-bold px-2.5 py-1 rounded-md shadow-lg flex items-center gap-1.5 border border-amber-300/60">
                <Wrench className="w-3 h-3 shrink-0" />
                <span>ADMIN BYPASS · Gate is {state.mode.toUpperCase()}</span>
            </div>
        );
    }

    if (state.mode === 'soft') {
        // Hide entirely during active gameplay — the banner overlapping HUD/joystick
        // was too intrusive mid-run. Players see it on every other page (hub, squads,
        // leaderboard, etc.) so they're still informed.
        if (location.pathname === '/game') return null;
        // Bottom-anchored so it doesn't overlap the WarpMenu / top nav, and
        // pointer-events-none so it never blocks clicks on whatever sits behind
        // it (the banner itself has no interactive elements).
        return (
            <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-amber-600/95 text-white text-center text-xs md:text-sm font-bold px-3 py-2 shadow-lg flex items-center justify-center gap-2 backdrop-blur-sm pointer-events-none">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="truncate">{state.message || 'Season 6 rollout coming soon — finish your run before launch.'}</span>
            </div>
        );
    }

    // hard
    return (
        <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-[#0b0416] border-2 border-amber-500 rounded-xl p-6 md:p-8 text-center shadow-[0_0_40px_rgba(245,158,11,0.3)]">
                <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <Wrench className="w-8 h-8 text-amber-300 animate-pulse" />
                    </div>
                </div>
                <h1 className="text-2xl md:text-3xl font-black uppercase tracking-widest text-amber-300 mb-3">
                    Season 6 Rollout
                </h1>
                <p className="text-slate-200 text-sm md:text-base mb-4 leading-relaxed">
                    {state.message || 'The game is briefly closed for the seasonal rollover. Please check back shortly.'}
                </p>
                <p className="text-xs text-slate-400 italic">
                    The page will refresh automatically when the rollover is complete.
                </p>
                <a
                    href="/admin"
                    className="mt-4 inline-block text-[10px] text-slate-600 hover:text-slate-400 uppercase tracking-widest"
                >
                    admin
                </a>
            </div>
        </div>
    );
}