import React, { useEffect, useRef } from 'react';

export default function SpaceBackground() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        let animId;
        let time = 0;
        let isVisible = false;

        const observer = new IntersectionObserver((entries) => {
            isVisible = entries[0].isIntersecting;
            if (isVisible && !animId) {
                animId = requestAnimationFrame(draw);
            }
        });
        observer.observe(canvas);

        const stars = Array.from({ length: 220 }, () => ({
            x: Math.random(),
            y: Math.random(),
            size: Math.random() * 1.8 + 0.2,
            speed: Math.random() * 0.00008 + 0.00002,
            phase: Math.random() * Math.PI * 2,
            color: Math.random() > 0.85 ? (Math.random() > 0.5 ? '#a78bfa' : '#67e8f9') : '#ffffff',
        }));

        const nebulae = [
            { x: 0.15, y: 0.25, rx: 0.35, ry: 0.25, color: '99,102,241', opacity: 0.04 },
            { x: 0.78, y: 0.65, rx: 0.40, ry: 0.28, color: '6,182,212', opacity: 0.035 },
            { x: 0.50, y: 0.80, rx: 0.30, ry: 0.20, color: '168,85,247', opacity: 0.03 },
            { x: 0.88, y: 0.12, rx: 0.25, ry: 0.18, color: '239,68,68', opacity: 0.025 },
        ];

        const resize = () => {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        let preRenderedNebulae = null;
        let lastW = 0, lastH = 0;

        const draw = () => {
            if (!isVisible) {
                animId = null;
                return;
            }
            const W = canvas.width;
            const H = canvas.height;
            time += 0.016;

            if (!preRenderedNebulae || lastW !== W || lastH !== H) {
                lastW = W;
                lastH = H;
                preRenderedNebulae = document.createElement('canvas');
                preRenderedNebulae.width = W;
                preRenderedNebulae.height = H;
                const pCtx = preRenderedNebulae.getContext('2d');
                
                // Deep space background gradient
                const bg = pCtx.createLinearGradient(0, 0, W * 0.4, H);
                bg.addColorStop(0, '#020408');
                bg.addColorStop(0.5, '#050c18');
                bg.addColorStop(1, '#030710');
                pCtx.fillStyle = bg;
                pCtx.fillRect(0, 0, W, H);

                // Nebula blobs
                pCtx.globalCompositeOperation = 'lighter';
                nebulae.forEach(n => {
                    pCtx.save();
                    pCtx.scale(1, n.ry / n.rx);
                    
                    const baseX = n.x * W;
                    const baseY = (n.y * H) * (n.rx / n.ry);
                    
                    for (let i = 0; i < 6; i++) {
                        const pulse = 1 + Math.sin(time * 0.15 + n.x * 10 + i) * 0.05;
                        const angle = (i / 6) * Math.PI * 2 + (n.x * 10);
                        const dist = n.rx * W * 0.35 * Math.abs(Math.sin(i * 1234.5));
                        
                        const cx = baseX + Math.cos(angle) * dist;
                        const cy = baseY + Math.sin(angle) * dist;
                        
                        const radius = n.rx * W * pulse * (0.5 + Math.abs(Math.cos(i * 5678)) * 0.4);
                        
                        const grd = pCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
                        grd.addColorStop(0, `rgba(${n.color},${n.opacity * 1.5})`);
                        grd.addColorStop(0.4, `rgba(${n.color},${n.opacity * 0.8})`);
                        grd.addColorStop(1, `rgba(${n.color},0)`);
                        
                        pCtx.fillStyle = grd;
                        pCtx.beginPath();
                        pCtx.arc(cx, cy, radius, 0, Math.PI * 2);
                        pCtx.fill();
                    }
                    pCtx.restore();
                });
            }

            if (!preRenderedNebulae || preRenderedNebulae.width === 0 || preRenderedNebulae.height === 0) {
                animId = requestAnimationFrame(draw);
                return;
            }

            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(preRenderedNebulae, 0, 0);

            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.5 + Math.sin(time) * 0.1;
            ctx.drawImage(preRenderedNebulae, 0, 0); // Adds the subtle pulsating effect cheaply
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'source-over';

            // Stars
            stars.forEach(s => {
                const twinkle = 0.4 + Math.sin(time * 2 + s.phase) * 0.6;
                ctx.globalAlpha = twinkle;
                ctx.fillStyle = s.color;
                const sx = ((s.x + time * s.speed) % 1) * W;
                const sy = s.y * H;
                ctx.beginPath();
                ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;

            // Horizontal scanline overlay (subtle)
            ctx.fillStyle = 'rgba(0,0,0,0.03)';
            for (let y = 0; y < H; y += 4) {
                ctx.fillRect(0, y, W, 2);
            }

            // Bottom vignette
            const vig = ctx.createLinearGradient(0, H * 0.6, 0, H);
            vig.addColorStop(0, 'rgba(2,4,8,0)');
            vig.addColorStop(1, 'rgba(2,4,8,0.7)');
            ctx.fillStyle = vig;
            ctx.fillRect(0, 0, W, H);

            // Side vignettes
            const vigL = ctx.createLinearGradient(0, 0, W * 0.15, 0);
            vigL.addColorStop(0, 'rgba(2,4,8,0.6)');
            vigL.addColorStop(1, 'rgba(2,4,8,0)');
            ctx.fillStyle = vigL;
            ctx.fillRect(0, 0, W, H);

            const vigR = ctx.createLinearGradient(W, 0, W * 0.85, 0);
            vigR.addColorStop(0, 'rgba(2,4,8,0.6)');
            vigR.addColorStop(1, 'rgba(2,4,8,0)');
            ctx.fillStyle = vigR;
            ctx.fillRect(0, 0, W, H);

            animId = requestAnimationFrame(draw);
        };

        // Pause animation when tab is hidden to save CPU
        const onVisibilityChange = () => {
            if (document.hidden) {
                if (animId) { cancelAnimationFrame(animId); animId = null; }
            } else if (!animId) {
                animId = requestAnimationFrame(draw);
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);

        animId = requestAnimationFrame(draw);
        return () => {
            observer.disconnect();
            if (animId) cancelAnimationFrame(animId);
            window.removeEventListener('resize', resize);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 0 }}
        />
    );
}