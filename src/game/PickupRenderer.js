import { getGoldTier, getXpTier, drawGoldByTier, drawXpByTier, cachedRadialGlow } from './PickupTiers.js';

// P5 2026-08-03 — the six glows below were rebuilt per pickup per frame. They
// are constant, so they now come from the shared cache in PickupTiers.js. The
// keys are string literals: nothing is allocated on the hot path. Colours,
// radii and stops are byte-for-byte what they were.

// Desktop = no coarse pointer (no touchscreen). Cached once per module load —
// browsers don't change pointer type at runtime in practice.
const IS_DESKTOP = typeof window !== 'undefined'
    && window.matchMedia
    && !window.matchMedia('(pointer: coarse)').matches;

// Unified pickup scale across all devices — used to be 1.5× desktop / 1.15×
// mobile, which made the same pickup look different on phone vs PC. Now a
// single value so a shield looks like a shield everywhere.
const PICKUP_SCALE = 1.35;

// Layer filter — draw only a subset of pickup types per pass so we can stack
// XP/gold BELOW enemy projectiles and main power-up pickups ABOVE them. Lets
// the player track dangerous enemy bullets through XP/gold litter while still
// keeping rare drops like magnets/shields/relic fragments visible above the chaos.
//   'minor'  → xp + gold + reroll (low-value, draw lower)
//   'major'  → everything else (power-ups, fragments, custom icons — draw top)
//   undefined → all pickups (legacy behaviour)
const MINOR_PICKUP_TYPES = new Set(['xp', 'gold', 'reroll']);

// P1 2026-08-03 — pickups were never viewport-culled, and this function was
// called twice per frame, each call doing filter → spread → sort over the WHOLE
// pickup array. Late in a run that array is long and most of it is off screen.
// One pass now does layer filtering and culling together, then sorts only what
// will actually be drawn. Margin covers the largest pickup icon comfortably.
const PICKUP_CULL_MARGIN = 80;
const PICKUP_DRAW_ORDER = { gold: 0, reroll: 1, xp: 2 };

export function drawPickups(ctx, pickups, time, layer, camX, camY, vWidth, vHeight) {
    const cullOn = Number.isFinite(camX) && vWidth > 0 && vHeight > 0;
    const minX = camX - PICKUP_CULL_MARGIN, maxX = camX + vWidth + PICKUP_CULL_MARGIN;
    const minY = camY - PICKUP_CULL_MARGIN, maxY = camY + vHeight + PICKUP_CULL_MARGIN;

    const sorted = [];
    for (let i = 0; i < pickups.length; i++) {
        const p = pickups[i];
        const isMinor = MINOR_PICKUP_TYPES.has(p.type);
        if (layer === 'minor' && !isMinor) continue;
        if (layer === 'major' && isMinor) continue;
        if (cullOn && (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY)) continue;
        sorted.push(p);
    }
    sorted.sort((a, b) => (PICKUP_DRAW_ORDER[a.type] ?? 1) - (PICKUP_DRAW_ORDER[b.type] ?? 1));

    sorted.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        
        if (p.type === 'xp') {
            // 4 tiers: shard (<5) → crystal (5-19) → cluster (20-99) → shard core (100+).
            // Each tier is a *different shape* — not just bigger.
            ctx.scale(PICKUP_SCALE, PICKUP_SCALE);
            drawXpByTier(ctx, getXpTier(p.value || 1), time, p.color);

        } else if (p.type === 'gold') {
            // 5 tiers: coin (<10) → coin stack (10-49) → money bag (50-199)
            //          → treasure chest (200-999) → pile of gold (1000+).
            // Each tier is a different icon — silhouette tells you the value at a glance.
            ctx.scale(PICKUP_SCALE, PICKUP_SCALE);
            drawGoldByTier(ctx, getGoldTier(p.value || 1), time);
            
        } else if (p.type === 'fragment') {
            const bounce = Math.sin(time * 5 + p.x) * 3;
            ctx.translate(0, bounce);
            ctx.rotate(time * 1.5);

            // Outer purple glow
            ctx.globalCompositeOperation = 'screen';
            const grad = cachedRadialGlow(ctx, 'pk_frag', 30, 'rgba(168, 85, 247, 0.7)', null, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, 30, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalCompositeOperation = 'source-over';

            // Crystal shard shape (diamond)
            ctx.fillStyle = '#a855f7';
            ctx.beginPath();
            ctx.moveTo(0, -14);
            ctx.lineTo(10, -2);
            ctx.lineTo(7, 14);
            ctx.lineTo(-7, 14);
            ctx.lineTo(-10, -2);
            ctx.closePath();
            ctx.fill();

            // Inner highlight
            ctx.fillStyle = '#d8b4fe';
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(5, -1);
            ctx.lineTo(0, 8);
            ctx.lineTo(-5, -1);
            ctx.closePath();
            ctx.fill();

            // Sparkle
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(-3, -6, 1.5, 0, Math.PI * 2);
            ctx.fill();

        } else if (p.type === 'reroll') {
            const bounce = Math.sin(time * 6 + p.x) * 4;
            ctx.translate(0, bounce);
            ctx.rotate(Math.sin(time * 3 + p.y) * 0.3);
            
            ctx.globalCompositeOperation = 'screen';
            const grad = cachedRadialGlow(ctx, 'pk_reroll', 28, 'rgba(255, 0, 255, 0.6)', null, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, 28, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#ff00ff';
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const a = (Math.PI * 2 / 5) * i - Math.PI/2;
                ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
            }
            ctx.closePath();
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('R', 0, 1);
            
        } else if (p.type === 'nuke') {
            const bounce = Math.sin(time * 6 + p.x) * 4;
            ctx.translate(0, bounce);

            // Red danger glow
            ctx.globalCompositeOperation = 'screen';
            const grad = cachedRadialGlow(ctx, 'pk_nuke', 32, 'rgba(255, 50, 50, 0.8)', null, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, 32, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalCompositeOperation = 'source-over';

            // Pulsing outer ring
            const pulse = 1 + Math.sin(time * 8) * 0.15;
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 16 * pulse, 0, Math.PI * 2);
            ctx.stroke();

            // Yellow warning disc
            ctx.fillStyle = '#ffeb00';
            ctx.beginPath();
            ctx.arc(0, 0, 13, 0, Math.PI * 2);
            ctx.fill();

            // Black radiation trefoil
            ctx.fillStyle = '#000000';
            // Center dot
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fill();
            // 3 blades
            for (let i = 0; i < 3; i++) {
                const a = (Math.PI * 2 / 3) * i - Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, 11, a - 0.5, a + 0.5);
                ctx.closePath();
                ctx.fill();
            }

        } else if (p.type === 'magnet_power') {
            const bounce = Math.sin(time * 6 + p.x) * 4;
            ctx.translate(0, bounce);

            // Magnets used to blend into the dark space background — players (Anubis 2026-05-07)
            // reported losing them on screen. Bumped glow size, added a pulsing outer ring,
            // and scaled the icon up ~30% so they read clearly through busy combat.
            const pulse = 1 + Math.sin(time * 6) * 0.15;

            ctx.globalCompositeOperation = 'screen';
            const grad = cachedRadialGlow(ctx, 'pk_magnet', 42, 'rgba(120, 170, 255, 0.95)', 'rgba(80, 130, 255, 0.6)', 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, 42, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalCompositeOperation = 'source-over';

            // Pulsing cyan outer ring — high-contrast against any background
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 18 * pulse, 0, Math.PI * 2);
            ctx.stroke();

            // Horseshoe magnet — red top, blue bottom (scaled ~1.3×)
            ctx.lineWidth = 6;
            ctx.lineCap = 'butt';
            ctx.strokeStyle = '#dc2626';
            ctx.beginPath();
            ctx.arc(0, 2, 12, Math.PI, Math.PI * 1.5);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 2, 12, Math.PI * 1.5, 0);
            ctx.stroke();

            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 6;
            // Pole tips
            ctx.beginPath();
            ctx.moveTo(-12, 2); ctx.lineTo(-12, 12);
            ctx.moveTo(12, 2); ctx.lineTo(12, 12);
            ctx.stroke();

        } else if (p.type === 'shield_power') {
            // Matches the Shield Overcharge card art: silver outer rim,
            // red heater-shield body with a vertical seam highlight + pulsing
            // cyan glow so it pops against busy combat backgrounds.
            const bounce = Math.sin(time * 6 + p.x) * 4;
            ctx.translate(0, bounce);

            const pulse = 1 + Math.sin(time * 6) * 0.15;

            // Cyan outer glow
            ctx.globalCompositeOperation = 'screen';
            const grad = cachedRadialGlow(ctx, 'pk_shield', 34, 'rgba(120, 200, 255, 0.85)', null, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, 34, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalCompositeOperation = 'source-over';

            // Pulsing cyan ring — visual consistency with magnet/nuke
            ctx.strokeStyle = '#7dd3fc';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 19 * pulse, 0, Math.PI * 2);
            ctx.stroke();

            // Heater shield silhouette path (reused for rim + body + clip)
            const shieldPath = () => {
                ctx.beginPath();
                ctx.moveTo(0, -14);
                ctx.lineTo(12, -9);
                ctx.lineTo(12, 4);
                ctx.quadraticCurveTo(12, 13, 0, 16);
                ctx.quadraticCurveTo(-12, 13, -12, 4);
                ctx.lineTo(-12, -9);
                ctx.closePath();
            };

            // Silver outer rim
            ctx.fillStyle = '#e5e7eb';
            shieldPath();
            ctx.fill();

            // Red shield body (inset)
            ctx.fillStyle = '#dc2626';
            ctx.beginPath();
            ctx.moveTo(0, -11);
            ctx.lineTo(9, -7);
            ctx.lineTo(9, 3);
            ctx.quadraticCurveTo(9, 10, 0, 12);
            ctx.quadraticCurveTo(-9, 10, -9, 3);
            ctx.lineTo(-9, -7);
            ctx.closePath();
            ctx.fill();

            // Vertical seam highlight down the center
            ctx.fillStyle = '#fca5a5';
            ctx.fillRect(-0.8, -10, 1.6, 21);

            // Dark outline on the rim for definition
            ctx.strokeStyle = '#1f2937';
            ctx.lineWidth = 1.2;
            shieldPath();
            ctx.stroke();

        } else if (p.icon) {
            ctx.font = '42px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Pre-rendered glow behind icon
            ctx.globalCompositeOperation = 'screen';
            const grad = cachedRadialGlow(ctx, 'pk_icon', 30, 'rgba(255, 255, 255, 0.6)', null, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, 30, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';

            ctx.fillText(p.icon, 0, 0);
        } else {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.rect(-7, -7, 14, 14);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    });
}