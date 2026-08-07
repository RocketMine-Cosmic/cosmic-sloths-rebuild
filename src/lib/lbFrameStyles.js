// Per-frame visual config for the chest-tier LB Banner Frames.
// Centralises the 9-slice tuning + animation class so LBFrame (live LB rows)
// and LbFrameDemo (Wardrobe preview) render identically.
//
// Why per-frame:
//  - `filigree` and `eclipse_crown` have detailed corner art → bigger corner
//    slice (160px) so the corners don't get cropped, and `round` repeat so the
//    edge ornament tiles cleanly instead of squashing into a smear.
//  - `nebula_swirl` and `glitch_rgb` are painterly / continuous, so `stretch`
//    with a smaller slice reads fine.
//  - `electric_arc` uses `round` so the arc nodes stay shaped at the corners.
//
// All frames drop the `fill` keyword — the painted centre is discarded so the
// row content underneath reads cleanly (the previous `fill` was what caused
// the orange smear across the centre of Eclipse Crown).
export const LB_FRAME_STYLES = {
    lb_frame_gold_filigree:  { slice: '160 320 160 320', repeat: 'round',   anim: 'lb-frame-glow-gold'    },
    lb_frame_electric_arc:   { slice: '140 280 140 280', repeat: 'round',   anim: 'lb-frame-arc-flicker'  },
    lb_frame_nebula_swirl:   { slice: '120 280 120 280', repeat: 'stretch', anim: 'lb-frame-nebula-drift' },
    lb_frame_glitch_rgb:     { slice: '120 280 120 280', repeat: 'stretch', anim: 'lb-frame-glitch-pulse' },
    lb_frame_eclipse_crown:  { slice: '180 340 180 340', repeat: 'round',   anim: 'lb-frame-eclipse-glow' },
};

export function getLBFrameStyle(frameId) {
    return LB_FRAME_STYLES[frameId] || { slice: '120 320 120 320', repeat: 'stretch', anim: '' };
}