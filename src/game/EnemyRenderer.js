// 2026-07-05 (Mustard Discord): certain sprite art assets are dark-toned
// silhouettes that vanish against similarly-dark cosmic backgrounds
// (Ethereal Nebula, Andromeda's Edge, Shattered Core, Stormfront Nebula,
// Pillars of Creation). Fix is targeted, not global: only these enemy IDs
// get a bright halo drawn BEHIND the sprite so the silhouette reads against
// any background. Cost = one extra drawImage per instance, and only for
// this ~handful of mob types — no perf impact on the rest of the roster.
// 2026-08-07 (Briantjeuh FPS report) — the elite aura built a fresh
// createRadialGradient for EVERY elite EVERY frame. Gradient construction is one
// of the more expensive 2D canvas allocations, and the C8 change on 2026-08-03
// made elites both more common on screen and more expensive to draw. The gradient
// only depends on radius (colours are fixed), and it's built in LOCAL space (the
// ctx is already translated to the enemy), so it caches perfectly by radius.
// Rounded to whole pixels so near-identical radii share one entry.
const _eliteGradCache = new Map();
function getEliteGradient(ctx, radius) {
    const key = Math.round(radius);
    let g = _eliteGradCache.get(key);
    if (!g) {
        g = ctx.createRadialGradient(0, 0, key * 0.5 / 1.6, 0, 0, key);
        g.addColorStop(0, '#ff6600');
        g.addColorStop(0.5, '#ff2200');
        g.addColorStop(1, 'transparent');
        _eliteGradCache.set(key, g);
    }
    return g;
}

const RIM_LIGHT_IDS = new Set([
    't10_shadow',
    't11_shadow_mantling',
    't13_void_shark',
    't14_cosmic_manta_ray',
    'boss_nexus_annihilator',
]);

export function drawEnemy(ctx, e, time, playerX) {
    ctx.save();
    ctx.translate(e.x, e.y);
    
    if (playerX < e.x) {
        ctx.scale(-1, 1);
    }

    // Elite aura — drawn first (behind sprite/body)
    if (e.isElite) {
        const eliteT = time * 4;
        const elitePulse = 0.6 + Math.sin(eliteT * 2) * 0.25;
        const auraRadius = e.radius * 1.6;
        ctx.save();
        // C8 2026-08-03 — was globalCompositeOperation = 'screen'. Additive
        // orange over a bright background saturates straight to white, so in
        // exactly the busy moments where you most need to spot an elite, the
        // elite tell disappeared. source-over keeps the orange orange.
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = elitePulse;
        ctx.fillStyle = getEliteGradient(ctx, auraRadius);
        ctx.beginPath();
        ctx.arc(0, 0, auraRadius, 0, Math.PI * 2);
        ctx.fill();
        // Spinning rune rings. C8: dark backing stroke first so the rings hold
        // their shape against a light background, then the rune colour at 0.8
        // instead of 0.5 — they were the part that washed out first.
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = 'rgba(40,10,0,1)';
        ctx.lineWidth = 4;
        for (let ri = 0; ri < 2; ri++) {
            const rot = eliteT * (ri === 0 ? 1 : -0.7) + ri * Math.PI * 0.5;
            const ringR = e.radius * (1.1 + ri * 0.3);
            ctx.beginPath();
            ctx.arc(0, 0, ringR, rot, rot + Math.PI * 1.3);
            ctx.stroke();
        }
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 2;
        for (let ri = 0; ri < 2; ri++) {
            const rot = eliteT * (ri === 0 ? 1 : -0.7) + ri * Math.PI * 0.5;
            const ringR = e.radius * (1.1 + ri * 0.3);
            ctx.beginPath();
            ctx.arc(0, 0, ringR, rot, rot + Math.PI * 1.3);
            ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    }

    if (e.spriteImage && e.spriteImage.complete && e.spriteImage.naturalWidth > 0) {
        const SPRITE_FRAMES = e.frameCount || 16;
        const speed = e.animationSpeed || 0.15;
        const frame = Math.floor(time / speed) % SPRITE_FRAMES;
        
        const cols = Math.ceil(Math.sqrt(SPRITE_FRAMES));
        const rows = Math.ceil(SPRITE_FRAMES / cols);
        const col = frame % cols;
        const row = Math.floor(frame / cols);
        
        const frameWidth = e.spriteImage.width / cols;
        const frameHeight = e.spriteImage.height / rows;
        
        const drawSize = e.radius * 1.8;
        const bob = Math.sin(time * 3 + e.id.length) * (e.radius * 0.1);

        // Rim-light for readability-flagged dark sprites — see RIM_LIGHT_IDS.
        // shadowBlur is one of the cheapest ways to add a background-agnostic
        // halo (single drawImage, no scratch canvas). Only fires on the ~5
        // flagged IDs so most enemies pay zero cost.
        const needsRim = RIM_LIGHT_IDS.has(e.originalBossId || e.id);
        if (needsRim) {
            ctx.save();
            ctx.shadowColor = 'rgba(180, 220, 255, 0.9)';
            ctx.shadowBlur = 12;
            ctx.drawImage(
                e.spriteImage,
                col * frameWidth, row * frameHeight, frameWidth, frameHeight,
                -drawSize/2, -drawSize/2 + bob, drawSize, drawSize
            );
            ctx.restore();
        }

        ctx.drawImage(
            e.spriteImage,
            col * frameWidth, row * frameHeight, frameWidth, frameHeight,
            -drawSize/2, -drawSize/2 + bob, drawSize, drawSize
        );
        
        ctx.restore();
        return;
    }

    const t = time * 5 + e.x * 0.01;
    const pulse = Math.sin(t) * 0.1 + 1;
    const wiggle = Math.sin(t * 2) * 0.1;

    // Helper to draw tentacles
    const drawTentacle = (count, length, width, color, speed = 1) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i + Math.sin(t * speed) * 0.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(
                Math.cos(angle) * length * 0.5, 
                Math.sin(angle) * length * 0.5 + Math.sin(t * 2 + i) * 10, 
                Math.cos(angle) * length, 
                Math.sin(angle) * length
            );
            ctx.stroke();
        }
    };

    switch (e.originalBossId || e.id) {
        case 't6_frost_wyrm':
        case 't6_flame_wyrm':
            // Long writhing slug
            ctx.fillStyle = '#1a0b2e'; // Dark purple-black
            ctx.beginPath();
            ctx.moveTo(e.radius, 0);
            for(let i=0; i<=10; i++) {
                const x = e.radius - (i * e.radius * 0.2);
                const y = Math.sin(t + i * 0.5) * 5;
                const w = e.radius * (1 - i/12);
                ctx.lineTo(x, y + w);
            }
            for(let i=10; i>=0; i--) {
                const x = e.radius - (i * e.radius * 0.2);
                const y = Math.sin(t + i * 0.5) * 5;
                const w = e.radius * (1 - i/12);
                ctx.lineTo(x, y - w);
            }
            ctx.fill();
            
            // Glowing suckers
            ctx.fillStyle = '#00ffff';
            for(let i=0; i<5; i++) {
                const x = e.radius * 0.8 - (i * 8);
                const y = Math.sin(t + i * 0.5) * 5;
                ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI*2); ctx.fill();
            }
            break;

        case 't8_whisper':
        case 'boss_nebula_devourer':
        case 't3_starfish':
            // Translucent body with stars
            for (let i = 0; i < 6; i++) {
                const offset = Math.sin(t - i) * 8;
                ctx.fillStyle = `rgba(255, 0, 255, ${0.8 - i * 0.1})`;
                ctx.beginPath(); 
                ctx.arc(-i * 10, offset, e.radius - i * 1.5, 0, Math.PI * 2); 
                ctx.fill();
                
                // Stars inside
                ctx.fillStyle = '#ffffff';
                ctx.beginPath(); ctx.arc(-i * 10 + Math.random()*4-2, offset + Math.random()*4-2, 1, 0, Math.PI*2); ctx.fill();
            }
            // Fanged maw
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(e.radius * 0.5, -5); ctx.lineTo(e.radius, 0); ctx.lineTo(e.radius * 0.5, 5);
            ctx.fill();
            break;

        case 't2_eye_tentacle':
        case 't6_chain_eye':
        case 'boss_plasma_kraken':
            // Rocky head
            ctx.fillStyle = '#8b7355';
            ctx.beginPath(); 
            ctx.moveTo(e.radius, 0);
            for(let i=0; i<8; i++) {
                const a = (Math.PI*2/8)*i;
                const r = e.radius + (i%2===0 ? 2 : -2);
                ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
            }
            ctx.fill();
            
            // Crystal tentacles
            drawTentacle(6, e.radius * 2, 3, '#00ffff', 0.5);
            
            // Glowing eye
            ctx.fillStyle = '#ff0000';
            ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI*2); ctx.fill();
            break;

        case 't1_nebula_jelly':
        case 't9_jelly_swarm':
            // Translucent dome
            ctx.fillStyle = `rgba(0, 255, 255, ${0.4 + pulse * 0.2})`;
            ctx.beginPath(); 
            ctx.arc(0, -5, e.radius, Math.PI, 0); 
            ctx.lineTo(e.radius, 5);
            ctx.quadraticCurveTo(0, -2, -e.radius, 5);
            ctx.fill();
            
            // Lightning veins
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0, -e.radius + 2); ctx.lineTo(Math.sin(t)*5, 0); ctx.stroke();
            
            // Pulsing stingers
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 2;
            for(let i=-2; i<=2; i++) {
                ctx.beginPath();
                ctx.moveTo(i*4, 5);
                ctx.lineTo(i*6 + Math.sin(t*2+i)*5, 20);
                ctx.stroke();
            }
            break;

        case 't1_probe':
        case 't2_spore_wasp':
        case 't7_gear_swarm':
            // Insectoid
            ctx.fillStyle = '#00ff00';
            ctx.beginPath(); ctx.ellipse(0, 0, e.radius, e.radius*0.5, 0, 0, Math.PI*2); ctx.fill();
            // Wings
            ctx.fillStyle = `rgba(200, 255, 200, 0.5)`;
            ctx.beginPath(); ctx.ellipse(0, -5, e.radius*1.5, e.radius*0.5, Math.sin(t*20)*0.5, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(0, 5, e.radius*1.5, e.radius*0.5, -Math.sin(t*20)*0.5, 0, Math.PI*2); ctx.fill();
            break;

        case 't10_shadow':
            // Panther-like shadow
            ctx.fillStyle = '#1a0033';
            ctx.beginPath(); ctx.ellipse(0, 0, e.radius*1.2, e.radius*0.6, 0, 0, Math.PI*2); ctx.fill();
            // Head
            ctx.beginPath(); ctx.arc(e.radius, -2, 6, 0, Math.PI*2); ctx.fill();
            // Portals/Spots
            ctx.fillStyle = '#9400d3';
            ctx.beginPath(); ctx.arc(0, 0, 3 + pulse, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(-5, 2, 2, 0, Math.PI*2); ctx.fill();
            break;

        case 't3_energy_phantom':
        case 't4_spinner':
            // Angular body
            ctx.fillStyle = '#ff4500';
            ctx.beginPath();
            ctx.moveTo(e.radius, 0);
            ctx.lineTo(-5, -5);
            ctx.lineTo(-e.radius, 0);
            ctx.lineTo(-5, 5);
            ctx.fill();
            // Solar wings
            ctx.fillStyle = `rgba(255, 215, 0, 0.6)`;
            ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(-10, -20); ctx.lineTo(10, -15); ctx.fill();
            ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(-10, 20); ctx.lineTo(10, 15); ctx.fill();
            // Blades
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(10, -5); ctx.lineTo(20, -10); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(10, 5); ctx.lineTo(20, 10); ctx.stroke();
            break;

        case 't5_coral':
        case 't8_bio_bloom':
            // Blobby baby
            ctx.fillStyle = '#800080';
            ctx.beginPath(); 
            ctx.arc(0, 0, e.radius * (0.8 + pulse*0.2), 0, Math.PI*2); 
            ctx.fill();
            // Many eyes
            ctx.fillStyle = '#ffff00';
            ctx.beginPath(); ctx.arc(2, -2, 2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(-2, 2, 1.5, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(3, 3, 1, 0, Math.PI*2); ctx.fill();
            break;

        case 't4_mothra':
            // Sleek body
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath(); ctx.ellipse(0, 0, e.radius, e.radius*0.4, 0, 0, Math.PI*2); ctx.fill();
            // Eclipse wings (black with white rim)
            ctx.fillStyle = '#000000';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.beginPath(); 
            ctx.moveTo(0, -2); ctx.quadraticCurveTo(e.radius*1.5, -e.radius*1.5, -e.radius, -5); 
            ctx.fill(); ctx.stroke();
            ctx.beginPath(); 
            ctx.moveTo(0, 2); ctx.quadraticCurveTo(e.radius*1.5, e.radius*1.5, -e.radius, 5); 
            ctx.fill(); ctx.stroke();
            break;

        case 't2_rock':
        case 't9_lava_blob':
        case 'boss_stellar_colossus':
            // Turtle shell
            ctx.fillStyle = '#2f4f4f';
            ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI*2); ctx.fill();
            // Orbs
            ctx.fillStyle = '#4b0082';
            for(let i=0; i<5; i++) {
                const a = (Math.PI*2/5)*i + t*0.5;
                ctx.beginPath(); ctx.arc(Math.cos(a)*e.radius*0.6, Math.sin(a)*e.radius*0.6, 6, 0, Math.PI*2); ctx.fill();
            }
            // Head
            ctx.fillStyle = '#556b2f';
            ctx.beginPath(); ctx.arc(e.radius+5, 0, 8, 0, Math.PI*2); ctx.fill();
            break;

        case 't1_void_glow':
        case 't7_thunder':
            // Crystalline ball
            ctx.fillStyle = '#00ced1';
            ctx.beginPath(); ctx.arc(0, 0, e.radius*0.7, 0, Math.PI*2); ctx.fill();
            // Spikes
            ctx.fillStyle = '#ffffff';
            for(let i=0; i<12; i++) {
                const a = (Math.PI*2/12)*i + t;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a)*e.radius*0.7, Math.sin(a)*e.radius*0.7);
                ctx.lineTo(Math.cos(a)*e.radius*1.5, Math.sin(a)*e.radius*1.5);
                ctx.lineTo(Math.cos(a+0.2)*e.radius*0.7, Math.sin(a+0.2)*e.radius*0.7);
                ctx.fill();
            }
            break;

        case 't3_manta':
        case 't8_ray_fish':
            // Ghost whale
            ctx.fillStyle = `rgba(224, 255, 255, ${0.5 + pulse*0.2})`;
            ctx.beginPath();
            ctx.moveTo(e.radius, 0);
            ctx.quadraticCurveTo(0, -e.radius*0.8, -e.radius*1.5, 0);
            ctx.quadraticCurveTo(0, e.radius*0.8, e.radius, 0);
            ctx.fill();
            // Fins
            ctx.beginPath(); ctx.moveTo(0, -e.radius*0.5); ctx.lineTo(-5, -e.radius*1.2); ctx.lineTo(5, -e.radius*0.5); ctx.fill();
            ctx.beginPath(); ctx.moveTo(0, e.radius*0.5); ctx.lineTo(-5, e.radius*1.2); ctx.lineTo(5, e.radius*0.5); ctx.fill();
            break;

        case 't7_frost_specter':
        case 't4_ribbon':
            // Ice ghost
            ctx.fillStyle = `rgba(173, 216, 230, ${0.6 + pulse*0.2})`;
            ctx.beginPath();
            ctx.moveTo(0, -e.radius);
            ctx.quadraticCurveTo(e.radius, -e.radius, e.radius*0.5, 0);
            ctx.lineTo(0, e.radius + Math.sin(t*5)*5);
            ctx.lineTo(-e.radius*0.5, 0);
            ctx.quadraticCurveTo(-e.radius, -e.radius, 0, -e.radius);
            ctx.fill();
            // Glowing eyes
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(3, -5, 2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(-3, -5, 2, 0, Math.PI*2); ctx.fill();
            break;

        case 't3_angler':
            // Fish body
            ctx.fillStyle = '#ff1493';
            ctx.beginPath(); ctx.ellipse(0, 0, e.radius, e.radius*0.7, 0, 0, Math.PI*2); ctx.fill();
            // Lure
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(5, -5); ctx.quadraticCurveTo(15, -15, 20, -5); ctx.stroke();
            ctx.fillStyle = '#00ffff';
            ctx.beginPath(); ctx.arc(20, -5, 3 + pulse, 0, Math.PI*2); ctx.fill();
            break;

        case 't1_floater':
            // Torso
            ctx.fillStyle = '#dda0dd';
            ctx.beginPath(); ctx.arc(0, -5, 8, 0, Math.PI*2); ctx.fill();
            // Tentacles/Hair
            drawTentacle(5, 20, 2, '#ee82ee', 0.8);
            break;

        case 't5_spike_virus':
            // Beetle shell
            ctx.fillStyle = '#2f0000';
            ctx.beginPath(); ctx.ellipse(0, 0, e.radius, e.radius*1.2, 0, 0, Math.PI*2); ctx.fill();
            // Legs
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            for(let i=0; i<3; i++) {
                const y = -10 + i*10;
                ctx.beginPath(); ctx.moveTo(5, y); ctx.lineTo(15, y - Math.sin(t*10 + i)*5); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-5, y); ctx.lineTo(-15, y - Math.sin(t*10 + i)*5); ctx.stroke();
            }
            break;

        case 't4_vortex':
            // Flat body
            ctx.fillStyle = '#00fa9a';
            ctx.beginPath();
            ctx.moveTo(e.radius*1.5, 0);
            ctx.lineTo(0, -e.radius);
            ctx.lineTo(-e.radius*0.5, 0);
            ctx.lineTo(0, e.radius);
            ctx.fill();
            // Tail
            ctx.strokeStyle = '#ffffff';
            ctx.beginPath(); ctx.moveTo(-e.radius*0.5, 0); ctx.lineTo(-e.radius*2, Math.sin(t*5)*5); ctx.stroke();
            break;

        case 't5_blade':
            // Fractal wings
            ctx.fillStyle = '#000000';
            ctx.beginPath(); ctx.ellipse(0, 0, 3, 10, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = `rgba(255, 105, 180, 0.7)`;
            ctx.save();
            ctx.scale(1 + Math.sin(t*20)*0.2, 1);
            ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(15, -15); ctx.lineTo(10, 0); ctx.lineTo(15, 15); ctx.lineTo(0, 5); ctx.fill();
            ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(-15, -15); ctx.lineTo(-10, 0); ctx.lineTo(-15, 15); ctx.lineTo(0, 5); ctx.fill();
            ctx.restore();
            break;

        case 't10_crystal_vortex':
            // Round body
            ctx.fillStyle = '#000000';
            ctx.strokeStyle = '#800080';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            // Legs
            for(let i=0; i<8; i++) {
                const a = (Math.PI*2/8)*i;
                ctx.beginPath(); ctx.moveTo(Math.cos(a)*e.radius, Math.sin(a)*e.radius);
                ctx.lineTo(Math.cos(a)*(e.radius+5), Math.sin(a)*(e.radius+5));
                ctx.stroke();
            }
            break;

        case 'boss_supernova_empress':
            // Ethereal form
            ctx.fillStyle = `rgba(127, 255, 212, ${0.5 + pulse*0.3})`;
            ctx.beginPath();
            ctx.arc(0, -5, 8, 0, Math.PI*2);
            ctx.moveTo(-8, 0);
            ctx.quadraticCurveTo(0, 20 + Math.sin(t*3)*5, 8, 0);
            ctx.fill();
            // Screaming mouth
            ctx.fillStyle = '#000000';
            ctx.beginPath(); ctx.ellipse(0, -3, 2, 4 + pulse*2, 0, 0, Math.PI*2); ctx.fill();
            break;

        case 'boss_cosmic_wyrm':
            // Dragon shape
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.moveTo(15, 0); // Nose
            ctx.lineTo(0, -5);
            ctx.lineTo(-10, -15); // Wing tip
            ctx.lineTo(-5, 0);
            ctx.lineTo(-10, 15); // Wing tip
            ctx.lineTo(0, 5);
            ctx.fill();
            // Fire breath hint
            ctx.fillStyle = '#ff4500';
            ctx.beginPath(); ctx.arc(18, 0, 2 + Math.random()*2, 0, Math.PI*2); ctx.fill();
            break;

        case 'boss_nexus_annihilator':
            // Fat slug
            ctx.fillStyle = '#483d8b';
            ctx.beginPath(); ctx.ellipse(0, 0, e.radius, e.radius*0.6, 0, 0, Math.PI*2); ctx.fill();
            // Black hole on back
            ctx.fillStyle = '#000000';
            ctx.strokeStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(0, -5, 8, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            break;

        case 'boss_nebula_lord':
        case 'boss_alien_queen':
            // Central body
            ctx.fillStyle = '#32cd32';
            ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI*2); ctx.fill();
            // Heads
            const heads = e.heads || 3;
            for(let i=0; i<heads; i++) {
                const a = (Math.PI*2/heads)*i + Math.sin(t)*0.2;
                const len = 30 + Math.sin(t*2+i)*5;
                ctx.strokeStyle = '#32cd32';
                ctx.lineWidth = 8;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(Math.cos(a)*len*0.5, Math.sin(a)*len*0.5 + 10, Math.cos(a)*len, Math.sin(a)*len);
                ctx.stroke();
                // Head
                ctx.fillStyle = '#006400';
                ctx.beginPath(); ctx.arc(Math.cos(a)*len, Math.sin(a)*len, 8, 0, Math.PI*2); ctx.fill();
                // Mouth
                ctx.fillStyle = '#ff0000';
                ctx.beginPath(); ctx.arc(Math.cos(a)*len + 3, Math.sin(a)*len, 3, 0, Math.PI*2); ctx.fill();
            }
            break;

        case 'boss_supernova':
            // Segmented worm
            for(let i=8; i>=0; i--) {
                const x = -i * 15;
                const y = Math.sin(t - i*0.5) * 10;
                ctx.fillStyle = i===0 ? '#ff4500' : '#8b0000'; // Head is brighter
                ctx.beginPath(); ctx.arc(x, y, 20 - i, 0, Math.PI*2); ctx.fill();
            }
            // Maw
            ctx.fillStyle = '#000000';
            ctx.beginPath(); ctx.arc(5, Math.sin(t)*10, 12, 0, Math.PI*2); ctx.fill();
            break;

        case 'boss_blackhole':
            ctx.fillStyle = e.color;
            ctx.beginPath(); ctx.ellipse(0, 0, e.radius, e.radius * 0.8, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#000000';
            for (let i = 0; i < 5; i++) {
                ctx.beginPath(); ctx.arc(Math.cos(t + i) * e.radius * 0.6, Math.sin(t + i) * e.radius * 0.5, 8, 0, Math.PI * 2); ctx.fill();
            }
            break;

        case 't2_serpent':
            // Ranged enemy: sleek body with a long barrel
            ctx.fillStyle = e.color;
            ctx.beginPath(); ctx.ellipse(0, 0, e.radius * 0.8, e.radius * 0.6, 0, 0, Math.PI * 2); ctx.fill();
            // Barrel
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(e.radius * 0.5, -3, e.radius * 1.2, 6);
            // Scope dot
            ctx.fillStyle = '#ff0000';
            ctx.beginPath(); ctx.arc(e.radius * 1.6, 0, 3 + Math.sin(t * 4) * 1, 0, Math.PI * 2); ctx.fill();
            break;

        case 't2_tank':
        case 't4_juggernaut':
        case 't6_goliath':
            // Tank enemy: heavy armored shell
            ctx.fillStyle = '#333333';
            ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, Math.PI * 2); ctx.fill();
            // Armor plates
            ctx.strokeStyle = '#666666';
            ctx.lineWidth = 4;
            for (let i = 0; i < 4; i++) {
                const a = (Math.PI * 2 / 4) * i + t * 0.2;
                ctx.beginPath();
                ctx.arc(0, 0, e.radius * 0.85, a, a + Math.PI * 0.4);
                ctx.stroke();
            }
            // Glowing core
            ctx.fillStyle = `rgba(255, 50, 50, ${0.6 + pulse * 0.3})`;
            ctx.beginPath(); ctx.arc(0, 0, e.radius * 0.3, 0, Math.PI * 2); ctx.fill();
            // Spikes
            ctx.fillStyle = '#888888';
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI * 2 / 6) * i;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * e.radius, Math.sin(a) * e.radius);
                ctx.lineTo(Math.cos(a) * (e.radius + 6), Math.sin(a) * (e.radius + 6));
                ctx.lineTo(Math.cos(a + 0.15) * e.radius, Math.sin(a + 0.15) * e.radius);
                ctx.fill();
            }
            break;

        default:
            // Generic alien shape instead of a fallback circle
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, e.radius, e.radius * 0.75, 0, 0, Math.PI * 2);
            ctx.fill();
            // Alien eyes
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(e.radius * 0.3, -e.radius * 0.2, e.radius * 0.2, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(e.radius * 0.3, e.radius * 0.2, e.radius * 0.2, 0, Math.PI * 2); ctx.fill();
            // Pupil
            ctx.fillStyle = '#000000';
            ctx.beginPath(); ctx.arc(e.radius * 0.4, -e.radius * 0.2, e.radius * 0.1, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(e.radius * 0.4, e.radius * 0.2, e.radius * 0.1, 0, Math.PI * 2); ctx.fill();
            break;
    }

    ctx.restore();
}