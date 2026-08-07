import React, { useRef, useEffect } from 'react';
import { ENEMIES } from '../../game/Constants';
import { drawEnemy } from '../../game/EnemyRenderer';

export default function BossPreview({ bossId }) {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        const BOSS_MAPPING = {
            'world_boss_0': 'boss_nebula_devourer',
            'world_boss_1': 'boss_plasma_kraken',
            'world_boss_2': 'boss_stellar_colossus',
            'world_boss_3': 'boss_cosmic_wyrm',
        };
        
        const mappedId = BOSS_MAPPING[bossId] || bossId;
        const bossTemplate = ENEMIES.find(e => e.id === mappedId);
        
        if (!bossTemplate) return;

        let animationId;
        let startTime = performance.now();
        let isVisible = false;

        const observer = new IntersectionObserver((entries) => {
            isVisible = entries[0].isIntersecting;
            if (isVisible && !animationId) {
                animationId = requestAnimationFrame(loop);
            }
        });
        observer.observe(canvas);

        const loop = (timestamp) => {
            if (!isVisible) {
                animationId = null;
                return;
            }
            const time = (timestamp - startTime) / 1000;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            
            // Scale to fit a 300x300 canvas. Max boss drawSize is ~ 160 * 3.5 = 560
            const scale = 300 / 580;
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(scale, scale);
            
            const localBoss = { ...bossTemplate, x: 0, y: 0 };
            drawEnemy(ctx, localBoss, time, -100); // playerX < boss.x makes it face left
            
            ctx.restore();
            animationId = requestAnimationFrame(loop);
        };
        
        animationId = requestAnimationFrame(loop);

        return () => {
            observer.disconnect();
            if (animationId) cancelAnimationFrame(animationId);
        };
    }, [bossId]);

    return (
        <canvas 
            ref={canvasRef} 
            width={300} 
            height={300} 
            className="w-full h-full object-contain pointer-events-none p-2"
        />
    );
}