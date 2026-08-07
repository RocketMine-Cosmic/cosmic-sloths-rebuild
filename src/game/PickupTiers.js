// Tier definitions for gold and XP pickups.
// Each tier produces a visually distinct icon (not just bigger), so a 1-gold
// pip and a 1000-gold pile read as completely different objects.

// ── Cached local-space glow gradients (P5, 2026-08-03) ─────────────────────
// Every glow in this file and in PickupRenderer.js was a fresh
// createRadialGradient plus two or three addColorStop calls, rebuilt for every
// pickup on every frame. Late in a run a screenful of XP orbs meant dozens of
// allocations per frame for what is really a handful of distinct gradients.
//
// They are all drawn at (0,0) after a translate, so they are position
// independent and cache cleanly. Callers pass an explicit key rather than the
// helper building one from the arguments — the fixed glows can then pass a
// string literal and allocate nothing at all on the hot path.
//
// The cache is dropped whenever the context changes (canvas remount / resize),
// so a gradient can never outlive the context that made it.
const _glowCache = new Map();
let _glowCtx = null;
export function cachedRadialGlow(ctx, key, radius, inner, mid, outer) {
    if (_glowCtx !== ctx) { _glowCache.clear(); _glowCtx = ctx; }
    let g = _glowCache.get(key);
    if (!g) {
        g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        g.addColorStop(0, inner);
        if (mid) g.addColorStop(0.5, mid);
        g.addColorStop(1, outer);
        _glowCache.set(key, g);
    }
    return g;
}

const GOLD_GLOW_R = [16, 20, 22, 26, 30];
// Pre-built strings so the hot path never formats a template literal.
// These were `rgba(255, 215, 0, ${[0.4,0.55,0.65,0.75,0.9][tier]})`.
const GOLD_GLOW_INNER = [
    'rgba(255, 215, 0, 0.4)',
    'rgba(255, 215, 0, 0.55)',
    'rgba(255, 215, 0, 0.65)',
    'rgba(255, 215, 0, 0.75)',
    'rgba(255, 215, 0, 0.9)'
];
const GOLD_GLOW_KEY = ['g0', 'g1', 'g2', 'g3', 'g4'];

export function getGoldTier(value) {
    if (value >= 1000) return 4; // Pile of gold
    if (value >= 200)  return 3; // Treasure chest
    if (value >= 50)   return 2; // Money bag
    if (value >= 10)   return 1; // Coin stack
    return 0;                    // Single coin
}

export function getXpTier(value) {
    if (value >= 100) return 3; // Shard core (orb + orbiting fragments)
    if (value >= 20)  return 2; // Crystal cluster
    if (value >= 5)   return 1; // Faceted crystal
    return 0;                   // Tiny shard
}

// ------- GOLD RENDERERS -------

function drawCoin(ctx, time, scale = 1) {
    ctx.save();
    ctx.scale(scale, scale);
    // Edge
    ctx.fillStyle = '#cc8800';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    // Face
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
    ctx.fill();
    // $ mark
    ctx.fillStyle = '#a86a00';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(-3, -3, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawCoinStack(ctx, time) {
    // Three coins offset vertically — stacked
    const offsets = [4, 0, -4];
    for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(0, offsets[i]);
        // Squashed coin (ellipse) for stack perspective
        ctx.fillStyle = '#cc8800';
        ctx.beginPath();
        ctx.ellipse(0, 0, 11, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.ellipse(0, -1, 10, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.ellipse(-3, -1.5, 2.5, 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawMoneyBag(ctx, time) {
    // Tie at top
    ctx.fillStyle = '#7a4a1a';
    ctx.fillRect(-3, -11, 6, 3);
    // Tie knot
    ctx.fillStyle = '#5a3410';
    ctx.beginPath();
    ctx.moveTo(-4, -8);
    ctx.lineTo(4, -8);
    ctx.lineTo(3, -6);
    ctx.lineTo(-3, -6);
    ctx.closePath();
    ctx.fill();
    // Bag body (round sack)
    ctx.fillStyle = '#c08030';
    ctx.beginPath();
    ctx.moveTo(-4, -6);
    ctx.lineTo(4, -6);
    ctx.bezierCurveTo(13, -3, 13, 11, 0, 12);
    ctx.bezierCurveTo(-13, 11, -13, -3, -4, -6);
    ctx.closePath();
    ctx.fill();
    // Bag highlight
    ctx.fillStyle = '#e0a050';
    ctx.beginPath();
    ctx.ellipse(-4, 2, 2.5, 5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // $ symbol
    ctx.fillStyle = '#fff685';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 4);
}

function drawChest(ctx, time) {
    // Chest body
    ctx.fillStyle = '#6b3410';
    ctx.fillRect(-13, -2, 26, 12);
    // Wood grain bands
    ctx.fillStyle = '#4a2308';
    ctx.fillRect(-13, 1, 26, 1.5);
    ctx.fillRect(-13, 6, 26, 1.5);
    // Lid (slightly open)
    ctx.save();
    ctx.translate(0, -2);
    ctx.rotate(-0.15);
    ctx.fillStyle = '#7a3e15';
    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.lineTo(13, 0);
    ctx.lineTo(13, -3);
    ctx.quadraticCurveTo(0, -10, -13, -3);
    ctx.closePath();
    ctx.fill();
    // Lock band
    ctx.fillStyle = '#3a1c08';
    ctx.fillRect(-1.5, -8, 3, 8);
    ctx.restore();
    // Gold spilling out (yellow glow inside)
    ctx.fillStyle = '#ffe100';
    ctx.beginPath();
    ctx.ellipse(0, -1, 11, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Coins peeking out
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(-5, -2, 2.5, 0, Math.PI * 2);
    ctx.arc(2, -3, 2.2, 0, Math.PI * 2);
    ctx.arc(7, -1, 2, 0, Math.PI * 2);
    ctx.fill();
    // Sparkle on top
    const sparkle = (Math.sin(time * 4) + 1) * 0.5;
    ctx.fillStyle = `rgba(255,255,255,${0.6 + sparkle * 0.4})`;
    ctx.beginPath();
    ctx.arc(4, -7, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Metal corner studs
    ctx.fillStyle = '#d4a040';
    ctx.beginPath();
    ctx.arc(-12, 8, 1.2, 0, Math.PI * 2);
    ctx.arc(12, 8, 1.2, 0, Math.PI * 2);
    ctx.fill();
}

function drawPile(ctx, time) {
    // Mound base
    ctx.fillStyle = '#a86a00';
    ctx.beginPath();
    ctx.ellipse(0, 8, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Coin pile (overlapping coins)
    const coins = [
        [-9, 5, 4], [-3, 3, 4.5], [3, 4, 4], [9, 5, 3.5],
        [-6, 0, 4], [0, -1, 4.5], [6, 0, 4],
        [-2, -5, 4], [3, -6, 3.5],
        [0, -10, 3.5],
    ];
    for (const [cx, cy, r] of coins) {
        ctx.fillStyle = '#cc8800';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(cx, cy - 0.5, r - 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(cx - 1, cy - 1, 0.8, 0, Math.PI * 2);
        ctx.fill();
    }
    // Gem on top (purple)
    ctx.fillStyle = '#a855f7';
    ctx.beginPath();
    ctx.moveTo(-5, -8);
    ctx.lineTo(0, -14);
    ctx.lineTo(5, -8);
    ctx.lineTo(0, -5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e9d5ff';
    ctx.beginPath();
    ctx.moveTo(-2, -9);
    ctx.lineTo(0, -12);
    ctx.lineTo(2, -9);
    ctx.lineTo(0, -7);
    ctx.closePath();
    ctx.fill();
    // Floating sparkles
    for (let i = 0; i < 3; i++) {
        const a = time * 1.5 + i * (Math.PI * 2 / 3);
        const sx = Math.cos(a) * 14;
        const sy = Math.sin(a) * 8 - 4;
        const sa = (Math.sin(time * 5 + i) + 1) * 0.5;
        ctx.fillStyle = `rgba(255,255,255,${0.4 + sa * 0.6})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
        ctx.fill();
    }
}

export function drawGoldByTier(ctx, tier, time) {
    // Subtle bounce on all gold pickups
    const bounce = Math.sin(time * 6) * 2;
    ctx.translate(0, bounce);

    // Glow halo (sized by tier — stays modest, not a balloon)
    const glowR = GOLD_GLOW_R[tier];
    ctx.globalCompositeOperation = 'screen';
    const grad = cachedRadialGlow(ctx, GOLD_GLOW_KEY[tier], glowR, GOLD_GLOW_INNER[tier], null, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    if (tier === 0) drawCoin(ctx, time, 1);
    else if (tier === 1) drawCoinStack(ctx, time);
    else if (tier === 2) drawMoneyBag(ctx, time);
    else if (tier === 3) drawChest(ctx, time);
    else drawPile(ctx, time);
}

// ------- XP RENDERERS -------

function drawShard(ctx, time, color) {
    // Tiny single shard — quick rotating sliver
    ctx.rotate(time * 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(4, 0);
    ctx.lineTo(0, 8);
    ctx.lineTo(-4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -4);
    ctx.lineTo(2, 0);
    ctx.lineTo(0, 4);
    ctx.lineTo(-2, 0);
    ctx.closePath();
    ctx.fill();
}

function drawCrystal(ctx, time, color) {
    // Faceted gemstone with cut lines
    ctx.rotate(time * 1.5);
    // Outer
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, -3);
    ctx.lineTo(6, 11);
    ctx.lineTo(-6, 11);
    ctx.lineTo(-8, -3);
    ctx.closePath();
    ctx.fill();
    // Top facet (lighter)
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, -3);
    ctx.lineTo(0, -3);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    // Cut line
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(0, 11);
    ctx.moveTo(-8, -3); ctx.lineTo(8, -3);
    ctx.stroke();
}

function drawCluster(ctx, time, color) {
    // Three crystals fused, pointing outward from a base
    ctx.rotate(time * 1);
    const shards = [
        { angle: -Math.PI / 2, len: 13 },         // up
        { angle: -Math.PI / 6, len: 11 },         // upper-right
        { angle: Math.PI - Math.PI / 6, len: 11 } // upper-left
    ];
    for (const s of shards) {
        ctx.save();
        ctx.rotate(s.angle + Math.PI / 2);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(3.5, -s.len * 0.6);
        ctx.lineTo(0, -s.len);
        ctx.lineTo(-3.5, -s.len * 0.6);
        ctx.closePath();
        ctx.fill();
        // Highlight edge
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -s.len);
        ctx.lineTo(-3.5, -s.len * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    // Base nub
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 2, 3, 0, Math.PI * 2);
    ctx.fill();
}

function drawShardCore(ctx, time, color) {
    // Glowing orb with orbiting fragments — premium XP feel.
    // Pulsing inner core
    const pulse = 1 + Math.sin(time * 5) * 0.15;
    // Outer aura
    ctx.globalCompositeOperation = 'screen';
    const aura = cachedRadialGlow(ctx, 'sc' + color, 18, color, color + '88', 'transparent');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, 18 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // Solid core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 5 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 3 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Three orbiting shards
    for (let i = 0; i < 3; i++) {
        const a = time * 2 + i * (Math.PI * 2 / 3);
        const ox = Math.cos(a) * 11;
        const oy = Math.sin(a) * 11;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(a);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.lineTo(2, 0);
        ctx.lineTo(0, 3);
        ctx.lineTo(-2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

const XP_GLOW_R = [14, 18, 22, 24];

export function drawXpByTier(ctx, tier, time, color) {
    // Glow halo (modest, doesn't make hitbox feel huge)
    const glowR = XP_GLOW_R[tier];
    ctx.globalCompositeOperation = 'screen';
    const grad = cachedRadialGlow(ctx, 'x' + tier + color, glowR, color, null, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    if (tier === 0) drawShard(ctx, time, color);
    else if (tier === 1) drawCrystal(ctx, time, color);
    else if (tier === 2) drawCluster(ctx, time, color);
    else drawShardCore(ctx, time, color);
}