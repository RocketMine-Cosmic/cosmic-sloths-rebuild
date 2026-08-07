import React from 'react';
import { getChestIconAnimClass } from '@/lib/chestIconAnimations';

// Renders a chest-tier pilot icon PNG with its ambient animation overlay.
//
// Design rule: the PNG itself NEVER moves (no transform / scale) — the
// animation is a halo + (for Glitch Skull) RGB-split copies stacked over
// the static art. Black Hole is the one exception (PNG is circle-clipped
// by the parent and rotates in place — see index.css).
export default function ChestIconImage({ url, animatedId, alt = 'pilot' }) {
    const anim = getChestIconAnimClass(animatedId);
    const isGlitch = animatedId === 'animated_pilot_glitch_skull';
    return (
        <div className={`chest-icon-wrap ${anim}`}>
            <img src={url} alt={alt} />
            {isGlitch && (
                <>
                    <img src={url} alt="" aria-hidden="true" className="chest-icon-rgb-r" />
                    <img src={url} alt="" aria-hidden="true" className="chest-icon-rgb-b" />
                </>
            )}
            <span className="chest-icon-halo" />
        </div>
    );
}