import React from 'react';
import { getChestAssetUrl } from '@/lib/chestCosmeticAssets';
import { getLBFrameStyle } from '@/lib/lbFrameStyles';
import { isStandardLbFrame, getStandardLbFrame } from '@/lib/standardCosmetics';

// Wraps a leaderboard row with an LB Banner Frame.
//
// Two render paths:
//   1. Standard (CSS) frames — layered borders / shadows / gradients, with
//      optional corner sparks on gradient frames.
//   2. Chest (PNG) frames — stretched 8:1 banner art behind the row.

// Tiny diamond spark used on gradient frames' corners.
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

export default function LBFrame({ frameId, children, className = '' }) {
    if (!frameId) return <>{children}</>;

    // Standard ("Support the Devs") CSS-only frames.
    if (isStandardLbFrame(frameId)) {
        const f = getStandardLbFrame(frameId);
        if (f.kind === 'gradient') {
            return (
                <div
                    className={`relative rounded-lg ${f.anim} ${className}`}
                    style={{
                        padding: '2px',
                        backgroundImage: f.gradient,
                        backgroundSize: '200% 100%',
                        boxShadow: `0 0 10px ${f.accent}55, 0 0 22px ${f.accent}33`,
                    }}
                >
                    <div className="rounded-md bg-slate-900/95 relative">
                        {children}
                    </div>
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
            <div className={`relative rounded-lg ${f.anim} ${className}`} style={f.style}>
                {children}
            </div>
        );
    }

    // Chest (PNG) frames.
    const url = getChestAssetUrl(frameId);
    if (!url) return <>{children}</>;
    const { anim } = getLBFrameStyle(frameId);
    return (
        <div className={`relative lb-frame-wrap ${anim} ${className}`}>
            <img
                src={url}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full pointer-events-none select-none"
                style={{ objectFit: 'fill' }}
            />
            <div className="relative z-10 px-4 py-3">
                {children}
            </div>
        </div>
    );
}