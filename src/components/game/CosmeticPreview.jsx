import React, { useEffect, useRef } from 'react';
import { ParticleManager } from '../../game/ParticleManager';
import { CHARACTERS } from '../../game/Constants';

export default function CosmeticPreview({ trailId = 'default', killEffectId = 'none', playerColor = '#00cfff', charId }) {
    const canvasRef = useRef(null);
    const stateRef = useRef({ animId: null });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;

        let time = 0;
        let frame = 0;
        
        const pm = new ParticleManager();

        let isVisible = false;
        let last = performance.now();
        const observer = new IntersectionObserver((entries) => {
            isVisible = entries[0].isIntersecting;
            if (isVisible && !stateRef.current.animId) {
                last = performance.now();
                stateRef.current.animId = requestAnimationFrame(loop);
            }
        });
        observer.observe(canvas);

        let walkImage = null;
        let staticImage = null;
        if (charId) {
            const charData = CHARACTERS.find(c => c.id === charId);
            if (charData) {
                if (charData.walkSprite) {
                    walkImage = new Image();
                    walkImage.src = charData.walkSprite;
                }
                if (charData.image) {
                    staticImage = new Image();
                    staticImage.src = charData.image;
                }
            }
        }

        const dummies = [
            { x: W * 0.22, y: H * 0.3,  alive: true, respawn: 0 },
            { x: W * 0.78, y: H * 0.35, alive: true, respawn: 0 },
            { x: W * 0.5,  y: H * 0.72, alive: true, respawn: 0 },
        ];

        const loop = (now) => {
            if (!isVisible) {
                stateRef.current.animId = null;
                return;
            }
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;
            time += dt;
            frame++;

            const px = W / 2 + Math.sin(time * 0.8) * W * 0.32;
            const py = H / 2 + Math.sin(time * 1.6) * H * 0.22;

            // Respawn dummies
            dummies.forEach(d => {
                if (!d.alive) { d.respawn -= dt; if (d.respawn <= 0) d.alive = true; }
            });

            // Kill on contact
            dummies.forEach(d => {
                if (!d.alive) return;
                if (Math.hypot(d.x - px, d.y - py) < 40) {
                    d.alive = false;
                    d.respawn = 2.5;
                    if (killEffectId !== 'none') {
                        pm.createKillEffect(d.x, d.y, killEffectId);
                    }
                }
            });

            // Trail particles — every 4 frames
            if (trailId !== 'default' && frame % 4 === 0) {
                pm.createTrail(px, py, trailId, frame);
            }

            pm.update(dt);

            // --- Draw ---
            ctx.fillStyle = '#0d1117';
            ctx.fillRect(0, 0, W, H);

            // Grid (drawn once cheaply)
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 1;
            for (let gx = 0; gx < W; gx += 50) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
            for (let gy = 0; gy < H; gy += 50) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

            // Draw trail particles (tagged _cosmeticLayer='trail' — skipped by the
            // default null-filter pass; need an explicit layer call).
            pm.draw(ctx, 0, 0, W, H, 'trail');

            // Dummies
            ctx.globalCompositeOperation = 'source-over';
            dummies.forEach(d => {
                if (!d.alive) return;
                ctx.strokeStyle = '#ff4444';
                ctx.lineWidth = 2;
                ctx.fillStyle = 'rgba(255,50,50,0.15)';
                ctx.beginPath();
                ctx.arc(d.x, d.y, 20, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#ff6666';
                ctx.font = 'bold 16px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('✕', d.x, d.y);
            });

            // Player Character Render
            const vx = Math.cos(time * 0.8);
            const facingLeft = vx < 0;
            const radius = 16;
            
            ctx.save();
            ctx.translate(px, py);
            if (!facingLeft) ctx.scale(-1, 1);
            
            if (walkImage && walkImage.complete) {
                const SPRITE_FRAMES = 25;
                const spriteFrame = Math.floor(time * 12) % SPRITE_FRAMES;
                const col = spriteFrame % 5;
                const row = Math.floor(spriteFrame / 5);
                const frameWidth = walkImage.width / 5;
                const frameHeight = walkImage.height / 5;
                const sx = col * frameWidth;
                const sy = row * frameHeight;
                const size = radius * 5;
                
                if (playerColor && playerColor !== '#ffffff') {
                    ctx.shadowColor = playerColor;
                    ctx.shadowBlur = 20;
                    ctx.drawImage(walkImage, sx, sy, frameWidth, frameHeight, -size/2, -size/2, size, size);
                    ctx.shadowBlur = 0;
                }
                
                ctx.drawImage(walkImage, sx, sy, frameWidth, frameHeight, -size/2, -size/2, size, size);
            } else if (staticImage && staticImage.complete) {
                const size = radius * 3;
                
                if (playerColor && playerColor !== '#ffffff') {
                    ctx.shadowColor = playerColor;
                    ctx.shadowBlur = 20;
                    ctx.drawImage(staticImage, -size/2, -size/2, size, size);
                    ctx.shadowBlur = 0;
                }
                
                ctx.drawImage(staticImage, -size/2, -size/2, size, size);
            } else {
                ctx.fillStyle = playerColor;
                ctx.shadowColor = playerColor;
                ctx.shadowBlur = 20;
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(-3, -3, 3, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            // Kill-effect particles render ON TOP of the player sprite.
            pm.draw(ctx, 0, 0, W, H, 'killfx');

            // Label
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.font = '14px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('fly into enemies to trigger kill effect', W / 2, H - 12);

            stateRef.current.animId = requestAnimationFrame(loop);
        };

        return () => {
            observer.disconnect();
            if (stateRef.current.animId) {
                cancelAnimationFrame(stateRef.current.animId);
                stateRef.current.animId = null;
            }
        };
    }, [trailId, killEffectId, playerColor, charId]);

    return (
        <canvas
            ref={canvasRef}
            width={640}
            height={320}
            className="w-full h-full object-cover rounded-md border border-slate-700 bg-slate-950"
        />
    );
}