import React from 'react';
import { getLBFrameStyle } from '@/lib/lbFrameStyles';
import { isStandardLbFrame, getStandardLbFrame } from '@/lib/standardCosmetics';

// Live preview of any LB Frame cosmetic — handles both standard (CSS) and
// chest (PNG) frames so the Wardrobe preview matches the live LB row.

const CornerSpark = ({ color, position }) => (
    <span
        className="absolute w-1.5 h-1.5 rotate-45 rounded-[1px] pointer-events-none"
        style={{
            ...position,
            background: color,
            boxShadow: `0 0 6px ${color}, 0 0 12px ${color}88`,
        }}
    />
);

export default function LbFrameDemo({ frameId, frameUrl, charIcon = '🦥', name = 'Cosmic Legend', score = 472000 }) {
    const isStandard = isStandardLbFrame(frameId);

    if (!isStandard && !frameUrl) {
        return (
            <div className="w-full bg-slate-950 rounded-lg flex items-center justify-center py-10 text-slate-500 text-xs">
                Asset not yet generated.
            </div>
        );
    }

    const rowContent = (
        <div className="relative z-10 h-full flex items-center gap-3 px-4 py-3">
            <div className="text-xl font-bold text-amber-300 shrink-0">🥇</div>
            <div className="w-9 h-9 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-lg shrink-0">{charIcon}</div>
            <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-base truncate">{name}</div>
                <div className="text-[10px] text-slate-400">Sample row</div>
            </div>
            <div className="font-mono text-cyan-400 font-bold text-base shrink-0">{score.toLocaleString()}</div>
        </div>
    );

    return (
        <div className="w-full bg-slate-950 rounded-lg p-6 flex flex-col items-center gap-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">leaderboard row preview</div>

            {isStandard ? (() => {
                const f = getStandardLbFrame(frameId);
                if (f.kind === 'gradient') {
                    return (
                        <div
                            className={`relative w-full max-w-[640px] rounded-lg ${f.anim}`}
                            style={{
                                padding: '2px',
                                backgroundImage: f.gradient,
                                backgroundSize: '200% 100%',
                                boxShadow: `0 0 10px ${f.accent}55, 0 0 22px ${f.accent}33`,
                            }}
                        >
                            <div className="rounded-md bg-slate-900/95">{rowContent}</div>
                            {f.showCorners && (
                                <>
                                    <CornerSpark color={f.accent} position={{ top: '-3px', left: '-3px' }} />
                                    <CornerSpark color={f.accent} position={{ top: '-3px', right: '-3px' }} />
                                    <CornerSpark color={f.accent} position={{ bottom: '-3px', left: '-3px' }} />
                                    <CornerSpark color={f.accent} position={{ bottom: '-3px', right: '-3px' }} />
                                </>
                            )}
                        </div>
                    );
                }
                return (
                    <div className={`w-full max-w-[640px] rounded-lg bg-slate-900/95 ${f.anim}`} style={f.style}>
                        {rowContent}
                    </div>
                );
            })() : (() => {
                const { anim } = getLBFrameStyle(frameId);
                return (
                    <div className={`relative w-full max-w-[640px] aspect-[8/1] ${anim}`}>
                        <img
                            src={frameUrl}
                            alt=""
                            aria-hidden="true"
                            className="absolute inset-0 w-full h-full pointer-events-none select-none"
                            style={{ objectFit: 'fill' }}
                        />
                        <div className="relative z-10 h-full flex items-center gap-3 pl-[11%] pr-[11%]">
                            <div className="text-xl font-bold text-amber-300 shrink-0">🥇</div>
                            <div className="w-9 h-9 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-lg shrink-0">{charIcon}</div>
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-white text-base truncate">{name}</div>
                                <div className="text-[10px] text-slate-400">Sample row</div>
                            </div>
                            <div className="font-mono text-cyan-400 font-bold text-base shrink-0">{score.toLocaleString()}</div>
                        </div>
                    </div>
                );
            })()}

            <div className="text-xs text-slate-500">Stretches to fit any row width</div>
        </div>
    );
}