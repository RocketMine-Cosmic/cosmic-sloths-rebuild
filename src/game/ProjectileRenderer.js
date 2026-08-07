const glowCache = {};
// Quantize radius to 16px buckets so an expanding pulse (radius grows 500px/s)
// doesn't generate a fresh glow texture every frame. Without this, a single
// Nova Pulse / Laser Nova / Quantum Collapse pulse could cache ~30+ unique
// large canvases per shot, eventually OOM'ing the canvas allocator on mobile
// and crashing the run when the synergy fires (ReZuM bug 2026-05-18).
const RADIUS_QUANT = 16;
// Cap the cached texture size — pulses with high area stacking could allocate
// 2000×2000 canvases, which on mobile silently fails canvas creation and
// returns a broken context → drawImage throws and the run crashes.
const MAX_GLOW_SIZE = 512;
// P2 2026-08-03 — the OOM this file's header was written to prevent, arriving by
// a different route. Above quantR 208 the SIZE always clamps to MAX_GLOW_SIZE,
// but the cache KEY still varied per 16px bucket — so one Nova Pulse sweep
// (radius grows 500px/s, well past 208) cached ~14 byte-identical 512x512
// canvases for a single colour, roughly 14 MB, module-level and never evicted.
// Clamping the key as well as the size collapses all of those to one entry.
// 208 = the first 16px bucket at or above MAX_GLOW_SIZE / 2.5.
const MAX_QUANT_R = Math.ceil((MAX_GLOW_SIZE / 2.5) / RADIUS_QUANT) * RADIUS_QUANT;

// ── Shared VFX knobs (2026-08-03) ────────────────────────────────────────────
// Every non-AoE projectile gets the aura below BEFORE its own branch, so these
// two numbers set the additive load for the entire game. This is what makes the
// screen go white at high level, far more than particle count: once a projectile
// reaches radius ~68px the glow texture clamps to a full 512x512 additive blob,
// and Laser Nova alone keeps 20-40 of those in flight. Six DIFFERENTLY coloured
// additive blobs still composite to white, so tinting does not fix it — area and
// alpha do. Tune here, never in the branch.
const AURA_MULT = 1.8;   // was 3   - roughly a third of the additive area
const AURA_ALPHA = 0.22; // was 0.4

// P4/C4 2026-08-03 — the ceiling that did not exist. Before this, every branch
// had its own hardcoded radius multiplier between 2.5x and 12x with nothing
// stopping it, so area stacking scaled the DRAWING as well as the hitbox:
// supernovaBeam's tail reached ~1780px (about a full screen width), the railgun
// slash drew at radius * 12, and the damage-radius indicator ring was stroked
// uncapped at up to 2480px across for quantumCollapse. None of that is visible
// — it is off screen — but it is all rasterised, every frame, additively.
// This is a half-extent: the furthest anything should be drawn from a
// projectile's centre. Hitboxes are never clamped by it.
const MAX_DRAW_EXTENT = 900;
const clampExtent = (v) => (v > MAX_DRAW_EXTENT ? MAX_DRAW_EXTENT : v);
function getGlowTexture(color, radius) {
    if (radius <= 0) return null;
    const quantR = Math.min(
        MAX_QUANT_R,
        Math.max(RADIUS_QUANT, Math.round(radius / RADIUS_QUANT) * RADIUS_QUANT)
    );
    const key = `${color}_${quantR}`;
    if (glowCache[key]) return glowCache[key];
    
    let size = Math.ceil(quantR * 2.5); // Provide enough padding for glow
    if (size <= 0) return null;
    if (size > MAX_GLOW_SIZE) size = MAX_GLOW_SIZE;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null; // Mobile canvas allocation can silently fail
    
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0, color);
    grad.addColorStop(0.2, color);
    grad.addColorStop(1, 'transparent');
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
    ctx.fill();
    
    glowCache[key] = canvas;
    return canvas;
}

export function drawProjectiles(ctx, projectiles, particleManager, time, camX, camY, vWidth, vHeight) {
    ctx.globalCompositeOperation = 'screen';
    const texStar = particleManager?.textures?.star;
    const texSlash = particleManager?.textures?.slash;
    const texShockwave = particleManager?.textures?.shockwave;
    const texSmoke = particleManager?.textures?.smoke;

    // P1 2026-08-03 — this function has ALWAYS accepted camX/camY/vWidth/vHeight
    // and never read them: a grep for camX in this file returned the parameter
    // list and nothing else. Everything off screen was drawn in full, including
    // per-frame gradient construction for long-lived pools (life up to 15s) that
    // the player walked away from ten seconds ago. The enemy loop in
    // GameEngineDraw already does this correctly; this is the same pattern.
    //
    // The margin is deliberately generous. Several branches draw far outside the
    // hitbox — the railgun slash is radius * 12, which is the worst case — so a
    // tight margin would pop effects at the screen edge. Culling small, numerous
    // projectiles is where the win is; big ones keep a big margin and are few.
    const cullOn = Number.isFinite(camX) && vWidth > 0 && vHeight > 0;
    const DRAW_EXTENT_MULT = 12;

    projectiles.forEach(p => {
        if (cullOn) {
            const m = (p.visualMaxRadius || p.visualRadius || p.radius || 0) * DRAW_EXTENT_MULT + 64;
            if (p.x < camX - m || p.x > camX + vWidth + m ||
                p.y < camY - m || p.y > camY + vHeight + m) return;
        }
        // Decouple visual radius from damage radius. AoE weapons with S6 visual caps
        // set `p.visualRadius` (separate from `p.radius` damage hitbox) so the drawn
        // bubble stays readable while area upgrades continue to expand the actual AoE.
        // Non-AoE projectiles never set visualRadius and render at full damage radius.
        const originalRadius = p.radius;
        const hasVisualCap = p.visualRadius != null && p.visualRadius < p.radius;
        if (hasVisualCap) {
            // Faint outline ring showing the TRUE damage radius — so players can see
            // their area upgrades are actually working even when the drawn bubble is
            // capped for readability (Texxy feedback 2026-05-18).
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.25;
            ctx.strokeStyle = p.color || '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 10]);
            ctx.lineDashOffset = -time * 20;
            ctx.beginPath();
            // C4: clamped. This ring exists to prove area upgrades are working
            // (Texxy 2026-05-18), but past MAX_DRAW_EXTENT it is entirely off
            // screen, so the player learns nothing from the extra thousand pixels
            // of stroked arc — they just pay for it.
            ctx.arc(p.x, p.y, clampExtent(p.radius), 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
            p.radius = p.visualRadius;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.vx || p.vy) {
            ctx.rotate(Math.atan2(p.vy, p.vx));
        }
        
        const isElongated = p.type === 'beam' || p.type === 'dual_laser' || p.type === 'supernova_beam' || p.type === 'missile' || p.type === 'railgun' || p.type === 'blaster_shot';

        // High Quality Glowing Aura (Pre-rendered).
        // Skip for buzzsaw blades — at high area stacking, multiple blades each with
        // a 3× radius aura whited out the entire screen (Anubis bug 2026-05-14).
        // The blades' own spike rendering + white core already give them plenty of
        // visual punch without the additive halo.
        if (!p.isAoe && p.type !== 'buzzsaw') {
            ctx.globalCompositeOperation = 'lighter';
            const auraRadius = Math.max(0.1, p.radius * AURA_MULT);
            
            ctx.globalAlpha = AURA_ALPHA;
            
            if (isElongated) {
                // For elongated, we scale the pre-rendered circle
                const glow = getGlowTexture(p.color || '#ffffff', auraRadius);
                if (glow) {
                    ctx.save();
                    ctx.scale(1.2, 0.6);
                    ctx.drawImage(glow, -glow.width/2, -glow.height/2);
                    ctx.restore();
                }
                
                // Tail (Pre-rendered or simple shape)
                // C4 2026-08-03 — two bugs here. The gradient ran to -auraRadius*2
                // but the triangle ran to -auraRadius*2.5, so the last fifth of the
                // shape was filled with the gradient's final stop: transparent.
                // Pure rasterisation cost for nothing visible. The two now agree,
                // and the length is clamped — on supernovaBeam this tail reached
                // roughly a full screen width.
                const tailLen = clampExtent(auraRadius * 2);
                const tailGrad = ctx.createLinearGradient(0, 0, -tailLen, 0);
                tailGrad.addColorStop(0, p.color || '#ffffff');
                tailGrad.addColorStop(1, 'transparent');
                ctx.fillStyle = tailGrad;
                ctx.globalAlpha = 0.3;
                ctx.beginPath();
                ctx.moveTo(0, auraRadius * 0.4);
                ctx.lineTo(-tailLen, 0);
                ctx.lineTo(0, -auraRadius * 0.4);
                ctx.fill();
            } else {
                const glow = getGlowTexture(p.color || '#ffffff', auraRadius);
                if (glow) {
                    ctx.drawImage(glow, -glow.width/2, -glow.height/2);
                }
            }
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'screen';
        }

        if (p.type === 'blaster_shot') {
            // C5 2026-08-03 — same white-core problem as the default branch: the
            // gradient handed 20% to white before the colour started, then a solid
            // white ellipse was painted over the middle at radius * 1.2. Colour now
            // starts at 0.08 and the solid core is halved, so the shot reads as its
            // weapon colour with a white centre rather than white with a fringe.
            ctx.globalCompositeOperation = 'lighter';
            const grad = ctx.createLinearGradient(p.radius, 0, -p.radius * 3, 0);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.08, p.color || '#00ffff');
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.ellipse(-p.radius * 0.5, 0, Math.max(0.1, p.radius * 2.5), Math.max(0.1, p.radius * 1.2), 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.ellipse(0, 0, Math.max(0.1, p.radius * 0.6), Math.max(0.1, p.radius * 0.35), 0, 0, Math.PI * 2); ctx.fill();
            if (texStar && texStar.isReady) {
                ctx.globalAlpha = 0.4;
                ctx.drawImage(texStar, -p.radius * 3, -p.radius * 3, p.radius * 6, p.radius * 6);
                ctx.globalAlpha = 1.0;
            }
            ctx.globalCompositeOperation = 'screen';
        // C13 2026-08-03 — three dead branches deleted here: 'wrench_swing',
        // 'blade_swing' and 'grenade_explosion'. A repo-wide grep found those
        // three strings in this file and NOWHERE else — no weapon, system or
        // particle emitter has ever produced one. 'blade_swing' was also a live
        // crash waiting for an emitter: it called getGlowTexture(p.color, …)
        // without the `|| '#ffffff'` fallback every other call site uses, so a
        // null colour would have thrown and killed the whole projectile pass for
        // that frame. Removing them also fixes the "how additive is this file"
        // count, which they were skewing by three.
        } else if (p.type === 'beam' || p.type === 'dual_laser') {
            ctx.globalCompositeOperation = 'lighter';
            const trailGrad = ctx.createLinearGradient(p.radius, 0, -p.radius * 4, 0);
            trailGrad.addColorStop(0, '#ffffff');
            trailGrad.addColorStop(0.2, p.color || '#00ffff');
            trailGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = trailGrad;
            ctx.beginPath(); ctx.ellipse(-p.radius, 0, p.radius * 3.5, p.radius * 1.2, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.ellipse(0, 0, p.radius * 1.5, p.radius * 0.4, 0, 0, Math.PI * 2); ctx.fill();
            if (texSlash && texSlash.isReady) {
                ctx.globalAlpha = 0.9;
                ctx.drawImage(texSlash, -p.radius * 4, -p.radius * 2, p.radius * 8, p.radius * 4);
                ctx.globalAlpha = 1.0;
            }
            ctx.globalCompositeOperation = 'screen';
        } else if (p.type === 'lightning') {
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = '#ffffff';
            const pathPoints = [
                {x: -p.radius * 1.5, y: 0},
                {x: -p.radius*0.5, y: (Math.random()-0.5)*p.radius*1.5},
                {x: p.radius*0.5, y: (Math.random()-0.5)*p.radius*1.5},
                {x: p.radius * 1.5, y: 0}
            ];
            
            // Draw glow instead of shadowBlur
            const glow = getGlowTexture(p.color || '#00aaff', p.radius * 2);
            if (glow) {
                ctx.globalAlpha = 0.6;
                pathPoints.forEach(pt => ctx.drawImage(glow, pt.x - glow.width/2, pt.y - glow.height/2));
                ctx.globalAlpha = 1.0;
            }
            
            ctx.lineWidth = Math.max(2, p.radius * 0.4);
            ctx.beginPath();
            ctx.moveTo(pathPoints[0].x, pathPoints[0].y);
            ctx.lineTo(pathPoints[1].x, pathPoints[1].y);
            ctx.lineTo(pathPoints[2].x, pathPoints[2].y);
            ctx.lineTo(pathPoints[3].x, pathPoints[3].y);
            ctx.stroke();
            ctx.strokeStyle = p.color || '#00aaff';
            ctx.lineWidth = Math.max(1, p.radius * 0.8);
            ctx.stroke();
            ctx.globalCompositeOperation = 'screen';
        } else if (p.type === 'glitch_slash') {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = '#ffffff'; 
            const glow = getGlowTexture(p.color || '#00ff00', p.radius * 2);
            if (glow) {
                ctx.globalAlpha = 0.7;
                ctx.save();
                ctx.scale(2, 0.5);
                ctx.drawImage(glow, -glow.width/2, -glow.height/2);
                ctx.restore();
                ctx.globalAlpha = 1.0;
            }
            ctx.beginPath(); ctx.ellipse(0, 0, p.radius * 2, p.radius*0.4, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = p.color || '#00ff00';
            for(let i=0; i<3; i++) {
                ctx.fillRect((Math.random()-0.5)*p.radius*3, (Math.random()-0.5)*p.radius, p.radius*0.8, p.radius*0.2);
            }
            ctx.globalCompositeOperation = 'screen';
        } else if (p.type === 'stomp') {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = p.color || '#ff00ff';
            ctx.globalAlpha = 0.5;
            ctx.beginPath(); ctx.arc(0, 0, p.radius, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.arc(0, 0, p.radius * 0.8, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
            if (texShockwave && texShockwave.isReady) {
                ctx.globalAlpha = 0.7;
                ctx.drawImage(texShockwave, -p.radius * 1.5, -p.radius * 1.5, p.radius * 3, p.radius * 3);
            }
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'screen';
        } else if (p.type === 'repair_beam') {
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = p.color || '#00ffcc';
            ctx.lineWidth = 6;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-p.radius, 0);
            ctx.lineTo(p.radius, 0);
            ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.globalCompositeOperation = 'screen';
        } else if (p.type === 'missile') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#2a2a35';
            ctx.beginPath();
            ctx.moveTo(p.radius * 1.8, 0);
            ctx.lineTo(-p.radius, p.radius * 0.9);
            ctx.lineTo(-p.radius * 0.4, 0);
            ctx.lineTo(-p.radius, -p.radius * 0.9);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = p.color || '#ff4400';
            ctx.beginPath();
            ctx.moveTo(p.radius * 1.2, 0);
            ctx.lineTo(-p.radius * 0.2, p.radius * 0.4);
            ctx.lineTo(0, 0);
            ctx.lineTo(-p.radius * 0.2, -p.radius * 0.4);
            ctx.closePath();
            ctx.fill();
            ctx.globalCompositeOperation = 'lighter';
            const thrust = ctx.createLinearGradient(-p.radius * 0.4, 0, -p.radius * 3.5, 0);
            thrust.addColorStop(0, '#ffffff');
            thrust.addColorStop(0.2, '#ffaa00');
            thrust.addColorStop(1, 'transparent');
            ctx.fillStyle = thrust;
            ctx.beginPath();
            ctx.ellipse(-p.radius * 1.5, 0, p.radius * 2 + Math.random() * p.radius, p.radius * 0.7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'screen';
        } else if (p.type === 'data_pulse' || p.type === 'phantom_orb') {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = p.color || '#00ff00';
            ctx.globalAlpha = 0.6;
            ctx.beginPath(); ctx.arc(0, 0, p.radius, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 1.0;
            ctx.beginPath(); ctx.arc(0, 0, p.radius * 0.4, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = p.color || '#00ff00';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i + time * 5;
                const px = Math.cos(angle) * p.radius * 1.2;
                const py = Math.sin(angle) * p.radius * 1.2;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'screen';
        } else if (p.type === 'railgun') {
            ctx.globalCompositeOperation = 'lighter';
            const railGrad = ctx.createLinearGradient(p.radius * 2, 0, -p.radius * 6, 0);
            railGrad.addColorStop(0, '#ffffff');
            railGrad.addColorStop(0.1, p.color || '#00aaff');
            railGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = railGrad;
            ctx.beginPath(); ctx.ellipse(-p.radius, 0, p.radius * 5, p.radius * 1.5, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.ellipse(0, 0, p.radius * 3, p.radius * 0.4, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            for(let i=0; i<4; i++) {
                const offset = (time * 400 + i * 15) % (p.radius * 4);
                ctx.beginPath();
                ctx.ellipse(-p.radius * 2.5 + offset, 0, p.radius * 0.5, p.radius * 1.8, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
            if (texSlash && texSlash.isReady) {
                // C4: was a flat p.radius * 12 — the largest multiplier in the file.
                ctx.globalAlpha = 0.8;
                const sx = clampExtent(p.radius * 6), sy = clampExtent(p.radius * 3);
                ctx.drawImage(texSlash, -sx, -sy, sx * 2, sy * 2);
                ctx.globalAlpha = 1.0;
            }
            ctx.globalCompositeOperation = 'screen';
        } else if (p.type === 'sonic_wave') {
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = p.color || '#00ffff';
            ctx.lineWidth = Math.max(2, p.radius * 0.2);
            ctx.lineCap = 'round';
            for(let i=0; i<3; i++) {
                ctx.globalAlpha = 1 - (i * 0.3);
                ctx.beginPath();
                ctx.arc(0, 0, p.radius - (i * p.radius * 0.3), -Math.PI/2.5, Math.PI/2.5);
                ctx.stroke();
            }
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'screen';
        } else if (p.type === 'supernova_beam') {
            // C5 2026-08-03 — the white core here spanned radius * 2.5 against a
            // coloured body of radius * 3.5, so 70% of the beam's length was pure
            // additive white. Core pulled back to 1.2 and the star overlay halved.
            // C4: the drawn extents are clamped — this is the widest-drawing
            // projectile in the game and its aura tail was the worst offender.
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = p.color || '#ffaa00';
            ctx.beginPath(); ctx.ellipse(0, 0, clampExtent(p.radius * 3.5), clampExtent(p.radius * 1.2), 0, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.ellipse(0, 0, clampExtent(p.radius * 1.2), clampExtent(p.radius * 0.3), 0, 0, Math.PI * 2); ctx.fill();
            if (texStar && texStar.isReady) {
                ctx.globalAlpha = 0.4;
                const ss = clampExtent(p.radius * 3);
                ctx.drawImage(texStar, -ss, -ss, ss * 2, ss * 2);
            }
            ctx.globalCompositeOperation = 'screen';
        } else if (p.type === 'shield_bubble' || p.type === 'burning_barrier') {
            ctx.globalCompositeOperation = 'screen'; // Use screen instead of lighter to prevent intense whiteout
            ctx.globalAlpha = Math.min(1, p.life * 2) * 0.08; // Much lower center alpha
            
            ctx.fillStyle = p.color || '#ffffff';
            
            if (p.type === 'shield_bubble') {
                // Shield Bubble: Rotating dashed ring with minimal center fill.
                // Outline alpha 0.8→0.4 + dash speed 50→20 — Texxy flagged the
                // mastered (yellow #ffd700) bubble as bright/flickering and unsafe
                // for epileptic players when multiple bubbles overlap (additive
                // `screen` blend stacks alpha into near-white strobing).
                ctx.beginPath();
                ctx.arc(0, 0, Math.max(0.1, p.radius), 0, Math.PI*2);
                ctx.fill();
                
                ctx.globalAlpha = Math.min(1, p.life * 2) * 0.4;
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 2;
                ctx.setLineDash([15, 20]);
                ctx.lineDashOffset = -time * 20;
                ctx.beginPath();
                ctx.arc(0, 0, Math.max(0.1, p.radius), 0, Math.PI*2);
                ctx.stroke();
                ctx.setLineDash([]);

                // Defined shape outline — Mustard 2026-07-05 reported bubble was
                // "invisible" on dark cosmic backgrounds (esp. NeonVortex whose
                // areaMult 0.7× shrinks the ring to ~56px at Lv1). The screen-
                // blended dashed ring above disappears against purple nebulae.
                // Fix: a thin source-over solid outline is always visible
                // regardless of background, but stays non-strobing (single-pass
                // source-over doesn't compound when bubbles overlap, unlike the
                // additive layers). Alpha capped modest so it doesn't reintroduce
                // the epilepsy issue.
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = Math.min(1, p.life * 2) * 0.75;
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(0, 0, Math.max(0.1, p.radius), 0, Math.PI*2);
                ctx.stroke();
                ctx.globalCompositeOperation = 'screen';
            } else {
                // Burning Barrier: Hexagon shape so it's instantly distinct from circles.
                // Outline alpha 0.9→0.5 + dash speed 60→25 — same epilepsy-safety
                // pass as shield_bubble (Texxy 2026-05-20).
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle = (Math.PI / 3) * i + time;
                    const px = Math.cos(angle) * p.radius;
                    const py = Math.sin(angle) * p.radius;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();

                ctx.globalAlpha = Math.min(1, p.life * 2) * 0.5;
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 3;
                ctx.setLineDash([20, 10]);
                ctx.lineDashOffset = time * 25;
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.globalAlpha = 1.0;
        } else if (p.type === 'buzzsaw') {
            // Rotation speed cut 15 → 6 (2026-06-05, Anubis video). At 15 rad/s
            // × 7 overlapping swarm blades the spike edges created a flickering
            // moiré pattern that strained the eyes. 6 rad/s still reads as
            // "spinning fast" without the strobe.
            // FIXED 2026-08-03 — the 6 rad/s cap described above never ran.
            // ProjectileSystem:64 sets p.rotation every frame from rotSpeed (15
            // for bouncingBlade, 25 for buzzsawSwarm), so `p.rotation || time * 6`
            // took the accumulator branch from frame two onward and the blades
            // kept strobing for the whole 4s life. Scaling the accumulator to an
            // effective 6 rad/s keeps each blade's own phase (they spawn at
            // different times, so they stay desynced) without the moire.
            // The `p.vx < 0` mirror is dropped as well: it negated a CONTINUOUSLY
            // GROWING accumulator, so the drawn angle snapped to a mirrored
            // position on every horizontal bounce - a visible pop per ricochet.
            ctx.rotate((p.rotation || 0) * (6 / (p.rotSpeed || 6)));
            // Use source-over (normal blending) for the blade body so overlapping
            // saws don't stack additively to pure white (Texxy bug 2026-05-14 —
            // 11 saws on screen looked like a stream of bright shurikens).
            // Chrome body + dark outline gives a readable metallic silhouette;
            // the white core is kept tiny + additive for a single hot highlight.
            ctx.globalCompositeOperation = 'source-over';
            // Swarm variant: 10 → 8 spikes (matches base blade). 10 spikes at
            // high rotation produced the moiré flicker reported on the swarm.
            const spikes = 8;
            ctx.beginPath();
            for (let i = 0; i < spikes * 2; i++) {
                const a = (Math.PI * 2 / (spikes * 2)) * i;
                const r = i % 2 === 0 ? p.radius : p.radius * 0.55;
                if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            // Honour p.color so mastery is actually visible. WeaponSystem:849
            // sets '#888888' -> '#c0c0c0' on mastery - the "(Silver Blade)" that
            // WEAPONS.bouncingBlade.masteryDesc promises - and :872 sets '#e0e0e0'
            // for the Buzzsaw Swarm evolution. p.color was ignored here, so a
            // player who maxed three upgrades to earn the silver blade saw the
            // blade look exactly the same.
            ctx.fillStyle = p.color || (p.weaponId === 'buzzsawSwarm' ? '#b8bcc4' : '#8a8e96');
            ctx.fill();
            ctx.strokeStyle = '#2a2d33';
            ctx.lineWidth = Math.max(1.5, p.radius * 0.08);
            ctx.stroke();
            // Inner hub ring
            ctx.fillStyle = '#3a3d44';
            ctx.beginPath(); ctx.arc(0, 0, p.radius * 0.35, 0, Math.PI * 2); ctx.fill();
            // Single small additive highlight — alpha 0.7 → 0.35 so overlapping
            // swarm blades don't compound into the eye-straining bright pulse.
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 0.35;
            ctx.beginPath(); ctx.arc(0, 0, p.radius * 0.15, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'screen';
        } else if (p.type === 'toxic_cloud') {
            ctx.globalCompositeOperation = 'source-over';
            
            // Fade in and fade out
            const alpha = Math.min(1, p.life) * 0.35;
            ctx.globalAlpha = alpha;
            
            if (texSmoke && texSmoke.isReady) {
                const tintedSmoke = particleManager.getTintedTexture(texSmoke, p.color);
                const drawTex = (tintedSmoke && tintedSmoke.isReady) ? tintedSmoke : texSmoke;

                // 2026-07-12 (Briantjeuh Discord): 3-layer smoke stack cut FPS from
                // 150 → 60 within 2min of a run. Toxic Cloud clouds stack heavily
                // (spawn at player position on every fire tick, ~15s life) so
                // overdraw multiplies with density. Dropped 3 → 2 layers to match
                // napalm/hellfire/flaming_lash which use the same texture and don't
                // exhibit the FPS collapse. No gameplay impact.
                for(let i=0; i<2; i++) {
                    ctx.save();
                    const rot = time * (0.3 + i * 0.15) * (i % 2 === 0 ? 1 : -1) + p.x;
                    ctx.rotate(rot);
                    const scale = 1.1 + Math.sin(time * 1.5 + i) * 0.15;
                    const r = p.radius * scale;

                    ctx.drawImage(drawTex, -r, -r, r * 2, r * 2);
                    ctx.restore();
                }
            } else {
                ctx.fillStyle = p.color;
                for (let i = 0; i < 2; i++) {
                    ctx.beginPath();
                    ctx.arc(
                        Math.cos(time + i) * p.radius * 0.2, 
                        Math.sin(time + i) * p.radius * 0.2, 
                        p.radius * 0.8, 0, Math.PI*2
                    );
                    ctx.fill();
                }
            }
            
            // Soft boundary
            ctx.globalAlpha = alpha * 1.2;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2;
            ctx.setLineDash([15, 20]);
            ctx.lineDashOffset = -time * 15;
            ctx.beginPath(); ctx.arc(0, 0, p.radius * 0.95, 0, Math.PI*2); ctx.stroke();
            ctx.setLineDash([]);
            
            ctx.globalAlpha = 1.0;
        } else if (p.type === 'aegis_matrix') {
            // Outline alpha 0.8→0.5 + rotation speeds halved — Texxy flagged the
            // gold (#ffd700) bubble as too bright/strobing on `screen` blend when
            // multiple matrices overlap. Calmer rotation + lower alpha = epilepsy-safer.
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.05; // Faint background
            ctx.fillStyle = p.color || '#00ff88';
            ctx.beginPath();
            ctx.arc(0, 0, p.radius, 0, Math.PI*2);
            ctx.fill();
            
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = p.color || '#00ff88';
            ctx.lineWidth = 2;
            
            // Aegis Matrix: Dual rotating octagons (geometric tech pattern)
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const angle = (Math.PI / 4) * i + time * 0.25;
                const px = Math.cos(angle) * p.radius;
                const py = Math.sin(angle) * p.radius;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();

            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const angle = (Math.PI / 4) * i - time * 0.4;
                const px = Math.cos(angle) * (p.radius - 15);
                const py = Math.sin(angle) * (p.radius - 15);
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        } else if (p.type === 'napalm_pool' || p.type === 'flaming_lash_pool' || p.type === 'hellfire') {
            ctx.globalCompositeOperation = 'source-over';
            
            const alpha = Math.min(1, p.life) * (p.type === 'hellfire' ? 0.4 : 0.3);
            ctx.globalAlpha = alpha;
            
            if (texSmoke && texSmoke.isReady) {
                const tintedSmoke = particleManager.getTintedTexture(texSmoke, p.color);
                const drawTex = (tintedSmoke && tintedSmoke.isReady) ? tintedSmoke : texSmoke;
                
                for(let i=0; i<2; i++) {
                    ctx.save();
                    const rot = time * (0.5 + i * 0.2) * (i % 2 === 0 ? 1 : -1) + p.x;
                    ctx.rotate(rot);
                    const scale = 1.0 + Math.sin(time * 2 + i) * 0.1;
                    const r = p.radius * scale;
                    
                    ctx.drawImage(drawTex, -r, -r, r * 2, r * 2);
                    ctx.restore();
                }
            } else {
                ctx.fillStyle = p.color || '#ffffff';
                ctx.beginPath();
                ctx.arc(0, 0, Math.max(0.1, p.radius), 0, Math.PI*2);
                ctx.fill();
            }
            
            ctx.globalAlpha = alpha * 1.5;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.type === 'hellfire' ? 3 : 2;
            
            // Segmented ring instead of a solid blob
            const segments = p.type === 'hellfire' ? 5 : 4;
            const segmentSize = (Math.PI * 2) / segments;
            const gap = 0.4;
            
            for (let i = 0; i < segments; i++) {
                ctx.beginPath();
                ctx.arc(0, 0, Math.max(0.1, p.radius * (0.9 + Math.sin(time * 4 + p.x) * 0.05)), 
                    i * segmentSize + gap/2 + (time * (p.type === 'hellfire' ? 1.5 : 1)), 
                    (i + 1) * segmentSize - gap/2 + (time * (p.type === 'hellfire' ? 1.5 : 1)));
                ctx.stroke();
            }
            ctx.globalAlpha = 1.0;
        } else if (p.type === 'nova_pulse' || p.type === 'laser_nova_pulse' || p.type === 'seismic_shockwave' || p.type === 'quantum_collapse') {
            ctx.globalCompositeOperation = 'screen';
            ctx.strokeStyle = p.color || '#ff00ff';
            ctx.lineWidth = p.type === 'quantum_collapse' ? 4 : Math.max(3, 8 * p.life);
            ctx.globalAlpha = Math.max(0.2, Math.min(1, p.life * 3));
            
            if (p.type === 'nova_pulse' || p.type === 'laser_nova_pulse') {
                const glow = getGlowTexture(p.color || '#ff00ff', p.radius * 1.2);
                if (glow) {
                    ctx.globalAlpha = ctx.globalAlpha * 0.4;
                    ctx.drawImage(glow, -glow.width/2, -glow.height/2);
                    ctx.globalAlpha = ctx.globalAlpha / 0.4;
                }
            }
            
            // Clean shockwave rings
            if (p.type === 'quantum_collapse') {
                ctx.beginPath();
                ctx.arc(0, 0, Math.max(0.1, p.radius), 0, Math.PI*2);
                ctx.stroke();
                
                ctx.lineWidth = 1; // Inner ripple
                ctx.beginPath();
                ctx.arc(0, 0, Math.max(0.1, p.radius * 0.6), 0, Math.PI*2);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.arc(0, 0, Math.max(0.1, p.radius), 0, Math.PI*2);
                ctx.stroke();
            }
            ctx.globalAlpha = 1.0;
        } else if (p.isAoe) {
            ctx.globalCompositeOperation = 'lighter';
            
            // Draw glow instead of shadowBlur
            const glow = getGlowTexture(p.color || '#00ffff', p.radius * 1.5);
            if (glow) {
                ctx.globalAlpha = 0.5;
                ctx.drawImage(glow, -glow.width/2, -glow.height/2);
                ctx.globalAlpha = 1.0;
            }
            
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, p.radius, 0, Math.PI*2);
            ctx.stroke();
            ctx.globalCompositeOperation = 'screen';
        } else {
            // Default projectile - HD Upgrade
            // C5 2026-08-03 — colour never got to communicate anything. The inner
            // 20% was solid #ffffff, additive, over a radius * 2.5 disc, on top of
            // the shared aura. Even weapons with genuinely distinct hues read as a
            // white dot with a thin coloured fringe, which is why the mastery and
            // evolution colours in C6 weren't landing either. White stop pulled in
            // to 0.08 and the colour brought forward to 0.35 so the hue occupies
            // most of the projectile instead of a rim.
            ctx.globalCompositeOperation = 'lighter';
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(0.1, p.radius * 2.5));
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.08, '#ffffff');
            grad.addColorStop(0.35, p.color || '#00ffff');
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(0.1, p.radius * 2.5), 0, Math.PI*2);
            ctx.fill();
            if (texStar && texStar.isReady) {
                // C5: star overlay is a second white pass on top of the white core.
                ctx.globalAlpha = 0.4;
                ctx.drawImage(texStar, -p.radius * 3, -p.radius * 3, p.radius * 6, p.radius * 6);
                ctx.globalAlpha = 1.0;
            }
            ctx.globalCompositeOperation = 'screen';
        }
        ctx.restore();
        p.radius = originalRadius;
    });
    ctx.globalCompositeOperation = 'source-over';
}