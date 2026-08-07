import { CHARACTERS } from './Constants';
import { SFXManager } from './SFXManager';

export function triggerSquadUltimate(engine, tier = 'full') {
    const chars = engine.save.unlockedCharacters && engine.save.unlockedCharacters.length > 0 ? engine.save.unlockedCharacters : ['neobyte'];
    const cloneCharId = chars[Math.floor(Math.random() * chars.length)];
    const charData = CHARACTERS.find(c => c.id === cloneCharId) || CHARACTERS[0];

    const isLite = tier === 'lite';
    const label = isLite ? "SQUAD LITE DEPLOYED!" : "SQUAD ULTIMATE DEPLOYED!";
    const explosionScale = isLite ? 1.2 : 2.0;

    engine.addDamageText(engine.player.x, engine.player.y - 60, label, '#a855f7');
    engine.particleManager.createExplosion(engine.player.x, engine.player.y, '#a855f7', explosionScale);
    SFXManager.playLevelUp();

    let playerImage = null;
    if (charData.image) { playerImage = new Image(); playerImage.src = charData.image; }
    let idleImage = null;
    if (charData.idleSprite) { idleImage = new Image(); idleImage.src = charData.idleSprite; }
    let walkImage = null;
    if (charData.walkSprite) { walkImage = new Image(); walkImage.src = charData.walkSprite; }

    // Lite tier: capped damage (no player upgrade scaling) and shorter duration.
    // Full tier: scales with player's full upgrade stack — current behaviour.
    const damageMult = isLite
        ? (charData.damageMult || 1) * 1.0
        : (charData.damageMult || 1) * engine.player.damageMult * 1.5;
    const life = 20;

    engine.squadClones = engine.squadClones || [];
    const spawnRadius = 60;
    const spawnAngle = Math.random() * Math.PI * 2;
    engine.squadClones.push({
        x: engine.player.x + Math.cos(spawnAngle) * spawnRadius,
        y: engine.player.y + Math.sin(spawnAngle) * spawnRadius,
        radius: 16,
        life,
        charId: cloneCharId,
        color: charData.color,
        speed: charData.speed * 60,
        damageMult,
        image: playerImage,
        idleImage: idleImage,
        walkImage: walkImage,
        currentFrame: 0,
        frameTimer: 0,
        facingLeft: false,
        isMoving: false,
        attackTimer: 0
    });
}

export function updateSquadClones(engine, dt) {
    if (!engine.squadClones) return;
    
    engine.squadClones = engine.squadClones.filter(clone => {
        clone.life -= dt;
        
        const SPRITE_FRAMES = 25;
        const FRAME_DURATION = 1 / 12;
        clone.frameTimer += dt;
        if (clone.frameTimer >= FRAME_DURATION) {
            clone.frameTimer -= FRAME_DURATION;
            clone.currentFrame = (clone.currentFrame + 1) % SPRITE_FRAMES;
        }

        let nearest = null;
        let minDist = Infinity;
        engine.enemies.forEach(e => {
            if (e.hp <= 0) return;
            const d = Math.hypot(e.x - clone.x, e.y - clone.y);
            if (d < minDist) { minDist = d; nearest = e; }
        });
        
        if (nearest) {
            clone.isMoving = true;
            if (minDist > 100) {
                const angle = Math.atan2(nearest.y - clone.y, nearest.x - clone.x);
                clone.x += Math.cos(angle) * clone.speed * dt;
                clone.y += Math.sin(angle) * clone.speed * dt;
                clone.facingLeft = Math.cos(angle) < 0;
            } else {
                clone.isMoving = false;
            }
            
            clone.attackTimer -= dt;
            if (clone.attackTimer <= 0) {
                clone.attackTimer = 0.5;
                const angle = Math.atan2(nearest.y - clone.y, nearest.x - clone.x);
                engine.projectiles.push({
                    x: clone.x, y: clone.y,
                    vx: Math.cos(angle) * 500,
                    vy: Math.sin(angle) * 500,
                    radius: 8, damage: 30 * clone.damageMult, pierce: 3, life: 2, color: clone.color, type: 'beam',
                    // Tag with a pseudo-weaponId so squad-clone damage shows up in the
                    // post-run weapon breakdown instead of vanishing into "untracked"
                    // (Texxy bug 2026-05-15 — ~50% of damage was unaccounted for in
                    // runs where squad ultimate fired multiple times).
                    weaponId: 'squadUltimate'
                });
                engine.addParticle(clone.x, clone.y, clone.color, 5, 'spark', 1);
            }
        } else {
            clone.isMoving = false;
            const dToPlayer = Math.hypot(engine.player.x - clone.x, engine.player.y - clone.y);
            if (dToPlayer > 150) {
                clone.isMoving = true;
                const angle = Math.atan2(engine.player.y - clone.y, engine.player.x - clone.x);
                clone.x += Math.cos(angle) * clone.speed * dt;
                clone.y += Math.sin(angle) * clone.speed * dt;
                clone.facingLeft = Math.cos(angle) < 0;
            }
        }
        
        // No bounds clamp — clones operate in WORLD coordinates and the
        // player-tracking branch above (dToPlayer > 150) already pulls them
        // back if they drift away from the player. The old `engine.width/height`
        // clamp used undefined values → NaN positions → clones spawned/froze
        // off-map and dealt no damage (Anubis bug 2026-05-20).

        if (clone.life <= 0) {
            engine.addParticle(clone.x, clone.y, clone.color, 20, 'glow', 2);
        }
        
        return clone.life > 0;
    });
}