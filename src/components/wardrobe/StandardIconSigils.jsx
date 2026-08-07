import React from 'react';

// Procedurally-drawn SVG sigils for the standard pilot icons.
//
// Each sigil is rendered as a full cosmic scene — not a flat icon — so they
// hold their own next to the chest-tier AI art at $4 a piece:
//   • Deep-space backdrop with nebula glow + starfield
//   • Faint orbital ring (different per sigil)
//   • Sigil shape with gradient strokes and SVG glow filter
//   • Highlight sparks / accent particles
//
// viewBox 0 0 100 100 — caller sizes via width/height.

const baseProps = {
    viewBox: '0 0 100 100',
    xmlns: 'http://www.w3.org/2000/svg',
    fill: 'none',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
};

// Shared cosmic backdrop — nebula glow + starfield. The nebula colour ties to
// the sigil's accent so each medallion has its own atmosphere.
const CosmicBackdrop = ({ id, color, stars = [] }) => (
    <>
        <defs>
            <radialGradient id={`bg-${id}`} cx="50%" cy="50%" r="55%">
                <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                <stop offset="45%" stopColor={color} stopOpacity="0.12" />
                <stop offset="100%" stopColor="rgba(4,6,14,0)" />
            </radialGradient>
            {/* Inner glow filter for sigils — gives strokes a luminous edge */}
            <filter id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.8" result="b" />
                <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        </defs>
        {/* Nebula glow */}
        <circle cx="50" cy="50" r="50" fill={`url(#bg-${id})`} />
        {/* Starfield */}
        {stars.map(([x, y, r, o], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#ffffff" opacity={o} />
        ))}
    </>
);

// ── Astral Sigil (gold) — radiant 8-point star with hex core, nebula gold ───
const SigilAstral = ({ color }) => (
    <svg {...baseProps}>
        <CosmicBackdrop id="ast" color={color} stars={[
            [18, 22, 0.6, 0.8], [82, 28, 0.8, 0.9], [76, 78, 0.5, 0.7],
            [22, 75, 0.7, 0.8], [12, 50, 0.4, 0.6], [88, 60, 0.5, 0.7],
            [40, 12, 0.4, 0.5], [60, 88, 0.4, 0.5],
        ]} />
        <defs>
            <radialGradient id="ast-core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fff7d6" />
                <stop offset="50%" stopColor={color} />
                <stop offset="100%" stopColor="#5a3a00" />
            </radialGradient>
            <linearGradient id="ast-beam" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="50%" stopColor={color} stopOpacity="1" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.9" />
            </linearGradient>
        </defs>
        {/* Faint orbital ring */}
        <circle cx="50" cy="50" r="40" stroke={color} strokeWidth="0.6" opacity="0.35" />
        {/* 8 long radiant beams w/ gradient */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
            <line key={a} x1="50" y1="50" x2="50" y2="10"
                stroke="url(#ast-beam)" strokeWidth="2.5"
                transform={`rotate(${a} 50 50)`}
                filter="url(#glow-ast)" />
        ))}
        {/* Hex core */}
        <polygon points="50,30 67,40 67,60 50,70 33,60 33,40"
            stroke={color} strokeWidth="2" fill="url(#ast-core)"
            filter="url(#glow-ast)" />
        <circle cx="50" cy="50" r="5" fill="#ffffff" opacity="0.95" />
    </svg>
);

// ── Prism Core (cyan) — diamond prism with multi-orbital rings ──────────────
const SigilPrism = ({ color }) => (
    <svg {...baseProps}>
        <CosmicBackdrop id="prs" color={color} stars={[
            [16, 30, 0.7, 0.85], [84, 22, 0.5, 0.7], [80, 72, 0.7, 0.85],
            [20, 80, 0.6, 0.75], [50, 8, 0.5, 0.6], [10, 60, 0.4, 0.6],
            [90, 50, 0.5, 0.65],
        ]} />
        <defs>
            <linearGradient id="prs-face" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                <stop offset="50%" stopColor={color} stopOpacity="0.85" />
                <stop offset="100%" stopColor={color} stopOpacity="0.2" />
            </linearGradient>
        </defs>
        {/* Twin orbital ellipses */}
        <ellipse cx="50" cy="50" rx="42" ry="12" stroke={color} strokeWidth="1" opacity="0.5"
            transform="rotate(-12 50 50)" />
        <ellipse cx="50" cy="50" rx="38" ry="16" stroke={color} strokeWidth="0.8" opacity="0.35"
            transform="rotate(18 50 50)" />
        {/* Diamond prism */}
        <polygon points="50,16 74,50 50,84 26,50"
            stroke={color} strokeWidth="2.5" fill="url(#prs-face)"
            filter="url(#glow-prs)" />
        <line x1="26" y1="50" x2="74" y2="50" stroke="#ffffff" strokeWidth="1.2" opacity="0.85" />
        <line x1="50" y1="16" x2="50" y2="84" stroke="#ffffff" strokeWidth="0.8" opacity="0.6" strokeDasharray="2 3" />
        {/* Bright core spark */}
        <circle cx="50" cy="50" r="4" fill="#ffffff" />
        <circle cx="50" cy="50" r="2" fill={color} />
    </svg>
);

// ── Comet (blue) — swept comet with bright head + multi-trail ──────────────
const SigilComet = ({ color }) => (
    <svg {...baseProps}>
        <CosmicBackdrop id="cmt" color={color} stars={[
            [15, 18, 0.7, 0.9], [80, 20, 0.5, 0.7], [88, 65, 0.6, 0.8],
            [18, 60, 0.5, 0.7], [50, 90, 0.4, 0.6], [10, 85, 0.6, 0.75],
            [60, 12, 0.5, 0.7], [38, 30, 0.3, 0.5], [82, 85, 0.4, 0.6],
        ]} />
        <defs>
            <linearGradient id="cmt-trail" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                <stop offset="30%" stopColor={color} stopOpacity="0.85" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
            <radialGradient id="cmt-head" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="40%" stopColor="#cfeaff" />
                <stop offset="100%" stopColor={color} />
            </radialGradient>
        </defs>
        {/* Wide soft trail */}
        <path d="M 72 28 Q 45 45 18 82" stroke="url(#cmt-trail)" strokeWidth="14" opacity="0.45" />
        {/* Bright inner trail */}
        <path d="M 72 28 Q 48 42 25 75" stroke="url(#cmt-trail)" strokeWidth="6" opacity="0.95"
            filter="url(#glow-cmt)" />
        {/* Comet head — outer halo + bright core */}
        <circle cx="72" cy="28" r="16" fill={color} opacity="0.3" />
        <circle cx="72" cy="28" r="10" fill={color} opacity="0.55" filter="url(#glow-cmt)" />
        <circle cx="72" cy="28" r="6" fill="url(#cmt-head)" />
        <circle cx="70" cy="26" r="2" fill="#ffffff" />
        {/* Trailing sparks */}
        <circle cx="42" cy="56" r="1.8" fill="#ffffff" opacity="0.9" />
        <circle cx="30" cy="72" r="1.2" fill={color} opacity="0.8" />
        <circle cx="22" cy="82" r="0.8" fill={color} opacity="0.6" />
    </svg>
);

// ── Crimson Eye (pink/red) — vertical eye sigil with radiating crown ────────
const SigilEye = ({ color }) => (
    <svg {...baseProps}>
        <CosmicBackdrop id="eye" color={color} stars={[
            [14, 25, 0.6, 0.85], [86, 30, 0.6, 0.85], [82, 75, 0.5, 0.7],
            [18, 78, 0.6, 0.8], [10, 50, 0.4, 0.6], [90, 55, 0.5, 0.7],
            [50, 10, 0.4, 0.6], [50, 92, 0.4, 0.6],
        ]} />
        <defs>
            <radialGradient id="eye-iris" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="25%" stopColor="#ffd0e1" />
                <stop offset="55%" stopColor={color} />
                <stop offset="100%" stopColor="#3a0a18" />
            </radialGradient>
        </defs>
        {/* Almond eye */}
        <path d="M 18 50 Q 50 20 82 50 Q 50 80 18 50 Z"
            stroke={color} strokeWidth="2.5" fill="rgba(10,14,26,0.95)"
            filter="url(#glow-eye)" />
        {/* Iris + pupil + highlight */}
        <circle cx="50" cy="50" r="15" fill="url(#eye-iris)" />
        <circle cx="50" cy="50" r="6" fill="rgba(8,10,20,0.97)" />
        <circle cx="47" cy="47" r="2.2" fill="#ffffff" />
        <circle cx="54" cy="52" r="0.8" fill="#ffffff" opacity="0.7" />
        {/* Crown radiating ticks */}
        {[-24, -16, -8, 0, 8, 16, 24].map(dx => (
            <line key={`t${dx}`} x1={50 + dx} y1="22" x2={50 + dx * 0.6} y2="10"
                stroke={color} strokeWidth="1.5" opacity={0.7 - Math.abs(dx) / 60} />
        ))}
        {[-20, -10, 0, 10, 20].map(dx => (
            <line key={`b${dx}`} x1={50 + dx} y1="78" x2={50 + dx * 0.6} y2="88"
                stroke={color} strokeWidth="1.2" opacity={0.55 - Math.abs(dx) / 70} />
        ))}
    </svg>
);

// ── Void Mark (violet) — pentagonal arcane sigil with chevron rune ──────────
const SigilVoid = ({ color }) => (
    <svg {...baseProps}>
        <CosmicBackdrop id="vd" color={color} stars={[
            [12, 20, 0.7, 0.9], [88, 25, 0.6, 0.85], [85, 78, 0.5, 0.7],
            [16, 82, 0.6, 0.8], [50, 8, 0.5, 0.7], [92, 50, 0.4, 0.6],
            [8, 55, 0.4, 0.6], [28, 12, 0.3, 0.5], [70, 92, 0.3, 0.5],
        ]} />
        <defs>
            <radialGradient id="vd-fill" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={color} stopOpacity="0.5" />
                <stop offset="60%" stopColor={color} stopOpacity="0.15" />
                <stop offset="100%" stopColor="rgba(10,5,30,0)" />
            </radialGradient>
        </defs>
        {/* Outer faint ring */}
        <circle cx="50" cy="50" r="42" stroke={color} strokeWidth="0.6" opacity="0.4" strokeDasharray="3 4" />
        {/* Outer pentagon */}
        <polygon points="50,14 84,38 71,78 29,78 16,38"
            stroke={color} strokeWidth="2.5" fill="url(#vd-fill)"
            filter="url(#glow-vd)" />
        {/* Inner pentagon */}
        <polygon points="50,30 70,44 62,68 38,68 30,44"
            stroke={color} strokeWidth="1.5" fill="none" opacity="0.85" />
        {/* Chevron rune + glowing dot */}
        <path d="M 40 44 L 50 56 L 60 44" stroke="#ffffff" strokeWidth="2.5"
            filter="url(#glow-vd)" />
        <circle cx="50" cy="62" r="2.8" fill="#ffffff" filter="url(#glow-vd)" />
        {/* Vertex pips */}
        {[[50,14],[84,38],[71,78],[29,78],[16,38]].map(([x,y],i) => (
            <g key={i}>
                <circle cx={x} cy={y} r="2.8" fill={color} opacity="0.4" />
                <circle cx={x} cy={y} r="1.5" fill="#ffffff" />
            </g>
        ))}
    </svg>
);

const SIGIL_MAP = {
    std_icon_spinning_star:   SigilAstral,
    std_icon_pulsing_gem:     SigilPrism,
    std_icon_bouncing_rocket: SigilComet,
    std_icon_glowing_heart:   SigilEye,
    std_icon_wobbling_skull:  SigilVoid,
};

export default function StandardIconSigil({ id, color, size = '100%' }) {
    const Sigil = SIGIL_MAP[id];
    if (!Sigil) return null;
    return (
        <div style={{ width: size, height: size }} className="flex items-center justify-center">
            <Sigil color={color} />
        </div>
    );
}