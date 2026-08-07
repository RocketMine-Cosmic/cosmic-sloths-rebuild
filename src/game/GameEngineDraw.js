import { drawEnemy } from './EnemyRenderer';
import { drawUI } from './UIRenderer';
import { drawPickups } from './PickupRenderer';
import { drawProjectiles } from './ProjectileRenderer';
import { getWeaponStatsAndMastery } from './Constants';
import { drawBuffAuras } from './BuffAuraRenderer';

export function renderGame() {
    // Reset composite operation to prevent stuck states from previous frames
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.globalAlpha = 1.0;
    
    // PERF 2026-08-07 — the old `this.webglBg` branch here was dead code: nothing
    // in the codebase ever assigned engine.webglBg, so the WebGL background has
    // never rendered a single frame. Removed along with the matching dead guard
    // on the star loop below (WebGLBackground.js is now unused).
    if (this.arenaImage && this.arenaImage.complete && this.arenaImage.naturalWidth > 0) {
        // Cache the rendered background to avoid expensive scaling and blending every frame
        if (!this.cachedArenaImage || this.cachedArenaImage.width !== this.canvas.width || this.cachedArenaImage.height !== this.canvas.height) {
            this.cachedArenaImage = document.createElement('canvas');
            this.cachedArenaImage.width = this.canvas.width;
            this.cachedArenaImage.height = this.canvas.height;
            const oCtx = this.cachedArenaImage.getContext('2d');
            
            // Draw base color
            oCtx.fillStyle = this.arena.bg;
            oCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Draw scaled image with opacity
            const scale = Math.max(this.canvas.width / this.arenaImage.naturalWidth, this.canvas.height / this.arenaImage.naturalHeight);
            const drawW = this.arenaImage.naturalWidth * scale;
            const drawH = this.arenaImage.naturalHeight * scale;
            const x = (this.canvas.width - drawW) / 2;
            const y = (this.canvas.height - drawH) / 2;
            
            oCtx.globalAlpha = 0.9;
            oCtx.drawImage(this.arenaImage, x, y, drawW, drawH);
            oCtx.globalAlpha = 1.0;
        }
        // Draw the pre-rendered, screen-sized background (extremely fast)
        this.ctx.drawImage(this.cachedArenaImage, 0, 0);
    } else {
        this.ctx.fillStyle = this.arena.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    {
        this.ctx.fillStyle = '#ffffff';
        this.stars.forEach(star => {
            let sx = (star.x - this.camera.x * star.parallax) % 2000;
            let sy = (star.y - this.camera.y * star.parallax) % 2000;
            if (sx < 0) sx += 2000;
            if (sy < 0) sy += 2000;
            
            const screenX = (sx / 2000) * this.canvas.width;
            const screenY = (sy / 2000) * this.canvas.height;
            
            this.ctx.globalAlpha = star.parallax;
            this.ctx.fillRect(screenX, screenY, star.size, star.size);
        });
        this.ctx.globalAlpha = 1.0;
    }

    this.ctx.save();
    this.ctx.scale(this.zoom, this.zoom);
    this.ctx.translate(-this.camera.x + this.shakeX, -this.camera.y + this.shakeY);

    const vWidth = this.canvas.width / this.zoom;
    const vHeight = this.canvas.height / this.zoom;
    const camX = this.camera.x;
    const camY = this.camera.y;

    // Pickups (gold, XP, fragments, power-ups) render in a single top-layer pass
    // AFTER particles + AoE pools so they all stay visible through weapon visual
    // effects like Aegis, Hellfire, Quantum Collapse pools etc. — see below.

    if (this.characterPickup) {
        this.ctx.fillStyle = this.characterPickup.color;
        this.ctx.fillRect(this.characterPickup.x - 15, this.characterPickup.y - 15, 30, 30);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('🦥', this.characterPickup.x, this.characterPickup.y + 5);
        
        const dx = this.characterPickup.x - this.player.x;
        const dy = this.characterPickup.y - this.player.y;
        const dist = Math.hypot(dx, dy);
        if (dist > Math.min(this.canvas.width / this.zoom, this.canvas.height / this.zoom) / 2 - 50) {
            const angle = Math.atan2(dy, dx);
            const arrowDist = Math.min(this.canvas.width / this.zoom, this.canvas.height / this.zoom) / 2 - 50;
            const ax = this.player.x + Math.cos(angle) * arrowDist;
            const ay = this.player.y + Math.sin(angle) * arrowDist;
            
            this.ctx.save();
            this.ctx.translate(ax, ay);
            this.ctx.rotate(angle);
            this.ctx.fillStyle = this.characterPickup.color;
            this.ctx.beginPath();
            this.ctx.moveTo(15, 0);
            this.ctx.lineTo(-10, 10);
            this.ctx.lineTo(-10, -10);
            this.ctx.fill();
            this.ctx.restore();
        }
    }

    drawProjectiles(this.ctx, this.projectiles, this.particleManager, this.time, camX, camY, vWidth, vHeight);

    if (this.characterId === 'neobyte' && this.characterMechanics?.banners) {
        this.characterMechanics.banners.forEach(b => {
            this.ctx.globalAlpha = Math.min(1, b.life / 2);
            this.ctx.strokeStyle = '#0066FF';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.fillStyle = 'rgba(0, 102, 255, 0.1)';
            this.ctx.fill();
            this.ctx.fillStyle = '#0066FF';
            this.ctx.font = '20px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('🚩', b.x, b.y);
            // C12 2026-08-03 — textBaseline was set here with no save()/restore(),
            // so it leaked into every later text draw in the frame. Reset it.
            this.ctx.textBaseline = 'alphabetic';
            this.ctx.globalAlpha = 1.0;
        });
    }

    if ((this.characterId === 'holodrift' || this.player.charAugments?.includes('glt_copy')) && this.characterMechanics?.decoys) {
        const decoyColor = this.characterId === 'holodrift' ? '#00FA9A' : '#FF00FF';
        this.characterMechanics.decoys.forEach(d => {
            this.ctx.globalAlpha = Math.min(0.8, d.life / 2);
            this.ctx.fillStyle = decoyColor;
            this.ctx.beginPath();
            this.ctx.arc(d.x, d.y, 15, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('👤', d.x, d.y + 2);
            // C12: same leak as the squad-flag block above.
            this.ctx.textBaseline = 'alphabetic';
            this.ctx.globalAlpha = 1.0;
            
            this.ctx.fillStyle = '#ff0000'; this.ctx.fillRect(d.x - 10, d.y - 20, 20, 4);
            this.ctx.fillStyle = '#00ff00'; this.ctx.fillRect(d.x - 10, d.y - 20, 20 * (d.hp / d.maxHp), 4);
        });
    }

    // MOVED 2026-08-03 (VFX fix B) — this block used to RUN here, which put the
    // hazard warning underneath every particle, pickup, enemy, drone, aura and
    // kill effect drawn after it. It is now only DEFINED here and invoked just
    // before the player sprite, so the thing that is about to hurt you is drawn
    // on top of the things that are not.
    const drawHazardLayer = () => {
      if (this.hazards) {
        this.hazards.forEach(h => {
            this.ctx.save(); this.ctx.translate(h.x, h.y);
            if (!h.active) {
                const p = 1 - (h.timer / 2.0);
                // FIXED 2026-08-03 (VFX fix B) — the ring lied about its size.
                // GameEngine.js damages at `player.radius + h.radius`, but this
                // stroked at h.radius alone (60), so a player standing visibly
                // OUTSIDE the red circle still took 30-75 damage. Stroke the real
                // danger radius. The hitbox is unchanged — this corrects the
                // drawing to match it. Alpha and lineWidth raised too: at
                // rgba(255,50,0,0.3) / 2px the ring was barely visible when it
                // first appeared, which is exactly when you need to move.
                const dangerR = h.radius + (this.player?.radius || 0);
                this.ctx.beginPath(); this.ctx.arc(0, 0, dangerR, 0, Math.PI * 2);
                this.ctx.strokeStyle = `rgba(255,50,0,${0.5 + p * 0.45})`; this.ctx.lineWidth = 3; this.ctx.stroke();
                this.ctx.beginPath(); this.ctx.arc(0, 0, dangerR * p, 0, Math.PI * 2);
                this.ctx.fillStyle = `rgba(255,50,0,${0.1 + p * 0.2})`; this.ctx.fill();
                this.ctx.fillStyle = `rgba(255,0,0,${Math.sin(this.time * 15) * 0.5 + 0.5})`;
                this.ctx.font = 'bold 24px Arial'; this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle'; this.ctx.fillText('⚠', 0, 0);
            } else {
                this.ctx.globalCompositeOperation = 'screen';
                const g = this.ctx.createRadialGradient(0, 0, 0, 0, 0, h.radius * 1.2);
                g.addColorStop(0, '#fff'); g.addColorStop(0.2, 'rgba(255,100,0,0.8)'); g.addColorStop(0.6, 'rgba(255,0,0,0.4)'); g.addColorStop(1, 'transparent');
                this.ctx.fillStyle = g; this.ctx.beginPath(); this.ctx.arc(0, 0, h.radius * 1.2, 0, Math.PI * 2); this.ctx.fill();
                this.ctx.rotate(this.time * 10); this.ctx.fillStyle = '#fff'; this.ctx.beginPath();
                for (let i = 0; i < 16; i++) {
                    const a = (Math.PI / 16) * i; const r = i % 2 === 0 ? h.radius * 0.8 : h.radius * 0.3;
                    this.ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                }
                this.ctx.fill(); this.ctx.globalCompositeOperation = 'source-over';
            }
            this.ctx.restore();
        });
      }
    };

    const swarm = this.player.weapons.find(w => w.id === 'slothSwarm');
    if (swarm) {
        const stats = getWeaponStatsAndMastery(this.save, 'slothSwarm');
        const isMastered = stats.isMastered;
        
        const count = 1 + Math.floor(swarm.level / 2);
        const area = swarm.baseArea * this.player.areaMult * (1 + (swarm.level-1)*0.1) * stats.areaMult;
        const speedMult = isMastered ? 6 : 3;
        for(let i=0; i<count; i++) {
            const angle = (Math.PI * 2 / count) * i + this.time * speedMult;
            const px = this.player.x + Math.cos(angle) * (60 * area);
            const py = this.player.y + Math.sin(angle) * (60 * area);
            
            this.ctx.save();
            this.ctx.translate(px, py);
            this.ctx.rotate(angle + Math.PI/2); // Face direction of orbit

            // Add HD aura - optimized
            this.ctx.globalCompositeOperation = 'lighter';
            const auraCol = isMastered ? '#ff0000' : '#8B4513';
            this.ctx.fillStyle = auraCol;
            this.ctx.globalAlpha = 0.1;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 25, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalAlpha = 0.2;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 15, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.globalAlpha = 1.0;
            
            // Draw Sloth Head shape
            this.ctx.fillStyle = isMastered ? '#FF0000' : '#8B4513';
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI*2); // Head
            this.ctx.fill();
            // Ears
            this.ctx.beginPath(); this.ctx.arc(-6, -4, 3, 0, Math.PI*2); this.ctx.fill();
            this.ctx.beginPath(); this.ctx.arc(6, -4, 3, 0, Math.PI*2); this.ctx.fill();
            // Face
            this.ctx.fillStyle = '#d2b48c';
            this.ctx.beginPath(); this.ctx.ellipse(0, 1, 5, 4, 0, 0, Math.PI*2); this.ctx.fill();
            
            this.ctx.restore();
        }
    }

    const thornySwarm = this.player.weapons.find(w => w.id === 'thornySwarm');
    if (thornySwarm) {
        const stats = getWeaponStatsAndMastery(this.save, 'thornySwarm');
        const count = 2 + Math.floor(thornySwarm.level / 2);
        const area = thornySwarm.baseArea * this.player.areaMult * (1 + (thornySwarm.level-1)*0.1) * stats.areaMult;
        for(let i=0; i<count; i++) {
            const angle = (Math.PI * 2 / count) * i + this.time * 4;
            const px = this.player.x + Math.cos(angle) * (80 * area);
            const py = this.player.y + Math.sin(angle) * (80 * area);
            
            this.ctx.save();
            this.ctx.translate(px, py);
            this.ctx.rotate(this.time * 5); // Spin
            
            // Add HD aura - optimized
            this.ctx.globalCompositeOperation = 'lighter';
            this.ctx.fillStyle = '#32CD32';
            this.ctx.globalAlpha = 0.1;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 25, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalAlpha = 0.2;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 15, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.globalAlpha = 1.0;
            
            // Spiky Ball
            this.ctx.fillStyle = '#32CD32';
            this.ctx.beginPath();
            const spikes = 8;
            for(let j=0; j<spikes*2; j++) {
                const a = (Math.PI*2/(spikes*2))*j;
                const r = j%2===0 ? 10 : 5;
                this.ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
            }
            this.ctx.fill();
            this.ctx.strokeStyle = '#006400';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();
            
            this.ctx.restore();
        }
    }

    const orbitalLasers = this.player.weapons.find(w => w.id === 'orbitalLasers');
    if (orbitalLasers) {
        const stats = getWeaponStatsAndMastery(this.save, 'orbitalLasers');
        const count = 2 + Math.floor(orbitalLasers.level / 2);
        const area = orbitalLasers.baseArea * this.player.areaMult * (1 + (orbitalLasers.level-1)*0.1) * stats.areaMult;
        for(let i=0; i<count; i++) {
            const angle = (Math.PI * 2 / count) * i + this.time * 2;
            const px = this.player.x + Math.cos(angle) * (60 * area);
            const py = this.player.y + Math.sin(angle) * (60 * area);
            
            this.ctx.save();
            this.ctx.translate(px, py);
            this.ctx.rotate(this.time * 3);
            
            this.ctx.globalCompositeOperation = 'lighter';
            this.ctx.fillStyle = '#00ffff';
            this.ctx.globalAlpha = 0.15;
            this.ctx.beginPath(); this.ctx.arc(0, 0, 15, 0, Math.PI * 2); this.ctx.fill();
            this.ctx.globalAlpha = 1.0;
            this.ctx.globalCompositeOperation = 'source-over';
            
            this.ctx.fillStyle = '#00ffff';
            this.ctx.beginPath(); this.ctx.arc(0, 0, 6, 0, Math.PI * 2); this.ctx.fill();
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            this.ctx.restore();
        }
    }

    const orbitalDefense = this.player.weapons.find(w => w.id === 'orbitalDefense');
    if (orbitalDefense) {
        const stats = getWeaponStatsAndMastery(this.save, 'orbitalDefense');
        const count = 4 + Math.floor(orbitalDefense.level / 2);
        const area = orbitalDefense.baseArea * this.player.areaMult * (1 + (orbitalDefense.level-1)*0.1) * stats.areaMult;
        for(let i=0; i<count; i++) {
            const angle = (Math.PI * 2 / count) * i + this.time * 3;
            const px = this.player.x + Math.cos(angle) * (70 * area);
            const py = this.player.y + Math.sin(angle) * (70 * area);
            
            this.ctx.save();
            this.ctx.translate(px, py);
            this.ctx.rotate(this.time * -4);
            
            this.ctx.globalCompositeOperation = 'lighter';
            this.ctx.fillStyle = '#00ff44';
            this.ctx.globalAlpha = 0.2;
            this.ctx.beginPath(); this.ctx.arc(0, 0, 25, 0, Math.PI * 2); this.ctx.fill();
            this.ctx.globalAlpha = 1.0;
            this.ctx.globalCompositeOperation = 'source-over';
            
            this.ctx.fillStyle = '#111111';
            this.ctx.beginPath();
            this.ctx.moveTo(15, 0);
            this.ctx.lineTo(0, 15);
            this.ctx.lineTo(-15, 0);
            this.ctx.lineTo(0, -15);
            this.ctx.fill();
            
            this.ctx.strokeStyle = '#00ff44';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 5, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.restore();
        }
    }

    // Combat VFX pass — explosions, weapon impacts, AoE pool glow, shockwaves.
    // Cosmetic particles (trails + kill effects) are filtered out here and
    // rendered later in dedicated passes so paid cosmetics aren't buried under
    // enemies / pickups / projectiles.
    this.particleManager.draw(this.ctx, camX, camY, vWidth, vHeight);

    // LAYER 1: XP / gold / reroll pickups — drawn BELOW enemy projectiles so the
    // currency litter doesn't visually mask dangerous bullets. Player can still
    // see what they're collecting since enemy projectiles are small bright dots
    // that read clearly over the larger XP/gold icons.
    drawPickups(this.ctx, this.pickups, this.time, 'minor', camX, camY, vWidth, vHeight);

    // (Enemy projectiles now render at the very end of the world pass —
    // see block after the invincibility ring below.)

    // C11 2026-08-03 — the margin was a flat 150, but drawEnemy renders sprites at
    // radius * 1.8. The squad meteor (radius 220) has a half-extent of 198, so it
    // was culled — and visibly popped out of existence — with roughly a 50-unit
    // sliver still on screen. Scale the margin with the enemy instead.
    this.enemies.forEach(e => {
        const m = Math.max(150, (e.radius || 20) * 2);
        if (e.x < camX - m || e.x > camX + vWidth + m ||
            e.y < camY - m || e.y > camY + vHeight + m) return;
        if (!e.burrowed) {
            drawEnemy(this.ctx, e, this.time, this.player.x);
            
            if (e.hp < e.maxHp || e.isBoss) {
                // C8 2026-08-03 — an elite has ~2.5x the HP of a trash mob and
                // was given an identical 20px bar, so the bar actively said
                // "this is trash" while the aura said "this is elite".
                const barW = e.isBoss ? 80 : (e.isElite ? 40 : 20);
                const barH = e.isBoss ? 6 : (e.isElite ? 5 : 4);
                const yOffset = e.isBoss ? 16 : (e.isElite ? 10 : 8);
                this.ctx.fillStyle = '#ff0000'; this.ctx.fillRect(e.x - barW/2, e.y - e.radius - yOffset, barW, barH);
                this.ctx.fillStyle = '#00ff00'; this.ctx.fillRect(e.x - barW/2, e.y - e.radius - yOffset, barW * (e.hp / e.maxHp), barH);
            }
            if (e.isBoss && e.weakSide && e.weakDesc) {
                this.ctx.fillStyle = '#ffdd00';
                this.ctx.font = 'bold 11px monospace';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(`⚡ WEAK: ${e.weakDesc}`, e.x, e.y - e.radius - 28);
            }
        } else {
            // Draw burrowed indicator
            this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
            this.ctx.beginPath(); this.ctx.ellipse(e.x, e.y, e.radius, e.radius * 0.5, 0, 0, Math.PI * 2); this.ctx.fill();
        }
    });

    // LAYER 3 (top): Major pickups — magnets, shields, nukes, relic fragments,
    // chests, power-ups with custom icons. These are rare/high-value drops the
    // player MUST be able to spot through the chaos (player request 2026-05-14).
    //
    // 🔴 2026-08-07 — this pass USED to sit above, i.e. before the enemy loop,
    // so every mob standing on a nuke / shield / magnet painted straight over
    // it. In a swarm — the only time those drops matter — they were invisible
    // (Briantjeuh, Discord). "Top layer" only means anything if it runs after
    // the enemies; it now does. Minor pickups (xp/gold litter) deliberately
    // stay BELOW enemies so they don't mask incoming threats.
    drawPickups(this.ctx, this.pickups, this.time, 'major', camX, camY, vWidth, vHeight);

    if (this.player.trail !== 'default' && this.frameCount % 6 === 0) {
        this.particleManager.createTrail(this.player.x, this.player.y, this.player.trail, this.frameCount);
    }

    // COSMETIC LAYER A — trail particles. Rendered AFTER enemies / pickups but
    // BEFORE the player sprite so the trail reads as coming from the player
    // without obscuring the skin underneath. The dedicated render pass is the
    // visibility fix — no halo / aura needed.
    this.particleManager.draw(this.ctx, camX, camY, vWidth, vHeight, 'trail');

    if (this.squadClones) {
        this.squadClones.forEach(clone => {
            const spriteSheet = clone.isMoving
                ? (clone.walkImage && clone.walkImage.complete ? clone.walkImage : null)
                : (clone.idleImage && clone.idleImage.complete ? clone.idleImage : null);

            this.ctx.save();
            this.ctx.translate(clone.x, clone.y);
            if (!clone.facingLeft) this.ctx.scale(-1, 1);
            
            this.ctx.globalCompositeOperation = 'lighter';
            
            // Use pre-rendered glow if particleManager exists
            if (this.particleManager && typeof this.particleManager.getGlowTexture === 'function') {
                const glow = this.particleManager.getGlowTexture(clone.color, clone.radius * 2);
                if (glow) {
                    this.ctx.globalAlpha = 0.3 * Math.min(1, clone.life);
                    this.ctx.drawImage(glow, -glow.width/2, -glow.height/2);
                }
            } else {
                this.ctx.fillStyle = clone.color;
                this.ctx.globalAlpha = 0.3 * Math.min(1, clone.life);
                this.ctx.beginPath();
                this.ctx.arc(0, 0, clone.radius * 2, 0, Math.PI * 2);
                this.ctx.fill();
            }
            
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.globalAlpha = Math.min(1, clone.life);

            if (spriteSheet) {
                const size = clone.radius * 5;
                const frame = clone.currentFrame;
                const col = frame % 5;
                const row = Math.floor(frame / 5);
                const frameWidth = spriteSheet.width / 5;
                const frameHeight = spriteSheet.height / 5;
                const sx = col * frameWidth;
                const sy = row * frameHeight;
                
                this.ctx.globalCompositeOperation = 'lighter';
                if (this.particleManager && typeof this.particleManager.getGlowTexture === 'function') {
                    const glow = this.particleManager.getGlowTexture(clone.color, size * 0.8);
                    if (glow) {
                        this.ctx.globalAlpha = 0.5;
                        this.ctx.drawImage(glow, -glow.width/2, -glow.height/2);
                    }
                } else {
                    const grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.8);
                    grad.addColorStop(0, clone.color);
                    grad.addColorStop(1, 'transparent');
                    this.ctx.fillStyle = grad;
                    this.ctx.globalAlpha = 0.5;
                    this.ctx.beginPath(); this.ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2); this.ctx.fill();
                }
                this.ctx.globalAlpha = 1.0;
                this.ctx.globalCompositeOperation = 'source-over';
                
                this.ctx.drawImage(spriteSheet, sx, sy, frameWidth, frameHeight, -size/2, -size/2, size, size);
            } else if (clone.image && clone.image.complete) {
                const size = clone.radius * 3;
                this.ctx.globalCompositeOperation = 'lighter';
                
                if (this.particleManager && typeof this.particleManager.getGlowTexture === 'function') {
                    const glow = this.particleManager.getGlowTexture(clone.color, size * 0.8);
                    if (glow) {
                        this.ctx.globalAlpha = 0.5;
                        this.ctx.drawImage(glow, -glow.width/2, -glow.height/2);
                    }
                } else {
                    const grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.8);
                    grad.addColorStop(0, clone.color);
                    grad.addColorStop(1, 'transparent');
                    this.ctx.fillStyle = grad;
                    this.ctx.globalAlpha = 0.5;
                    this.ctx.beginPath(); this.ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2); this.ctx.fill();
                }
                
                this.ctx.globalAlpha = 1.0;
                this.ctx.globalCompositeOperation = 'source-over';
                
                this.ctx.drawImage(clone.image, -size/2, -size/2, size, size);
            } else {
                this.ctx.fillStyle = clone.color;
                this.ctx.beginPath();
                this.ctx.roundRect(-clone.radius, -clone.radius, clone.radius * 2, clone.radius * 2, 8);
                this.ctx.fill();
            }
            this.ctx.restore();
        });
    }

    // Advance sprite animation frame
    const SPRITE_FRAMES = 25;
    const FRAME_DURATION = 1 / 12; // 12 fps
    this.player.frameTimer += this.lastDt || 0;
    if (this.player.frameTimer >= FRAME_DURATION) {
        this.player.frameTimer -= FRAME_DURATION;
        this.player.currentFrame = (this.player.currentFrame + 1) % SPRITE_FRAMES;
    }

    // ── THREAT LAYER (2026-08-03) ──────────────────────────────────────
    // Everything that is about to damage the player, drawn last in the world
    // pass — above enemies, pickups, drones and particles, below the player.
    //
    // (A) Boss AoE telegraphs. BossSystem creates and ticks _bombWarning,
    // _novaWarning and _meteorWarning, and until today NOTHING DREW THEM.
    // The player saw a damage-text label fade, then took boss.damage * 1.5
    // from a circle that was never on screen. Meteor Shower was worst: 3-8
    // simultaneous impacts, each signalled by three small sparks.
    //
    // 🔴 The radii below MUST stay equal to the takeDamage checks in
    // BossSystem.js. If one moves, move the other:
    //     _bombWarning    dist < 120
    //     _novaWarning    dist < 100
    //     _meteorWarning  dist < 90
    //
    // source-over, never additive — these are floor decals, not glow, and the
    // whole point is that they read clearly over a busy bright background.
    //
    // ⚠️ Balance-visible by design: these attacks become dodgeable as they were
    // always meant to be, so bosses get easier. That is the fix, not a side
    // effect. Draw-only — no hitbox, timer or damage value is touched.
    const BOSS_TELEGRAPHS = [
        { key: '_bombWarning',   radius: 120, rgb: '168,85,247', defaultT0: 2.0 },
        { key: '_novaWarning',   radius: 100, rgb: '239,68,68',  defaultT0: 1.2 },
        { key: '_meteorWarning', radius: 90,  rgb: '245,158,11', defaultT0: 2.0 }
    ];
    this.enemies.forEach(e => {
        if (!e.isBoss) return;
        BOSS_TELEGRAPHS.forEach(t => {
            const list = e[t.key];
            if (!list || !list.length) return;
            list.forEach(w => {
                const t0 = w.t0 || t.defaultT0;
                const p = Math.max(0, Math.min(1, 1 - (w.timer / t0)));
                this.ctx.save();
                this.ctx.globalCompositeOperation = 'source-over';
                this.ctx.globalAlpha = 1;
                this.ctx.translate(w.x, w.y);
                // Filling disc — reaching the ring means impact.
                this.ctx.beginPath();
                this.ctx.arc(0, 0, t.radius * p, 0, Math.PI * 2);
                this.ctx.fillStyle = `rgba(${t.rgb},${0.10 + p * 0.22})`;
                this.ctx.fill();
                // Hard ring, always at the TRUE damage radius so the safe
                // distance is readable from the moment the warning appears.
                this.ctx.beginPath();
                this.ctx.arc(0, 0, t.radius, 0, Math.PI * 2);
                this.ctx.strokeStyle = `rgba(${t.rgb},${0.45 + p * 0.5})`;
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
                this.ctx.restore();
            });
        });
    });

    // (B) Ground hazards — defined near the top of this function, invoked here.
    drawHazardLayer();

    const spriteSheet = this.player.isMoving
        ? (this.player.walkImage && this.player.walkImage.complete ? this.player.walkImage : null)
        : (this.player.idleImage && this.player.idleImage.complete ? this.player.idleImage : null);

    // Buff visual indicators — speed glow, area radius, regen pulse, armor ring.
    // Reads from the title buff applied to the player at run-start so it reflects
    // whichever title is equipped (and any other source that boosts these stats).
    drawBuffAuras(this.ctx, this.player, this.time);

    if (this.player.iFrames > 0 && Math.floor(this.time * 15) % 2 === 0) {
        this.ctx.globalAlpha = 0.5;
    }

    if (spriteSheet) {
        const size = this.player.radius * 5;
        const frame = this.player.currentFrame;
        const col = frame % 5;
        const row = Math.floor(frame / 5);
        const frameWidth = spriteSheet.width / 5;
        const frameHeight = spriteSheet.height / 5;
        const sx = col * frameWidth;
        const sy = row * frameHeight;
        
        this.ctx.save();
        this.ctx.translate(this.player.x, this.player.y);
        // The base sprite sheets are drawn facing left. 
        // So if we are facing right (!facingLeft), we need to mirror them.
        if (!this.player.facingLeft) this.ctx.scale(-1, 1);
        
        // Soft circular glow under the sprite (replaces shadowBlur which
        // produced boxy edges along the sprite frame's bounding box).
        if (this.player.color && this.player.color !== '#ffffff') {
            this.ctx.globalCompositeOperation = 'lighter';
            if (this.particleManager && typeof this.particleManager.getGlowTexture === 'function') {
                const glow = this.particleManager.getGlowTexture(this.player.color, size * 0.85);
                if (glow) {
                    this.ctx.globalAlpha = 0.55;
                    this.ctx.drawImage(glow, -glow.width / 2, -glow.height / 2);
                }
            }
            this.ctx.globalAlpha = 1.0;
            this.ctx.globalCompositeOperation = 'source-over';
        }
        
        // Draw the actual sprite
        this.ctx.drawImage(spriteSheet, sx, sy, frameWidth, frameHeight, -size/2, -size/2, size, size);
        
        this.ctx.restore();
    } else if (this.player.image && this.player.image.complete) {
        const size = this.player.radius * 3;
        
        this.ctx.save();
        this.ctx.translate(this.player.x, this.player.y);
        
        if (this.player.facingLeft) {
            this.ctx.scale(-1, 1);
        }
        
        // Soft circular glow under the sprite (replaces shadowBlur).
        if (this.player.color && this.player.color !== '#ffffff') {
            this.ctx.globalCompositeOperation = 'lighter';
            if (this.particleManager && typeof this.particleManager.getGlowTexture === 'function') {
                const glow = this.particleManager.getGlowTexture(this.player.color, size * 0.85);
                if (glow) {
                    this.ctx.globalAlpha = 0.55;
                    this.ctx.drawImage(glow, -glow.width / 2, -glow.height / 2);
                }
            }
            this.ctx.globalAlpha = 1.0;
            this.ctx.globalCompositeOperation = 'source-over';
        }
        
        this.ctx.drawImage(this.player.image, -size/2, -size/2, size, size);
        
        this.ctx.restore();
    } else {
        this.ctx.fillStyle = this.player.color;
        this.ctx.beginPath();
        this.ctx.roundRect(this.player.x - this.player.radius, this.player.y - this.player.radius, this.player.radius * 2, this.player.radius * 2, 8);
        this.ctx.fill();
        this.ctx.fillStyle = 'rgba(173, 216, 230, 0.5)';
        this.ctx.beginPath();
        this.ctx.roundRect(this.player.x - this.player.radius + 2, this.player.y - this.player.radius + 2, this.player.radius * 2 - 4, this.player.radius - 2, 4);
        this.ctx.fill();
    }

    this.ctx.globalAlpha = 1.0;

    // COSMETIC LAYER B — kill-effect particles. Rendered AFTER the player
    // sprite so paid kill effects (golden, explosion, freeze, vaporize, etc.)
    // pop on top of the player + everything in the playfield. Damage text
    // and the HUD still render above this so feedback stays legible.
    this.particleManager.draw(this.ctx, camX, camY, vWidth, vHeight, 'killfx');

    if (this.player.invincibleTimer > 0) {
        this.ctx.strokeStyle = '#ffff00';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(this.player.x, this.player.y, this.player.radius + 10 + Math.sin(this.time * 10) * 5, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
        this.ctx.fill();
    }

    // Enemy projectiles — drawn LAST inside the world transform so they sit on
    // TOP of every player VFX layer (orbitals, AoE pools, trails, buff auras,
    // kill effects, invincibility rings). Uses a saturated hostile-red palette
    // with NO white core and NO 'lighter' blend so they never read as a player
    // laser (Anubis request 2026-05-23 — bullets were getting hidden under his
    // own upgrade animations and looking too much like his own projectiles).
    // Damage text still renders above this block so combat feedback stays legible.
    if (this.enemyProjectiles) {
        this.ctx.globalCompositeOperation = 'source-over';
        const pulse = 0.7 + Math.sin(this.time * 14) * 0.3;
        // P3 2026-08-03 — this loop built a fresh createRadialGradient for EVERY
        // bullet EVERY frame. A bullet-hell boss puts up to 40 on screen per
        // attack, so this was hundreds of gradient allocations per frame during
        // the densest and most dangerous moments of a run — exactly when a phone
        // can least afford it.
        //
        // Two changes, no visual difference. The palette, the stops, the layer
        // order and the no-white-core rule (Anubis 2026-05-23) are untouched:
        //   1. The gradient is built in LOCAL space (0,0) and keyed by radius, so
        //      all bullets sharing a radius share one gradient. Enemy bullet radii
        //      come from a handful of literals, so 40 bullets now cost ~2.
        //   2. `pulse` moved out of the colour stops and onto globalAlpha. It was
        //      the only time-varying term and it multiplied every stop equally,
        //      which is exactly what globalAlpha does — so the gradient stops
        //      changing frame to frame and becomes cacheable at all.
        // Cache is per-frame deliberately: no staleness if the canvas is resized.
        const haloCache = new Map();
        this.enemyProjectiles.forEach(p => {
            // P1: enemy bullets weren't culled either. Halo is radius * 3.5, so
            // a 4x margin is comfortably outside anything this branch draws.
            const cm = (p.radius || 0) * 4 + 32;
            if (p.x < camX - cm || p.x > camX + vWidth + cm ||
                p.y < camY - cm || p.y > camY + vHeight + cm) return;
            const r = Math.max(0.1, p.radius);
            // Outer warning halo — pulsing red gradient, wider than the bullet itself.
            const haloR = Math.max(1, Math.round(r * 3.5));
            let halo = haloCache.get(haloR);
            if (!halo) {
                halo = this.ctx.createRadialGradient(0, 0, 0, 0, 0, haloR);
                halo.addColorStop(0, 'rgba(255, 60, 20, 0.55)');
                halo.addColorStop(0.5, 'rgba(255, 20, 0, 0.25)');
                halo.addColorStop(1, 'rgba(120, 0, 0, 0)');
                haloCache.set(haloR, halo);
            }
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.globalAlpha = pulse;
            this.ctx.fillStyle = halo;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, haloR, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
            // Dark outline for contrast against bright AoE pools / environments.
            this.ctx.strokeStyle = 'rgba(60, 0, 0, 0.95)';
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, r * 1.5, 0, Math.PI * 2);
            this.ctx.stroke();
            // Solid saturated red core — unambiguously hostile.
            this.ctx.fillStyle = '#ff2a1a';
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, r * 1.4, 0, Math.PI * 2);
            this.ctx.fill();
            // Inner highlight kept yellow-orange (not white) to stay visually distinct
            // from the white/cyan cores used by most player projectiles.
            this.ctx.fillStyle = '#ffd24a';
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, r * 0.5, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    this.ctx.textAlign = 'center';
    // C12 2026-08-03 — this loop never set textBaseline, so it inherited whatever
    // the last text draw left behind. Playing NeoByte or HoloDrift set it to
    // 'middle' earlier in the frame and EVERY damage number sat ~9px low,
    // overlapping the enemy sprites. Set explicitly rather than relying on the
    // resets above — this is the block players actually notice.
    this.ctx.textBaseline = 'alphabetic';
    this.damageTexts.forEach(t => {
        this.ctx.globalAlpha = Math.max(0, t.life);
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = t.isCrit ? 4 : 3;
        this.ctx.font = t.isCrit ? 'bold 26px "Courier New", Courier, monospace' : 'bold 18px "Courier New", Courier, monospace';
        const displayY = t.isCrit ? t.y - 10 * (1 - t.life) : t.y;
        const textToDraw = t.text + (t.isCrit ? '!' : '');
        this.ctx.strokeText(textToDraw, t.x, displayY);
        this.ctx.fillStyle = t.color;
        this.ctx.fillText(textToDraw, t.x, displayY);
        this.ctx.globalAlpha = 1.0;
    });

    // Draw Environmental Effects
    this.ctx.globalCompositeOperation = 'screen';
    const texSmoke = this.particleManager?.textures?.smoke;

    // P5 2026-08-03 — env particles were the last unculled draw loop. They are
    // spawned across 1.5-2x the viewport around the player (GameEngine.js:1239-
    // 1247), so a meaningful share of them is off screen at any moment, and
    // neon_rain in particular respawns continuously. Filtered once here rather
    // than per branch — only one of the three ever runs in a given arena.
    // Margin scales with p.size because fog and flares draw at 2x their size;
    // rain and embers have no size and fall back to the flat 96.
    // PERF 2026-08-07 — this used to allocate a fresh filtered array every frame.
    // Reuse one scratch array on the engine instead; same cull, zero allocation.
    const envCullOn = Number.isFinite(camX) && vWidth > 0 && vHeight > 0;
    let envVisible;
    if (envCullOn) {
        if (!this._envVisible) this._envVisible = [];
        envVisible = this._envVisible;
        envVisible.length = 0;
        for (let i = 0; i < this.envParticles.length; i++) {
            const p = this.envParticles[i];
            const m = (p.size || 8) * 2 + 96;
            if (p.x >= camX - m && p.x <= camX + vWidth + m &&
                p.y >= camY - m && p.y <= camY + vHeight + m) envVisible.push(p);
        }
    } else {
        envVisible = this.envParticles;
    }

    if (this.envEffect === 'neon_rain') {
        this.ctx.globalCompositeOperation = 'screen';
        envVisible.forEach(p => {
            this.ctx.globalAlpha = (p.life / 2) * 0.8;
            this.ctx.strokeStyle = p.color; this.ctx.lineWidth = 3;
            this.ctx.beginPath(); this.ctx.moveTo(p.x, p.y); this.ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); this.ctx.stroke();
            this.ctx.fillStyle = '#fff'; this.ctx.beginPath(); this.ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); this.ctx.fill();
            if (p.life < 0.1) {
                this.ctx.beginPath(); this.ctx.arc(p.x, p.y, (0.1 - p.life) * 100, 0, Math.PI * 2);
                this.ctx.strokeStyle = p.color; this.ctx.lineWidth = 1; this.ctx.stroke();
            }
        });
        this.ctx.globalAlpha = 1.0; this.ctx.globalCompositeOperation = 'source-over';
    } else if (this.envEffect === 'fog') {
        envVisible.forEach(p => {
            this.ctx.globalAlpha = 0.15 * (p.life / 10);
            if (texSmoke && texSmoke.isReady) {
                this.ctx.drawImage(texSmoke, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
            } else {
                const g = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
                g.addColorStop(0, 'rgba(200,200,220,1)'); g.addColorStop(1, 'transparent');
                this.ctx.fillStyle = g; this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); this.ctx.fill();
            }
        });
        this.ctx.globalAlpha = 1.0;
    } else if (this.envEffect === 'solar_flare') {
        envVisible.forEach(p => {
            const alpha = Math.sin((p.life / p.maxLife) * Math.PI) * 0.4;
            this.ctx.globalAlpha = alpha;
            
            if (texSmoke && texSmoke.isReady) {
                // Tint the smoke orange
                this.ctx.fillStyle = '#ff6600';
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
                this.ctx.fill();
                
                this.ctx.drawImage(texSmoke, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
            } else {
                const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
                gradient.addColorStop(0, 'rgba(255, 100, 0, 1)');
                gradient.addColorStop(1, 'transparent');
                this.ctx.fillStyle = gradient;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });
        this.ctx.globalAlpha = 1.0;
        this.ctx.globalCompositeOperation = 'source-over';
        
        // Global orange tint pulsing
        this.ctx.fillStyle = `rgba(255, 69, 0, ${Math.sin(this.time * 0.5) * 0.05 + 0.05})`;
        this.ctx.fillRect(this.camera.x - this.shakeX, this.camera.y - this.shakeY, this.canvas.width / this.zoom, this.canvas.height / this.zoom);
    }
    this.ctx.globalCompositeOperation = 'source-over';

    this.ctx.restore();

    drawUI(this.ctx, this.canvas, this.time, this.player, this.hazards, this.enemies, this.characterPickup, this.camera, this.zoom, this.pickups);
}