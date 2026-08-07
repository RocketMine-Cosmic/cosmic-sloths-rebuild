// Renders subtle visual indicators on the player based on currently active buffs
// (from equipped title, permanent upgrades, etc) AND transient gameplay states
// like post-levelup invincibility frames. Kept intentionally lightweight so it
// doesn't compete visually with weapons/effects.
//
// Reads only from `player` — no global state, no save mutation. Pure draw.

export function drawBuffAuras(ctx, player, time) {
    if (!player) return;

    const px = player.x;
    const py = player.y;
    const r = player.radius;

    ctx.save();

    // ---- INVINCIBILITY (post-levelup / revive / mastery iframes) ----
    // Reads from BOTH iFrames and invincibleTimer because different code paths
    // set different fields (level-up exit, emergency revive, mastery dashes).
    // A bright pulsing cyan shield ring + soft inner glow communicates to the
    // player WHY they aren't taking damage — answers the "I don't know if my
    // shield is up" feedback from the 2026-05-22 Discord thread
    // (Simon/Texxy/RocketMine). Drawn BEFORE the titleBuff section so the
    // shield appears even when the player has no equipped-title buffs.
    const iFramesRemaining = Math.max(player.iFrames || 0, player.invincibleTimer || 0);
    if (iFramesRemaining > 0) {
        const pulse = (Math.sin(time * 9) + 1) * 0.5; // fast pulse — communicates urgency
        ctx.globalCompositeOperation = 'source-over';
        // Soft inner glow halo (drawn first, behind the outer ring)
        ctx.globalAlpha = 0.14 + pulse * 0.10;
        const glow = ctx.createRadialGradient(px, py, r * 0.5, px, py, r + 16);
        glow.addColorStop(0, 'rgba(34, 211, 238, 0)');
        glow.addColorStop(0.65, 'rgba(34, 211, 238, 0.6)');
        glow.addColorStop(1, 'rgba(34, 211, 238, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, r + 16, 0, Math.PI * 2);
        ctx.fill();
        // Bright outer ring (drawn on top)
        ctx.globalAlpha = 0.48 + pulse * 0.22;
        ctx.strokeStyle = '#22d3ee'; // cyan-400
        ctx.lineWidth = 2 + pulse * 1.5;
        ctx.beginPath();
        ctx.arc(px, py, r + 6 + pulse * 2, 0, Math.PI * 2);
        ctx.stroke();
    }

    const buff = player.titleBuff || null;
    if (buff) {
        // ---- SPEED: faint cyan motion glow trailing the player ----
        if (buff.speedMult && buff.speedMult > 0) {
            const intensity = Math.min(0.35, buff.speedMult * 8); // caps cleanly
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = intensity * (0.7 + Math.sin(time * 6) * 0.3);
            const grad = ctx.createRadialGradient(px, py, r * 0.5, px, py, r * 2.6);
            grad.addColorStop(0, 'rgba(125, 211, 252, 0.6)'); // sky-300
            grad.addColorStop(1, 'rgba(125, 211, 252, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(px, py, r * 2.6, 0, Math.PI * 2);
            ctx.fill();
        }

        // ---- AREA: dashed circle showing the bonus area radius ----
        if (buff.areaMult && buff.areaMult > 0) {
            // Visualises the buff-only area increase (not full attack range, just the bonus).
            const areaRadius = r + 30 + (buff.areaMult * 200);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 0.35 + Math.sin(time * 2) * 0.1;
            ctx.strokeStyle = '#a78bfa'; // violet-400
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 8]);
            ctx.lineDashOffset = -time * 12;
            ctx.beginPath();
            ctx.arc(px, py, areaRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // ---- REGEN: soft green pulse around the player ----
        if (buff.regen && buff.regen > 0) {
            ctx.globalCompositeOperation = 'lighter';
            const pulse = (Math.sin(time * 2.5) + 1) * 0.5; // 0..1
            const radius = r * 1.4 + pulse * r * 0.6;
            ctx.globalAlpha = 0.18 + pulse * 0.18;
            const grad = ctx.createRadialGradient(px, py, r * 0.8, px, py, radius);
            grad.addColorStop(0, 'rgba(34, 197, 94, 0)');     // green-500 inner transparent
            grad.addColorStop(0.7, 'rgba(34, 197, 94, 0.55)');
            grad.addColorStop(1, 'rgba(34, 197, 94, 0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(px, py, radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // ---- ARMOR: thin metallic ring hugging the player ----
        if (buff.armor && buff.armor > 0) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 0.6;
            ctx.strokeStyle = '#cbd5e1'; // slate-300
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, py, r + 4, 0, Math.PI * 2);
            ctx.stroke();
            // Subtle highlight arc that rotates
            ctx.globalAlpha = 0.85;
            ctx.strokeStyle = '#f1f5f9'; // slate-100
            ctx.lineWidth = 2;
            const arc = Math.PI * 0.4;
            const start = (time * 1.5) % (Math.PI * 2);
            ctx.beginPath();
            ctx.arc(px, py, r + 4, start, start + arc);
            ctx.stroke();
        }

        // ---- LUCK: faint gold sparkle ring (only if luck >= 2) ----
        if (buff.luck && buff.luck >= 2) {
            ctx.globalCompositeOperation = 'lighter';
            const sparkles = Math.min(6, buff.luck);
            for (let i = 0; i < sparkles; i++) {
                const a = (Math.PI * 2 / sparkles) * i + time * 1.2;
                const sx = px + Math.cos(a) * (r + 12);
                const sy = py + Math.sin(a) * (r + 12);
                const tw = (Math.sin(time * 4 + i) + 1) * 0.5;
                ctx.globalAlpha = 0.4 + tw * 0.4;
                ctx.fillStyle = '#fde047'; // yellow-300
                ctx.beginPath();
                ctx.arc(sx, sy, 1.5 + tw, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
}