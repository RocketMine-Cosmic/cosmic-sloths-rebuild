export function drawUI(ctx, canvas, time, player, hazards, enemies, characterPickup, camera, zoom, pickups) {
    // --- Off-screen Indicators ---
    // C9 2026-08-03 — this block used to RUN first, so the pickup markers below
    // painted OVER it: a 💰 could cover a 💀 in exactly the screen region players
    // scan for danger. Both blocks are now defined and invoked at the bottom of
    // this function, rewards first, threats last. Nothing inside either block
    // changed — only the order they run in.
    const drawThreatArrows = () => enemies.forEach(e => {
        if (e.isBoss || e.isElite) {
            const vWidth = canvas.width / zoom;
            const vHeight = canvas.height / zoom;
            const minX = camera.x;
            const maxX = camera.x + vWidth;
            const minY = camera.y;
            const maxY = camera.y + vHeight;
            const padding = (e.radius || 20) + 20;

            if (e.x < minX - padding || e.x > maxX + padding || e.y < minY - padding || e.y > maxY + padding) {
                const screenX = (e.x - camera.x) * zoom;
                const screenY = (e.y - camera.y) * zoom;
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                const angle = Math.atan2(screenY - centerY, screenX - centerX);
                
                const edgePadding = 40;
                const tan = Math.tan(angle);
                const rectWidth = Math.max(1, centerX - edgePadding);
                const rectHeight = Math.max(1, centerY - edgePadding);

                let indX, indY;
                if (Math.abs(tan) < rectHeight / rectWidth) {
                    indX = centerX + Math.sign(Math.cos(angle)) * rectWidth;
                    indY = centerY + (indX - centerX) * tan;
                } else {
                    indY = centerY + Math.sign(Math.sin(angle)) * rectHeight;
                    indX = centerX + (indY - centerY) / tan;
                }

                if (!Number.isFinite(indX) || !Number.isFinite(indY)) return;

                ctx.save();
                ctx.translate(indX, indY);
                ctx.rotate(angle);
                
                ctx.fillStyle = e.isBoss ? 'rgba(255, 0, 0, 0.8)' : 'rgba(255, 0, 255, 0.8)';
                ctx.beginPath();
                ctx.moveTo(20, 0);
                ctx.lineTo(-15, 15);
                ctx.lineTo(-15, -15);
                ctx.fill();

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.rotate(-angle);
                ctx.fillStyle = '#ffffff';
                ctx.font = '14px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(e.isBoss ? '💀' : '⚠️', 0, 0);
                
                ctx.restore();
            }
        }
    });

    // --- Off-screen Boss Drop Indicators ---
    // After a boss dies its relic fragment / nuke / big gold drops can land
    // far off-screen. Show small directional markers so the player can find them.
    const drawRewardArrows = () => {
      if (pickups && pickups.length) {
        const vWidth = canvas.width / zoom;
        const vHeight = canvas.height / zoom;
        const minX = camera.x;
        const maxX = camera.x + vWidth;
        const minY = camera.y;
        const maxY = camera.y + vHeight;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const edgePadding = 60;

        const DROP_STYLE = {
            fragment:     { color: 'rgba(168, 85, 247, 0.9)', icon: '💎' },
            nuke:         { color: 'rgba(255, 50, 50, 0.9)',  icon: '☢️' },
            magnet_power: { color: 'rgba(80, 130, 255, 0.9)', icon: '🧲' },
            shield_power: { color: 'rgba(255, 230, 80, 0.9)', icon: '🛡️' },
            reroll:       { color: 'rgba(255, 0, 255, 0.9)',  icon: 'R'  },
        };
        // Big gold piles (boss reward) — small piles aren't worth indicating.
        const BOSS_GOLD_THRESHOLD = 500;
        // Large XP orbs (mostly from bosses) — endless boss kills auto-credit
        // gold + fragments, leaving only the XP orb as the visible drop.
        // Without an indicator a far-off-screen boss looks like it dropped nothing.
        const BOSS_XP_THRESHOLD = 200;

        // Pulse so it stands out among other UI.
        const pulse = 0.7 + Math.sin(time * 4) * 0.3;

        pickups.forEach(p => {
            let style = DROP_STYLE[p.type];
            if (!style && p.type === 'gold' && (p.value || 0) >= BOSS_GOLD_THRESHOLD) {
                style = { color: 'rgba(255, 215, 0, 0.9)', icon: '💰' };
            }
            if (!style && p.type === 'xp' && (p.value || 0) >= BOSS_XP_THRESHOLD) {
                style = { color: 'rgba(0, 255, 204, 0.9)', icon: '✦' };
            }
            if (!style) return;
            // Only show when off-screen.
            if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) return;

            const screenX = (p.x - camera.x) * zoom;
            const screenY = (p.y - camera.y) * zoom;
            const angle = Math.atan2(screenY - centerY, screenX - centerX);

            const tan = Math.tan(angle);
            const rectWidth = Math.max(1, centerX - edgePadding);
            const rectHeight = Math.max(1, centerY - edgePadding);

            let indX, indY;
            if (Math.abs(tan) < rectHeight / rectWidth) {
                indX = centerX + Math.sign(Math.cos(angle)) * rectWidth;
                indY = centerY + (indX - centerX) * tan;
            } else {
                indY = centerY + Math.sign(Math.sin(angle)) * rectHeight;
                indX = centerX + (indY - centerY) / tan;
            }
            if (!Number.isFinite(indX) || !Number.isFinite(indY)) return;

            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.translate(indX, indY);
            ctx.rotate(angle);

            // Small arrow pointing toward the drop
            ctx.fillStyle = style.color;
            ctx.beginPath();
            ctx.moveTo(14, 0);
            ctx.lineTo(-10, 9);
            ctx.lineTo(-10, -9);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Icon (un-rotate so it stays upright)
            ctx.rotate(-angle);
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(style.icon, 0, 0);
            ctx.restore();
        });
        ctx.globalAlpha = 1;
      }
    };

    // C9: rewards first, threats last — a skull is never hidden by a coin.
    drawRewardArrows();
    drawThreatArrows();
}