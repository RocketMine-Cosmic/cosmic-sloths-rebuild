import { ARENAS, ENEMIES } from './Constants';

// Arena index -> difficulty tier (0-9)
export function getArenaTier(arenaId) {
    const idx = ARENAS.findIndex(a => a.id === arenaId);
    return Math.max(0, idx);
}

// Pick a boss appropriate for the arena tier
export function selectBossForArena(arenaId) {
    const tier = getArenaTier(arenaId);
    const allBosses = ENEMIES.filter(e => e.isBoss);

    // S20 (The Devourer) — guaranteed Pulsar Guardian as the mythic finale anchor.
    // Lore tie: its pulsar core being consumed by the black hole.
    if (arenaId === 'devourer') {
        const pulsar = allBosses.find(b => b.id === 'boss_pulsar_guardian');
        if (pulsar) return pulsar;
    }

    // Outer Galaxy (tier >= 10 → sectors S11-S19, excluding S20 which is handled
    // above). Random rotation across the full boss pool so the new Pulsar Guardian
    // gets visibility everywhere alongside the existing 6. See SECTORS_11_20_PLAN.md.
    if (tier >= 10) {
        return allBosses[Math.floor(Math.random() * allBosses.length)];
    }

    // Inner Galaxy (S1-S10) — fixed boss-per-tier mapping (unchanged from S5/S6).
    const bossOrder = [
        'boss_nebula_devourer',   // tier 0-1 (azure expanse)
        'boss_plasma_kraken',     // tier 2-3 (mystic cosmos / ethereal nebula)
        'boss_stellar_colossus',  // tier 4-5 (crimson void / solar storm)
        'boss_cosmic_wyrm',       // tier 6-7 (emerald galaxy / shattered core)
        'boss_supernova_empress', // tier 8 (abyssal vortex)
        'boss_nexus_annihilator', // tier 9-10 (turquoise drift / rainbow rift / endless)
    ];
    const bossIndex = Math.min(Math.floor(tier / 1.7), bossOrder.length - 1);
    const bossId = bossOrder[bossIndex];
    return allBosses.find(b => b.id === bossId) || allBosses[Math.floor(Math.random() * allBosses.length)];
}

// Called every frame for each boss — returns new enemy projectiles / side effects
export function updateBossAbilities(boss, dt, player, enemyProjectiles, addParticle, addDamageText, takeDamage, enemies, frameCount, arenaId, modifiers = {}) {
    const tier = getArenaTier(arenaId);
    
    if (!boss.currentPhase) boss.currentPhase = 1;

    // World boss uses a per-run TIME-based phase trigger so late joiners don't
    // spawn into Phase 3 just because cloud HP is already drained. Other bosses
    // keep the original HP-based logic.
    if (boss.isWorldBoss) {
        boss.runTime = (boss.runTime || 0) + dt;
        if (boss.runTime > 120 && boss.currentPhase < 3) {
            boss.currentPhase = 3;
            addDamageText(boss.x, boss.y - boss.radius - 50, '⚠️ ENRAGE: MAXIMAL OVERDRIVE! ⚠️', '#ff0000');
            addParticle(boss.x, boss.y, '#ff0000', 50, 'glow', 5);
        } else if (boss.runTime > 60 && boss.currentPhase < 2) {
            boss.currentPhase = 2;
            addDamageText(boss.x, boss.y - boss.radius - 50, '⚠️ PHASE 2 INITIATED! ⚠️', '#ffaa00');
            addParticle(boss.x, boss.y, '#ffaa00', 30, 'glow', 4);
        }
    } else if (boss.hp < boss.maxHp * 0.1 && boss.currentPhase < 3) {
        boss.currentPhase = 3;
        addDamageText(boss.x, boss.y - boss.radius - 50, '⚠️ CRITICAL HEALTH: MAXIMAL OVERDRIVE! ⚠️', '#ff0000');
        addParticle(boss.x, boss.y, '#ff0000', 50, 'glow', 5);
    } else if (boss.hp < boss.maxHp * 0.5 && boss.currentPhase < 2) {
        boss.currentPhase = 2;
        addDamageText(boss.x, boss.y - boss.radius - 50, '⚠️ PHASE 2 INITIATED! ⚠️', '#ffaa00');
        addParticle(boss.x, boss.y, '#ffaa00', 30, 'glow', 4);
    }
    
    const phase2 = boss.currentPhase >= 2;
    const phase3 = boss.currentPhase >= 3;
    const enraged = phase2; // Fallback for any old logic
    const bossId = boss.originalBossId || boss.id;

    // --- Shared: rotating bullet ring (all bosses, scaled by tier) ---
    if (!boss.skillTimer) boss.skillTimer = 0;
    boss.skillTimer -= dt;
    if (boss.skillTimer <= 0) {
        const baseCount = 6 + tier;
        const projCount = (phase3 ? baseCount * 3 : (phase2 ? baseCount * 2 : baseCount)) * (modifiers.bullet_hell ? 2 : 1);
        const offset = boss.skillPhase || 0;
        boss.skillPhase = (offset + Math.PI / projCount);
        boss.skillTimer = phase3 ? 1.0 : (phase2 ? 1.8 : 3.0);

        for (let i = 0; i < projCount; i++) {
            const angle = (Math.PI * 2 / projCount) * i + offset;
            const speed = 120 + tier * 15;
            enemyProjectiles.push({
                x: boss.x, y: boss.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 6,
                damage: boss.damage * 0.4,
                life: 3.5,
                color: boss.color
            });
        }
    }

    // --- Per-boss unique abilities ---

    if (bossId === 'boss_nebula_devourer') {
        // "Swirling energy tentacles" — spiral burst every 5s
        if (!boss.spiralTimer) boss.spiralTimer = 5;
        boss.spiralTimer -= dt;
        if (boss.spiralTimer <= 1.0 && boss.spiralTimer + dt > 1.0) {
            addDamageText(boss.x, boss.y - boss.radius - 20, '⚠ SPIRAL CHARGING!', '#a855f7');
            addParticle(boss.x, boss.y, '#a855f7', 15, 'glow', 2);
        }
        if (boss.spiralTimer <= 0) {
            boss.spiralTimer = phase3 ? 1.5 : (phase2 ? 2.5 : 4);
            const count = (modifiers.bullet_hell ? 40 : 20) + (phase3 ? 20 : 0);
            boss.spiralPhase = (boss.spiralPhase || 0) + 0.3;
            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 / count) * i + boss.spiralPhase;
                enemyProjectiles.push({
                    x: boss.x, y: boss.y, vx: Math.cos(angle) * (phase3 ? 220 : 180), vy: Math.sin(angle) * (phase3 ? 220 : 180),
                    radius: 8, damage: boss.damage * 0.3, life: 4, color: '#a855f7'
                });
            }
            addParticle(boss.x, boss.y, '#a855f7', 20, 'glow', 2);
            addDamageText(boss.x, boss.y - boss.radius - 20, 'TENTACLE SPIRAL!', '#a855f7');
        }

        // "Ravenous maw" — pulls player closer
        if (!boss.pullTimer) boss.pullTimer = 8;
        boss.pullTimer -= dt;
        // Longer telegraph (2.5s) so the player has time to react and reposition.
        // Re-emit the warning each second so the player sees it even if they
        // were looking elsewhere when it first fired.
        if (boss.pullTimer <= 2.5 && boss.pullTimer + dt > 2.5) {
            addDamageText(boss.x, boss.y - boss.radius - 30, '⚠ DEVOUR INCOMING — RUN!', '#ff00ff');
            addParticle(boss.x, boss.y, '#ff00ff', 30, 'glow', 4);
        }
        if (boss.pullTimer <= 1.5 && boss.pullTimer + dt > 1.5) {
            addDamageText(boss.x, boss.y - boss.radius - 30, '⚠ DEVOUR — 1.5s', '#ff00ff');
        }
        if (boss.pullTimer <= 0.5 && boss.pullTimer + dt > 0.5) {
            addDamageText(player.x, player.y - 60, '⚠ PULL!', '#ff00ff');
        }
        // While Devour is charging, draw a thick beam from boss to player + a pulsing
        // ring around the player so the pull is unmistakable even off-screen.
        if (boss.pullTimer > 0 && boss.pullTimer <= 2.5) {
            const dx = player.x - boss.x;
            const dy = player.y - boss.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) {
                // Thick beam — 3 strands of denser particles for visibility.
                const steps = 12;
                for (let i = 1; i <= steps; i++) {
                    const t = i / (steps + 1);
                    addParticle(boss.x + dx * t, boss.y + dy * t, '#ff00ff', 2, 'glow', 2.0);
                }
                // Pulsing warning ring on the player.
                if (Math.random() < 0.6) {
                    addParticle(player.x, player.y, '#ff00ff', 1, 'shockwave', 2.5, { growthRate: 200, lineWidth: 4 });
                }
            }
        }
        if (boss.pullTimer <= 0) {
            // Phase 3 cooldown bumped 3s → 4s so it can't double-tap as quickly.
            boss.pullTimer = phase3 ? 4 : (phase2 ? 5 : 8);
            const dx = boss.x - player.x;
            const dy = boss.y - player.y;
            const dist = Math.hypot(dx, dy);
            if (dist < (phase3 ? 800 : 600)) {
                player.x += (dx / dist) * (phase3 ? 100 : 70) * dt * 60;
                player.y += (dy / dist) * (phase3 ? 100 : 70) * dt * 60;
                addParticle(boss.x, boss.y, '#a855f7', 30, 'glow', 3);
                if (boss.pullTimer <= dt) addDamageText(boss.x, boss.y - boss.radius - 30, 'DEVOUR!', '#a855f7');
            }
        }
        
        // Void Bomb (Telegraphed Explosion)
        if (!boss.bombTimer) boss.bombTimer = 6;
        boss.bombTimer -= dt;
        if (boss.bombTimer <= 0) {
            boss.bombTimer = phase3 ? 2.5 : (phase2 ? 4 : 7);
            const tx = player.x, ty = player.y;
            boss._bombWarning = boss._bombWarning || [];
            // t0 added 2026-08-03: the telegraph renderer needs the initial timer
            // to compute how full the warning decal is. Draw-only — nothing in
            // this file or in EnemyAI reads t0.
            const bombT0 = phase3 ? 1.2 : 2.0;
            boss._bombWarning.push({ x: tx, y: ty, timer: bombT0, t0: bombT0 });
            addDamageText(tx, ty - 40, '⚠ VOID BOMB!', '#581c87');
        }
        if (boss._bombWarning) {
            boss._bombWarning = boss._bombWarning.filter(w => {
                w.timer -= dt;
                addParticle(w.x, w.y, '#581c87', 4, 'glow', 2.0);
                if (w.timer <= 0) {
                    const dist = Math.hypot(player.x - w.x, player.y - w.y);
                    if (dist < 120) takeDamage(boss.damage * 1.5);
                    const count = (modifiers.bullet_hell ? 20 : 12) + (phase3 ? 8 : 0);
                    for (let i = 0; i < count; i++) {
                        const a = (Math.PI * 2 / count) * i;
                        enemyProjectiles.push({ x: w.x, y: w.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, radius: 15, damage: boss.damage * 0.8, life: 3, color: '#581c87' });
                    }
                    addParticle(w.x, w.y, '#581c87', 40, 'glow', 5);
                    return false;
                }
                return true;
            });
        }
    }

    if (bossId === 'boss_plasma_kraken') {
        // "Long glowing tentacles" — fires aimed shots spread
        if (!boss.krakTimer) boss.krakTimer = 2.5;
        boss.krakTimer -= dt;
        if (boss.krakTimer <= 0.5 && boss.krakTimer + dt > 0.5) {
            addDamageText(boss.x, boss.y - boss.radius - 20, '⚠ TARGETING!', '#ef4444');
        }
        if (boss.krakTimer <= 0) {
            boss.krakTimer = phase3 ? 0.6 : (phase2 ? 1.0 : 2.0);
            const baseAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
            const spread = (phase3 ? 7 : (phase2 ? 5 : 3)) * (modifiers.bullet_hell ? 2 : 1);
            for (let i = -spread; i <= spread; i += (phase2 ? 1 : 2)) {
                const a = baseAngle + (i * Math.PI / 16);
                enemyProjectiles.push({
                    x: boss.x, y: boss.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
                    radius: 12, damage: boss.damage * 0.6, life: 3, color: '#ef4444'
                });
            }
            addParticle(boss.x, boss.y, '#ef4444', 15, 'glow', 2);
        }

        // "Fiery core" — periodic explosion burst at player location
        if (!boss.novaTimer) boss.novaTimer = 8;
        boss.novaTimer -= dt;
        if (boss.novaTimer <= 0) {
            boss.novaTimer = phase3 ? 3 : (phase2 ? 5 : 8);
            const tx = player.x, ty = player.y;
            boss._novaWarning = boss._novaWarning || [];
            // t0: see the Void Bomb note above. Draw-only.
            const novaT0 = phase3 ? 0.8 : 1.2;
            boss._novaWarning.push({ x: tx, y: ty, timer: novaT0, t0: novaT0 });
            addDamageText(tx, ty - 30, '⚠ PLASMA NOVA!', '#ef4444');
        }
        if (boss._novaWarning) {
            boss._novaWarning = boss._novaWarning.filter(w => {
                w.timer -= dt;
                addParticle(w.x, w.y, '#ef4444', 3, 'glow', 1.5);
                if (w.timer <= 0) {
                    const dist = Math.hypot(player.x - w.x, player.y - w.y);
                    if (dist < 100) takeDamage(boss.damage * 1.5);
                    const novaCount = (modifiers.bullet_hell ? 30 : 16) + (phase3 ? 10 : 0);
                    for (let i = 0; i < novaCount; i++) {
                        const a = (Math.PI * 2 / novaCount) * i;
                        enemyProjectiles.push({ x: w.x, y: w.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, radius: 8, damage: boss.damage * 0.5, life: 2.5, color: '#ff4500' });
                    }
                    addParticle(w.x, w.y, '#ff4500', 30, 'glow', 4);
                    return false;
                }
                return true;
            });
        }
        
        // Flame Trails
        if (!boss.trailTimer) boss.trailTimer = 0.1;
        boss.trailTimer -= dt;
        if (boss.trailTimer <= 0) {
            boss.trailTimer = 0.15;
            if (Math.random() < (phase3 ? 0.9 : (phase2 ? 0.6 : 0.3))) {
                enemyProjectiles.push({
                    x: boss.x + (Math.random() - 0.5) * boss.radius * 1.5, 
                    y: boss.y + (Math.random() - 0.5) * boss.radius * 1.5,
                    vx: 0, vy: 0, radius: 25, damage: boss.damage * 0.3, life: 2.5, color: 'rgba(239, 68, 68, 0.6)'
                });
                addParticle(boss.x, boss.y, '#ef4444', 3, 'spark', 1.5);
            }
        }
    }

    if (bossId === 'boss_stellar_colossus') {
        // "Rotating arms" — spinning laser arms
        if (!boss.armTimer) boss.armTimer = 3;
        boss.armTimer -= dt;
        if (boss.armTimer <= 1.0 && boss.armTimer + dt > 1.0) {
             addDamageText(boss.x, boss.y - boss.radius - 20, '⚠ ARMS CHARGING!', '#f59e0b');
        }
        if (boss.armTimer <= 0) {
            boss.armTimer = phase3 ? 1.2 : (phase2 ? 2.0 : 3);
            const arms = (phase3 ? 10 : (phase2 ? 8 : 5)) * (modifiers.bullet_hell ? 2 : 1);
            for (let i = 0; i < arms; i++) {
                const a = (Math.PI * 2 / arms) * i + (boss.armPhase || 0);
                for (let j = 1; j <= 4; j++) {
                    enemyProjectiles.push({
                        x: boss.x, y: boss.y, vx: Math.cos(a) * 250 * j * 0.35, vy: Math.sin(a) * 250 * j * 0.35,
                        radius: 10, damage: boss.damage * 0.5, life: 3, color: '#f59e0b'
                    });
                }
            }
            boss.armPhase = ((boss.armPhase || 0) + Math.PI / 5) % (Math.PI * 2);
            addDamageText(boss.x, boss.y - boss.radius - 20, 'STELLAR ARMS!', '#f59e0b');
        }

        // "Blazing central eye" — screen-wide beam aimed at player
        if (!boss.eyeTimer) boss.eyeTimer = 10;
        boss.eyeTimer -= dt;
        if (boss.eyeTimer <= 1.5 && boss.eyeTimer + dt > 1.5) {
            addDamageText(boss.x, boss.y - boss.radius - 30, '⚠ SOLAR GAZE LOCK-ON!', '#fbbf24');
            addParticle(boss.x, boss.y, '#fbbf24', 20, 'glow', 2);
        }
        if (boss.eyeTimer <= 0) {
            boss.eyeTimer = phase3 ? 4 : (phase2 ? 6 : 10);
            const angle = Math.atan2(player.y - boss.y, player.x - boss.x);
            const eyeCount = (modifiers.bullet_hell ? 20 : 12) + (phase3 ? 8 : 0);
            for (let i = 0; i < eyeCount; i++) {
                enemyProjectiles.push({
                    x: boss.x, y: boss.y, vx: Math.cos(angle) * (300 + i * 20), vy: Math.sin(angle) * (300 + i * 20),
                    radius: 15, damage: boss.damage * 0.9, life: 2.5, color: '#fbbf24'
                });
            }
            addParticle(boss.x, boss.y, '#fbbf24', 30, 'glow', 4);
            addDamageText(boss.x, boss.y - boss.radius - 30, '☀ SOLAR GAZE!', '#fbbf24');
        }
        
        // Meteor Strike
        if (!boss.meteorTimer) boss.meteorTimer = 5;
        boss.meteorTimer -= dt;
        if (boss.meteorTimer <= 0) {
            boss.meteorTimer = phase3 ? 2 : (phase2 ? 3 : 5);
            boss._meteorWarning = boss._meteorWarning || [];
            const mCount = phase3 ? 8 : (phase2 ? 5 : 3);
            for(let i=0; i<mCount; i++) {
                const tx = player.x + (Math.random() - 0.5) * 400;
                const ty = player.y + (Math.random() - 0.5) * 400;
                // t0: see the Void Bomb note above. Draw-only.
                const meteorT0 = 1.5 + Math.random() * 0.5;
                boss._meteorWarning.push({ x: tx, y: ty, timer: meteorT0, t0: meteorT0 });
                addParticle(tx, ty, '#f59e0b', 5, 'glow', 2);
            }
            addDamageText(boss.x, boss.y - boss.radius - 40, 'METEOR SHOWER!', '#f59e0b');
        }
        if (boss._meteorWarning) {
            boss._meteorWarning = boss._meteorWarning.filter(w => {
                w.timer -= dt;
                addParticle(w.x, w.y, '#f59e0b', 3, 'spark', 1.5);
                if (w.timer <= 0) {
                    const dist = Math.hypot(player.x - w.x, player.y - w.y);
                    if (dist < 90) takeDamage(boss.damage * 1.5);
                    for(let i=0; i<8; i++) {
                        const a = (Math.PI * 2 / 8) * i;
                        enemyProjectiles.push({ x: w.x, y: w.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, radius: 6, damage: boss.damage * 0.5, life: 1.5, color: '#fbbf24' });
                    }
                    addParticle(w.x, w.y, '#f59e0b', 20, 'glow', 3);
                    return false;
                }
                return true;
            });
        }
    }

    if (bossId === 'boss_cosmic_wyrm') {
        // "Serpentine dragon" — charge dash in player direction
        if (!boss.chargeTimer) boss.chargeTimer = 5;
        boss.chargeTimer -= dt;
        if (boss.chargeTimer <= 1.0 && boss.chargeTimer + dt > 1.0) {
            addDamageText(boss.x, boss.y - boss.radius - 30, '⚠ PREPARING DASH!', '#0ea5e9');
            addParticle(boss.x, boss.y, '#0ea5e9', 15, 'glow', 2);
        }
        if (boss.chargeTimer <= 0) {
            boss.chargeTimer = phase3 ? 1.5 : (phase2 ? 3 : 5);
            const dx = player.x - boss.x;
            const dy = player.y - boss.y;
            const dist = Math.hypot(dx, dy);
            boss.chargeDash = { vx: (dx / dist) * (phase3 ? 1000 : 750), vy: (dy / dist) * (phase3 ? 1000 : 750), timer: 0.45 };
            addDamageText(boss.x, boss.y - boss.radius - 30, '🐉 WYRM CHARGE!', '#0ea5e9');
            addParticle(boss.x, boss.y, '#0ea5e9', 20, 'glow', 3);
        }
        if (boss.chargeDash) {
            boss.x += boss.chargeDash.vx * dt;
            boss.y += boss.chargeDash.vy * dt;
            boss.chargeDash.timer -= dt;
            addParticle(boss.x, boss.y, '#0ea5e9', 5, 'glow', 1.5);
            
            // Leave ice shards behind during dash
            if (Math.random() < (phase3 ? 0.7 : 0.4)) {
                 enemyProjectiles.push({
                    x: boss.x, y: boss.y, vx: 0, vy: 0,
                    radius: 12, damage: boss.damage * 0.4, life: 3, color: '#38bdf8'
                });
                addParticle(boss.x, boss.y, '#ffffff', 5, 'spark', 1);
            }

            const dist = Math.hypot(player.x - boss.x, player.y - boss.y);
            if (dist < boss.radius + player.radius + 10) {
                takeDamage(boss.damage * 2.5);
                boss.chargeDash = null;
            }
            if (boss.chargeDash && boss.chargeDash.timer <= 0) boss.chargeDash = null;
        }

        // "Crystal fins" — crystal shards in burst
        if (!boss.shardTimer) boss.shardTimer = 4;
        boss.shardTimer -= dt;
        if (boss.shardTimer <= 0.8 && boss.shardTimer + dt > 0.8) {
            addDamageText(boss.x, boss.y - boss.radius - 20, '⚠ CRYSTALS FORMING!', '#38bdf8');
        }
        if (boss.shardTimer <= 0) {
            boss.shardTimer = phase3 ? 1 : (phase2 ? 2 : 4);
            const base = Math.atan2(player.y - boss.y, player.x - boss.x);
            const offsets = phase3 ? [-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8, 1.0, -1.0] : (modifiers.bullet_hell ? [-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8] : [-0.5, -0.25, 0, 0.25, 0.5]);
            offsets.forEach(off => {
                enemyProjectiles.push({
                    x: boss.x, y: boss.y, vx: Math.cos(base + off) * 320, vy: Math.sin(base + off) * 320,
                    radius: 9, damage: boss.damage * 0.7, life: 2.5, color: '#38bdf8'
                });
            });
        }
        
        // Blizzard Aura
        if (phase2 || phase3) {
            if (Math.random() < (phase3 ? 0.6 : 0.3)) {
                addParticle(boss.x + (Math.random() - 0.5) * 300, boss.y + (Math.random() - 0.5) * 300, '#ffffff', 2, 'spark', 1.5);
            }
            const dist = Math.hypot(player.x - boss.x, player.y - boss.y);
            if (dist < (phase3 ? 350 : 250) && Math.random() < (phase3 ? 0.2 : 0.1)) {
                takeDamage(boss.damage * 0.1);
            }
        }
    }

    if (bossId === 'boss_supernova_empress') {
        // "Flowing energy wings" — wide sweeping arcs
        if (!boss.wingTimer) boss.wingTimer = 3;
        boss.wingTimer -= dt;
        if (boss.wingTimer <= 0.8 && boss.wingTimer + dt > 0.8) {
            addDamageText(boss.x, boss.y - boss.radius - 20, '⚠ WING SWEEP!', '#ec4899');
        }
        if (boss.wingTimer <= 0) {
            boss.wingTimer = phase3 ? 0.8 : (phase2 ? 1.5 : 3);
            const base = Math.atan2(player.y - boss.y, player.x - boss.x);
            const count = (phase3 ? 28 : (phase2 ? 20 : 12)) * (modifiers.bullet_hell ? 2 : 1);
            for (let i = 0; i < count; i++) {
                const a = base - Math.PI / 2.5 + (Math.PI * 2 / 2.5 / count) * i;
                enemyProjectiles.push({
                    x: boss.x, y: boss.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240,
                    radius: 9, damage: boss.damage * 0.45, life: 3, color: '#ec4899'
                });
            }
            addDamageText(boss.x, boss.y - boss.radius - 20, '✨ EMPRESS SWEEP!', '#ec4899');
        }

        // "Crown of flames" — orbiting fire projectiles that explode outward
        if (!boss.crownTimer) boss.crownTimer = 7;
        boss.crownTimer -= dt;
        if (boss.crownTimer <= 1.2 && boss.crownTimer + dt > 1.2) {
            addDamageText(boss.x, boss.y - boss.radius - 30, '⚠ CROWN IGNITING!', '#fbbf24');
            addParticle(boss.x, boss.y, '#fbbf24', 20, 'glow', 2);
        }
        if (boss.crownTimer <= 0) {
            boss.crownTimer = phase3 ? 2.5 : (phase2 ? 4 : 7);
            const crownCount = (modifiers.bullet_hell ? 20 : 10) + (phase3 ? 10 : 0);
            for (let i = 0; i < crownCount; i++) {
                const a = (Math.PI * 2 / crownCount) * i;
                enemyProjectiles.push({
                    x: boss.x + Math.cos(a) * boss.radius,
                    y: boss.y + Math.sin(a) * boss.radius,
                    vx: Math.cos(a) * 300, vy: Math.sin(a) * 300,
                    radius: 12, damage: boss.damage * 0.6, life: 2.5, color: '#fbbf24'
                });
            }
            addParticle(boss.x, boss.y, '#fbbf24', 30, 'glow', 3);
            addDamageText(boss.x, boss.y - boss.radius - 30, '👑 CROWN OF FLAMES!', '#fbbf24');
        }

        // Enrage: rapidly blinks (teleports near player) AND shoots on blink
        if ((phase2 || phase3) && !boss.blinkTimer) boss.blinkTimer = 3;
        if (boss.blinkTimer) {
            boss.blinkTimer -= dt;
            if (boss.blinkTimer <= 0.5 && boss.blinkTimer + dt > 0.5) {
                addDamageText(boss.x, boss.y - boss.radius - 20, '⚠ TELEPORTING!', '#ec4899');
            }
            if (boss.blinkTimer <= 0) {
                boss.blinkTimer = phase3 ? 1.5 : 3;
                const angle = Math.random() * Math.PI * 2;
                boss.x = player.x + Math.cos(angle) * 250;
                boss.y = player.y + Math.sin(angle) * 250;
                addParticle(boss.x, boss.y, '#ec4899', 30, 'glow', 4);
                addDamageText(boss.x, boss.y - boss.radius - 20, 'EMPRESS BLINK!', '#ec4899');

                // Reset in-progress attack timers so any "charging" telegraph
                // doesn't fire instantly from the new position right after blinking.
                // Min reset = 0.6s so the player gets a brief window to react.
                if (boss.skillTimer < 0.6) boss.skillTimer = 0.6;
                if (boss.wingTimer < 0.8) boss.wingTimer = 0.8;
                if (boss.crownTimer < 1.2) boss.crownTimer = 1.2;
                if (boss.starTimer < 1.5) boss.starTimer = 1.5;

                // Shoot circle on blink
                for(let i=0; i<12; i++) {
                    const a = (Math.PI * 2 / 12) * i;
                    enemyProjectiles.push({
                        x: boss.x, y: boss.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150,
                        radius: 8, damage: boss.damage * 0.5, life: 2, color: '#ec4899'
                    });
                }
            }
        }
        
        // Starfall
        if (!boss.starTimer) boss.starTimer = 9;
        boss.starTimer -= dt;
        if (boss.starTimer <= 1.5 && boss.starTimer + dt > 1.5) {
            addDamageText(boss.x, boss.y - boss.radius - 40, '⚠ STARFALL INCOMING!', '#fbcfe8');
        }
        if (boss.starTimer <= 0) {
            boss.starTimer = phase3 ? 3 : (phase2 ? 5 : 9);
            const starCount = phase3 ? 18 : (phase2 ? 12 : 8);
            for(let i=0; i<starCount; i++) {
                const tx = player.x + (Math.random() - 0.5) * 800;
                const ty = player.y - 600 - Math.random() * 200;
                enemyProjectiles.push({
                    x: tx, y: ty,
                    vx: (Math.random() - 0.5) * 50, vy: 500 + Math.random() * 300,
                    radius: 15, damage: boss.damage * 0.8, life: 5, color: '#fbcfe8'
                });
                addParticle(tx, ty, '#fbcfe8', 10, 'glow', 2);
            }
            addDamageText(boss.x, boss.y - boss.radius - 40, '🌟 STARFALL!', '#fbcfe8');
            addParticle(boss.x, boss.y, '#fbcfe8', 30, 'glow', 3);
        }
    }

    if (bossId === 'boss_nexus_annihilator') {
        // "Rotating metallic rings" — dense ring attacks
        if (!boss.ringTimer) boss.ringTimer = 1.5;
        boss.ringTimer -= dt;
        if (boss.ringTimer <= 0) {
            boss.ringTimer = phase3 ? 0.5 : (phase2 ? 0.8 : 1.5);
            const count = (phase3 ? 40 : (phase2 ? 30 : 20)) * (modifiers.bullet_hell ? 2 : 1);
            const phase = boss.ringPhase || 0;
            for (let i = 0; i < count; i++) {
                const a = (Math.PI * 2 / count) * i + phase;
                enemyProjectiles.push({
                    x: boss.x, y: boss.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220,
                    radius: 8, damage: boss.damage * 0.5, life: 4, color: '#7c3aed'
                });
            }
            boss.ringPhase = (phase + Math.PI / count);
        }

        // "Massive energy tendrils" — long tracking beams
        if (!boss.tendrilTimer) boss.tendrilTimer = 4;
        boss.tendrilTimer -= dt;
        if (boss.tendrilTimer <= 1.0 && boss.tendrilTimer + dt > 1.0) {
             addDamageText(boss.x, boss.y - boss.radius - 30, '⚠ TENDRILS CHARGING!', '#c084fc');
        }
        if (boss.tendrilTimer <= 0) {
            boss.tendrilTimer = phase3 ? 1.5 : (phase2 ? 2.5 : 4);
            const angle = Math.atan2(player.y - boss.y, player.x - boss.x);
            const tendrils = (phase3 ? 10 : (phase2 ? 7 : 4)) * (modifiers.bullet_hell ? 2 : 1);
            for (let t = 0; t < tendrils; t++) {
                const a = angle + (t - Math.floor(tendrils / 2)) * 0.2;
                for (let j = 0; j < 6; j++) {
                    enemyProjectiles.push({
                        x: boss.x, y: boss.y, vx: Math.cos(a) * (300 + j * 50), vy: Math.sin(a) * (300 + j * 50),
                        radius: 12, damage: boss.damage * 0.8, life: 2.5, color: '#c084fc'
                    });
                }
            }
            addParticle(boss.x, boss.y, '#c084fc', 30, 'glow', 4);
            addDamageText(boss.x, boss.y - boss.radius - 30, '⚡ ANNIHILATOR TENDRIL!', '#c084fc');
        }

        // "Glowing purple energy core" — periodic shockwave
        if (!boss.shockTimer) boss.shockTimer = 8;
        boss.shockTimer -= dt;
        if (boss.shockTimer <= 1.5 && boss.shockTimer + dt > 1.5) {
             addDamageText(boss.x, boss.y - boss.radius - 30, '⚠ SHOCKWAVE WARNING!', '#7c3aed');
             addParticle(boss.x, boss.y, '#7c3aed', 20, 'glow', 3);
        }
        if (boss.shockTimer <= 0) {
            boss.shockTimer = phase3 ? 2.5 : (phase2 ? 4 : 8);
            const dist = Math.hypot(player.x - boss.x, player.y - boss.y);
            if (dist < (phase3 ? 600 : 400)) {
                takeDamage(boss.damage * 1.5);
                // Push back player
                const pushAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
                player.x += Math.cos(pushAngle) * 300;
                player.y += Math.sin(pushAngle) * 300;
            }
            addParticle(boss.x, boss.y, '#7c3aed', 50, 'glow', 6);
            addDamageText(boss.x, boss.y - boss.radius - 30, '💥 NEXUS SHOCKWAVE!', '#7c3aed');
        }
        
        // Reality Tear - sweeping lasers across the field
        if (!boss.tearTimer) boss.tearTimer = 12;
        boss.tearTimer -= dt;
        if (boss.tearTimer <= 2.0 && boss.tearTimer + dt > 2.0) {
             addDamageText(boss.x, boss.y - boss.radius - 40, '⚠ REALITY INSTABILITY DETECTED!', '#ffffff');
        }
        if (boss.tearTimer <= 0) {
            boss.tearTimer = phase3 ? 5 : (phase2 ? 8 : 12);
            const tearCount = phase3 ? 10 : (phase2 ? 6 : 4);
            for(let i=0; i<tearCount; i++) {
                const a = (Math.PI * 2 / tearCount) * i + Math.random();
                for(let d=1; d<15; d++) {
                    enemyProjectiles.push({
                        x: boss.x, y: boss.y, vx: Math.cos(a) * 150 * d * 0.2, vy: Math.sin(a) * 150 * d * 0.2,
                        radius: 12, damage: boss.damage * 1.2, life: 4, color: '#ffffff'
                    });
                    addParticle(boss.x + Math.cos(a) * d * 30, boss.y + Math.sin(a) * d * 30, '#c084fc', 2, 'glow', 1);
                }
            }
            addDamageText(boss.x, boss.y - boss.radius - 40, '🌌 REALITY TEAR!', '#ffffff');
            addParticle(boss.x, boss.y, '#ffffff', 40, 'glow', 4);
        }
    }
}