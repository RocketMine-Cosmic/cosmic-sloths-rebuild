// Per-character active mechanics (banners, decoys, hacks, sonic boom, phantom boost)
// extracted from GameEngine.update().

export function updateCharacterMechanics(engine, dt, dx, dy) {
    if (engine.characterId === 'neobyte') {
        engine.characterMechanics.bannerTimer += dt;
        if (engine.characterMechanics.bannerTimer >= 15) {
            engine.characterMechanics.bannerTimer = 0;
            // Tier-7 mastery: +33% banner radius
            const radiusMult = engine.masteryAbilityBoost?.banner?.radiusMult || 1.0;
            engine.characterMechanics.banners.push({ x: engine.player.x, y: engine.player.y, life: 10, radius: 150 * radiusMult });
        }
        let nearBanner = false;
        engine.characterMechanics.banners = engine.characterMechanics.banners.filter(b => {
            b.life -= dt;
            if (Math.hypot(engine.player.x - b.x, engine.player.y - b.y) < b.radius) {
                nearBanner = true;
                if (engine.frameCount % 10 === 0) engine.addParticle(engine.player.x + (Math.random()-0.5)*40, engine.player.y + (Math.random()-0.5)*40, '#0066FF', 1, 'glow');
            }
            return b.life > 0;
        });
        engine.player.bannerBuff = nearBanner;
    }

    if (engine.characterId === 'holodrift' || engine.player.charAugments?.includes('glt_copy')) {
        engine.characterMechanics.decoyTimer += dt;
        // Tier-7 mastery (Holodrift only): decoy cooldown 20s → 14s
        const decoyCdMult = (engine.characterId === 'holodrift' ? engine.masteryAbilityBoost?.decoyCooldownMult : null) || 1.0;
        const threshold = engine.characterId === 'holodrift' ? 20 * decoyCdMult : 60;
        if (engine.characterMechanics.decoyTimer >= threshold) {
            engine.characterMechanics.decoyTimer = 0;
            engine.characterMechanics.decoys.push({ x: engine.player.x, y: engine.player.y, hp: 100, maxHp: 100, life: 15 });
            engine.addParticle(engine.player.x, engine.player.y, engine.characterId === 'holodrift' ? '#00FA9A' : '#FF00FF', 15, 'spark', 1.5);
        }
        engine.characterMechanics.decoys = engine.characterMechanics.decoys.filter(d => d.hp > 0 && d.life > 0);
        engine.characterMechanics.decoys.forEach(d => {
            d.life -= dt;
            if (engine.frameCount % 15 === 0) engine.addParticle(d.x, d.y, engine.characterId === 'holodrift' ? '#00FA9A' : '#FF00FF', 1, 'glow', 0.5);
        });
    }

    if (engine.characterId === 'codebreaker') {
        engine.characterMechanics.hackTimer += dt;
        // Tier-7 mastery: hack cooldown 10s → 7s
        const hackCdMult = engine.masteryAbilityBoost?.hackCooldownMult || 1.0;
        if (engine.characterMechanics.hackTimer >= 10 * hackCdMult) {
            engine.characterMechanics.hackTimer = 0;
            // Hack up to 3 enemies in radius — single-target hack was useless against
            // hordes. Now creates a small "infected pack" that fights for you.
            const candidates = engine.enemies.filter(e => !e.isBoss && !e.hacked && Math.hypot(engine.player.x - e.x, engine.player.y - e.y) < 400);
            const numToHack = Math.min(3, candidates.length);
            for (let i = 0; i < numToHack; i++) {
                const idx = Math.floor(Math.random() * candidates.length);
                const target = candidates.splice(idx, 1)[0];
                target.hacked = true;
                target.color = '#39FF14';
                engine.characterMechanics.hackedEnemies.push(target);
                engine.addDamageText(target.x, target.y - 20, "HACKED", '#39FF14');
                engine.addParticle(target.x, target.y, '#39FF14', 15, 'spark', 2.0);
            }
        }
        engine.characterMechanics.hackedEnemies = engine.characterMechanics.hackedEnemies.filter(e => e.hp > 0 && engine.enemies.includes(e));
    }

    if (engine.characterId === 'skybyte') {
        // Tier-7 mastery: sonic boom charges 33% faster + unlocks a SUPERCHARGE tier
        // (charge keeps building past 100 → up to 200, releasing at supercharge does
        // bigger damage in a wider radius). Players who keep moving are rewarded
        // for not breaking momentum.
        const chargeMult = engine.masteryAbilityBoost?.sonicChargeMult || 1.0;
        const hasSupercharge = !!engine.masteryAbilityBoost?.sonicChargeMult; // tier-7 unlocked
        const maxCharge = hasSupercharge ? 200 : 100;
        if (engine.player.isMoving) {
            // Past 100, charge accumulates at half speed to make supercharge feel earned.
            const cur = engine.characterMechanics.sonicCharge || 0;
            const rate = (cur >= 100 ? 10 : 20) * chargeMult;
            engine.characterMechanics.sonicCharge = Math.min(maxCharge, cur + dt * rate);
            const moveDot = dx * engine.characterMechanics.lastMoveDir.x + dy * engine.characterMechanics.lastMoveDir.y;
            // Only release on direction-change/stop if charge is at FULL (>=maxCharge),
            // so tier-7 owners can keep building past 100 without accidental early release.
            if (moveDot < 0.5 && engine.characterMechanics.sonicCharge >= maxCharge) {
                engine.triggerSonicBoom();
            }
        } else if (engine.characterMechanics.sonicCharge >= 100) {
            engine.triggerSonicBoom();
        } else {
            // Decay charge while standing still — lose 15/sec (about 6.7s to fully drain).
            engine.characterMechanics.sonicCharge = Math.max(0, (engine.characterMechanics.sonicCharge || 0) - dt * 15);
        }
        if (dx !== 0 || dy !== 0) {
            engine.characterMechanics.lastMoveDir = { x: dx, y: dy };
        }
        if (engine.characterMechanics.sonicCharge >= 100 && engine.frameCount % 5 === 0) {
            // Brighter, bigger glow at supercharge.
            const isSuper = engine.characterMechanics.sonicCharge >= 200;
            engine.addParticle(engine.player.x, engine.player.y, isSuper ? '#FFFFFF' : '#00D4FF', isSuper ? 2 : 1, 'spark', isSuper ? 2.5 : 1.5);
        }
    }

    if (engine.characterId === 'dataphantom') {
        engine.player.phantomBoostTimer = (engine.player.phantomBoostTimer || 0) - dt;
        if (engine.player.phantomBoostTimer > 0 && engine.frameCount % 5 === 0) {
            engine.addParticle(engine.player.x, engine.player.y, '#98FF98', 1, 'glow', 1.0);
        }
    }
}