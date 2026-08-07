import React from 'react';

// Persistent yellow strip rendered at the top of the game canvas during
// sandbox runs. Painted OVER the canvas so screenshots and streams show
// the banner too — makes it obvious a run wasn't a real leaderboard entry.
// Non-dismissible by design (per docs/s8/PLAN_SANDBOX_TEST_PLAY.md §UX).
export default function SandboxBanner() {
    return (
        <div
            className="absolute top-0 left-0 right-0 z-[80] pointer-events-none flex items-center justify-center px-3 py-1.5"
            style={{
                paddingTop: 'max(calc(env(safe-area-inset-top, 0px) + 6px), 8px)',
                background: 'linear-gradient(180deg, rgba(234,179,8,0.95), rgba(202,138,4,0.85))',
                borderBottom: '2px solid rgba(120,53,15,0.9)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
        >
            <div className="text-slate-900 font-black text-[10px] md:text-xs tracking-widest uppercase text-center">
                🎯 Practice Range · No rewards · No leaderboard · No kill credit
            </div>
        </div>
    );
}