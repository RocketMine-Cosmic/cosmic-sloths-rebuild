// Standard-tier ("Support the Devs" GMT) catalogue for the chest-only categories
// that previously had no standard variants: LB Frames, Animated Pilot Icons,
// Title Flair. Each entry is pure CSS / emoji — no PNG generation needed.
//
// IDs use the `std_` prefix so they never collide with chest IDs and the live
// render paths (LBFrame, AnimatedPilotIcon, PlayerTitle) can branch cheaply.
//
// Visual baseline (locked 2026-06-27): these are paid items even at the
// "donation" tier, so each entry carries enough layered treatment — plates,
// rims, gradients, accent glows — to read as a real reward and not as
// untreated emoji / plain borders.

// ─── Standard LB Frames (5) ──────────────────────────────────────────────────
// Each frame is a layered treatment: outer accent border, gradient mid-layer,
// inner highlight, optional corner ornaments. `kind` drives the renderer's
// composition path (solid plate vs gradient stroke).
export const STANDARD_LB_FRAMES = [
    {
        id: 'std_lb_frame_cyan_glow',
        name: 'Cyan Pulse',
        desc: 'Double cyan border with inner highlight and pulsing aura.',
        kind: 'solid',
        // Outer ring + inner stroke + ambient glow combine for a "framed" feel.
        style: {
            border: '2px solid rgba(34,211,238,0.9)',
            boxShadow: 'inset 0 0 0 1px rgba(125,211,252,0.35), 0 0 14px rgba(34,211,238,0.55), 0 0 28px rgba(34,211,238,0.25)',
        },
        anim: 'std-lb-pulse-cyan',
        accent: '#22d3ee',
    },
    {
        id: 'std_lb_frame_gold_halo',
        name: 'Gold Halo',
        desc: 'Brushed-gold double border with warm halo glow.',
        kind: 'solid',
        style: {
            border: '2px solid rgba(250,204,21,0.95)',
            boxShadow: 'inset 0 0 0 1px rgba(254,240,138,0.45), 0 0 14px rgba(250,204,21,0.55), 0 0 30px rgba(217,119,6,0.35)',
        },
        anim: 'std-lb-pulse-gold',
        accent: '#facc15',
    },
    {
        id: 'std_lb_frame_violet_aura',
        name: 'Violet Aura',
        desc: 'Violet rim with deep purple aura and inner sheen.',
        kind: 'solid',
        style: {
            border: '2px solid rgba(192,132,252,0.9)',
            boxShadow: 'inset 0 0 0 1px rgba(216,180,254,0.4), 0 0 14px rgba(168,85,247,0.6), 0 0 30px rgba(126,34,206,0.35)',
        },
        anim: 'std-lb-pulse-purple',
        accent: '#c084fc',
    },
    {
        id: 'std_lb_frame_sunset',
        name: 'Sunset',
        desc: 'Animated orange→pink gradient stroke with corner sparks.',
        kind: 'gradient',
        gradient: 'linear-gradient(90deg,#f59e0b,#f97316,#ec4899,#f97316,#f59e0b)',
        anim: 'std-lb-grad-shift',
        accent: '#f97316',
        showCorners: true,
    },
    {
        id: 'std_lb_frame_aurora',
        name: 'Aurora',
        desc: 'Animated green→cyan→violet aurora stroke with corner sparks.',
        kind: 'gradient',
        gradient: 'linear-gradient(90deg,#34d399,#22d3ee,#a78bfa,#22d3ee,#34d399)',
        anim: 'std-lb-grad-shift',
        accent: '#22d3ee',
        showCorners: true,
    },
];

// ─── Standard Animated Pilot Icons (5) ───────────────────────────────────────
// Each icon: themed emoji + motion + a coloured rim/glow that matches the
// theme. The rim is what turns "an emoji" into "a cosmetic" — paid players
// see a polished medallion, not a raw glyph.
// Themed sigil icons rendered as SVG (see StandardIconSigils.jsx). Each is a
// procedurally-drawn cosmic emblem — not an emoji — so they hold their own
// next to the chest-tier generated art. Rim colours are deeper / less saturated
// than the earlier emoji set for a more premium feel.
// Cosmic sigil icons rendered as SVG (see StandardIconSigils.jsx). Each is
// a procedurally-drawn cosmic scene — nebula backdrop, starfield, glowing
// sigil — so they hold their own at $4 a piece beside the chest AI art.
// Rim colours are vivid cosmic tones; the plate keeps the deep-space mood
// while letting the SVG nebula push through.
export const STANDARD_ANIMATED_ICONS = [
    {
        id: 'std_icon_spinning_star',
        name: 'Astral Sigil',
        desc: 'Radiant eight-point star with a hex core, slowly rotating.',
        anim: 'std-icon-spin',
        rim: '#fbbf24',
        plate: 'radial-gradient(circle at 30% 30%, rgba(251,191,36,0.22), rgba(8,12,24,0.95) 75%)',
    },
    {
        id: 'std_icon_pulsing_gem',
        name: 'Prism Core',
        desc: 'Faceted prism orbited by a thin ring, pulsing softly.',
        anim: 'std-icon-pulse',
        rim: '#22d3ee',
        plate: 'radial-gradient(circle at 30% 30%, rgba(34,211,238,0.22), rgba(8,12,24,0.95) 75%)',
    },
    {
        id: 'std_icon_bouncing_rocket',
        name: 'Comet',
        desc: 'Swept comet head trailing through the medallion.',
        anim: 'std-icon-bounce',
        rim: '#60a5fa',
        plate: 'radial-gradient(circle at 30% 30%, rgba(96,165,250,0.22), rgba(8,12,24,0.95) 75%)',
    },
    {
        id: 'std_icon_glowing_heart',
        name: 'Crimson Eye',
        desc: 'Watching eye sigil with a soft pulsing iris.',
        anim: 'std-icon-glow',
        rim: '#f43f5e',
        plate: 'radial-gradient(circle at 30% 30%, rgba(244,63,94,0.22), rgba(8,12,24,0.95) 75%)',
    },
    {
        id: 'std_icon_wobbling_skull',
        name: 'Void Mark',
        desc: 'Pentagonal void sigil with a faint inner glyph.',
        anim: 'std-icon-wobble',
        rim: '#a78bfa',
        plate: 'radial-gradient(circle at 30% 30%, rgba(167,139,250,0.22), rgba(8,12,24,0.95) 75%)',
    },
];

// ─── Standard Title Flairs (5) ───────────────────────────────────────────────
// Each id maps 1:1 to a `.title-flair-<id>` CSS class defined in index.css.
export const STANDARD_TITLE_FLAIRS = [
    { id: 'title_style_cyan_glow',    name: 'Cyan Glow',    desc: 'Cyan text with layered glow halo.' },
    { id: 'title_style_gold_outline', name: 'Gold Outline', desc: 'Warm-gold double outline with soft sheen.' },
    { id: 'title_style_pink_pop',     name: 'Pink Pop',     desc: 'Vivid pink text with radiant glow.' },
    { id: 'title_style_emerald_mint', name: 'Emerald Mint', desc: 'Cool emerald-mint gradient with sheen.' },
    { id: 'title_style_violet_haze',  name: 'Violet Haze',  desc: 'Smooth violet gradient with deep haze.' },
];

// Fast lookup helpers.
const _stdLbMap   = Object.fromEntries(STANDARD_LB_FRAMES.map(x => [x.id, x]));
const _stdIconMap = Object.fromEntries(STANDARD_ANIMATED_ICONS.map(x => [x.id, x]));

export const isStandardLbFrame      = (id) => !!id && !!_stdLbMap[id];
export const isStandardAnimatedIcon = (id) => !!id && !!_stdIconMap[id];
export const getStandardLbFrame      = (id) => _stdLbMap[id] || null;
export const getStandardAnimatedIcon = (id) => _stdIconMap[id] || null;