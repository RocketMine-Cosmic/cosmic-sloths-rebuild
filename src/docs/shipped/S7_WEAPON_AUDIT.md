# S7 Weapon Audit — System-wide catalog

Code refs: `game/WeaponSystem.js`, `game/ProjectileSystem.js`, `game/Constants.js` (`WEAPONS`, `SYNERGIES`, `EVOLUTIONS`).

Every weapon, classified by damage model. Numbers are base values; in-run damage = `base × player.damageMult × (1 + min(24, lvl-1) × 0.15) × wDmgMult` capped at `playerDmgCap × wDmgCap` (S6: 4.0 × 1.8).

---

## Damage Models — there are five, not "AoE vs projectile"

The combat system distinguishes weapons by **how** they apply damage. This matters more than weapon names for balance.

### Model A — Single-target projectiles (`p.pierce > 0`, finite hit list)
Each enemy hit costs 1 pierce. Cleanly bounded DPS — scales with fire rate and pierce.
- Uses `sweptHit` collision (path-swept, not point-in-circle) so fast projectiles can't tunnel through bosses.

### Model B — Pulse AoEs (`p.pulse: true`, expanding ring, `hitList`)
Radius grows at 500u/s. Each enemy can be hit **once total** per pulse. One big hit, then nothing.

### Model C — Pushback AoEs (`p.pushback: N`, follows player)
**Damage every 15 frames (~4 ticks/sec), pushback every frame.** Locked to player position. This is the "shield fortress" damage model.
- Pushback resistance: world boss 0%, normal boss 5%, tank 20%, normal 100%.

### Model D — Pool AoEs (stationary, persistent)
**Damage every 15 frames (~4 ticks/sec)**, no hitList — same enemy is re-hit on every tick. Life capped at 15s (S6 cap).

### Model E — Melee swings (instant, range-limited, once per cast)
One damage event per swing. No persistence.

---

## Weapon-by-weapon

### A — Single-target projectiles (5 weapons)

| Weapon | Base dmg | CD (frames) | Notable mechanic | Notes |
|---|---|---|---|---|
| **neoBlaster** | 12 | 45 | Mastery: 3-shot spread | Default starter. Reliable, scales with proj speed |
| **napBeam** | 10 | 50 | Mastery: chains 150u to next enemy | Pierce 2+lvl/2; chain is a separate damageEnemy call |
| **supernovaBeam** | 60 | 60 | EVOLVED napBeam (area_up). 60u explosion on hit at 0.3× | Pierce 10+lvl |
| **bouncingBlade** | 15 | 60 | Mastery: 3 blades. Chains 4/8 times | `type: 'buzzsaw'`, chains 600u |
| **buzzsawSwarm** | 30 | 50 | EVOLVED bouncingBlade (proj_spd). 7-blade cap | Chains 8, life 4s |

**Balance notes:**
- neoBlaster is fine at low levels, falls off vs density. Mastery spread helps.
- napBeam → supernovaBeam path is one of the strongest single-target lines.
- bouncingBlade with chain stacking is genuinely uncapped in chip damage, but the 7-blade cap and 4s life prevent crash.

### B — Pulse AoEs (4 weapons)

| Weapon | Base dmg | CD | Lifetime / radius | Notable mechanic |
|---|---|---|---|---|
| **novaPulse** | 25 | 150 | 0.5s, 10×area, expands 500u/s | Mastery: echo pulse @0.5s |
| **laserNova** | 45 | 120 | SYNERGY napBeam+novaPulse. 0.8s pulse + 6 beams | Beam pierce capped 5+min(6, lvl/2) |
| **quantumCollapse** | 75 | 80 | EVOLVED novaPulse (cd_down). Triple-pulse 1.0/1.2/1.4× at 0/300/600ms | Each pulse separate hitList |
| **seismicWhip** | 35 | 35 | SYNERGY vineWhip+novaPulse. Slash + shockwave on FIRST hit | Shockwave only spawns if at least one enemy was hit |

**Balance notes:**
- These compete with pushback AoEs in the "screen-clear" niche. The hitList limit (one hit per pulse per enemy) makes them weaker than shield bubble in steady-state damage.
- quantumCollapse stacking 3 pulses per cast at very short CD is the strongest pulse weapon — almost a pushback-equivalent on density.
- laserNova has both a pulse AND projectile beams — hybrid model. The beams were nerfed to 6 (was 8) for perf.

### C — Pushback AoEs — THE META TIER (3 weapons)

| Weapon | Base dmg | CD | Life | Radius | Pushback | Notes |
|---|---|---|---|---|---|---|
| **shieldBubble** | 15 | 180 | 2.0s | 80×area (cap 320 vis / 480 dmg) | 250 | Mastery: 50% chance laser at random in-range enemy every 30 frames |
| **aegisMatrix** | 40 | 100 | 2.5s | 120×area (cap 420 vis / 630 dmg) | 300 | EVOLVED shieldBubble (hp_up). Also fires 8 missiles per cast. On hit: 50% chance 5 missiles |
| **burningBarrier** | 18 | 150 | 3.0+0.5×lvl | 100×area (cap 280) | 150 | SYNERGY napalm+shieldBubble. Burn effect |

**Key math — why this tier dominates:**

```
Effective CD = baseCD × max(0.35, player.cooldownMult) × max(0.5, weapon.cdMult)
shieldBubble min CD = 180f × 0.35 × 0.5 = 31.5f = 0.525s
shieldBubble life     = 2.0s
→ 2.0 / 0.525 ≈ 3.8 overlapping bubbles at all times

aegisMatrix min CD = 100f × 0.35 × 0.5 = 17.5f = 0.292s
aegisMatrix life   = 2.5s
→ 2.5 / 0.292 ≈ 8.6 overlapping matrices at all times
```

Each bubble damages 4 ticks/sec. 3.8 bubbles × 4 ticks/sec = **~15 damage ticks per second** on any enemy in the radius — and the pushback resets their position every frame so they can't escape.

**Balance notes:**
- The pushback radius extends 1.5× past the visual cap. Players see a 320u shield but enemies take damage out to 480u. This makes "stay in the bubble" geometry hard to read.
- aegisMatrix gets a free 5-missile retaliation on every hit player takes — a defensive weapon that ALSO punishes attackers passively. It's strictly better than its base in every way.
- burningBarrier pushback is only 150 — noticeably weaker. It plays like a budget shield.

### D — Pool AoEs (6 weapons)

| Weapon | Base dmg | CD | Life cap | Radius | Notable mechanic |
|---|---|---|---|---|---|
| **napalm** | 5 (×0.5) | 75 | 15s | 40×area (cap 200) | Mastery: blue fire, 50% slow 1.5s |
| **hellfire** | 25 | 80 | 15s | 60×area (cap 240) | EVOLVED napalm (dmg_up). 2.0s slow on enemies |
| **toxicCloud** | 8 (×0.4) | 90 | 15s | 50×area (cap 200) | Mastery: cloud grows from base to 2× over (4+lvl) seconds |
| **flamingLash** | 28 | 35 | (pool 15s) | 120×area slash + 30×area pool | SYNERGY napalm+vineWhip |
| **venomLash** | 25 | 40 | (pool 15s) | 120×area + 30×area pool, applies 2s slow | SYNERGY toxicCloud+vineWhip |
| **vampiricLash** | 45 | 50 | (instant swing) | 180×area | EVOLVED vineWhip (regen_up). Heals 1% dealt, capped 5% maxHp/swing (10% on Outer Galaxy) |

**Balance notes:**
- Pool weapons offer area denial without the pushback exploit — enemies CAN reach the player, they just take damage while doing it. Closer to the intended "shoot and dodge" loop.
- vampiricLash heal cap of 5% per swing was specifically nerfed to prevent immortal builds; without the cap a high-area lash with low CD would heal infinitely.
- toxicCloud mastery growth is the only weapon with a genuine scaling-over-time mechanic.
- napalm + hellfire chain stacking creates persistent ground denial but doesn't lock enemies in place like shield does.

### Orbiting drones — a hybrid sub-category

Mechanically these are like Pool AoEs but they ORBIT the player at radius `60-80 × area`. Most ALSO fire projectiles at nearest enemies.

| Weapon | Base dmg | CD | Drone count cap | Secondary |
|---|---|---|---|---|
| **slothSwarm** | 6 | 90 | 1+lvl/2 | Mastery: orbit 80% faster, fires lasers at 200u |
| **thornySwarm** | 20 | 75 | 7 | SYNERGY vineWhip+slothSwarm. Lash radius 170 + player aura 90 |
| **orbitalLasers** | 25 | 50 | 7 | SYNERGY napBeam+slothSwarm. Beams at 300×area, pierce 3+lvl/2 |
| **orbitalDefense** | 35 | 40 | 7 | EVOLVED slothSwarm (spd_up). Beams at 400×area, pierce 5+lvl/2 |

**Balance notes:**
- Drone caps at 7 are PERF caps (Texxy crash audit), not balance caps. Even at lvl 25, only 7 drones exist.
- Contact damage scales with area (orbit radius grows with area), so high-area builds get drones farther from the player.
- orbitalDefense is currently the strongest drone weapon — uncontested in its evolution path.

### E — Melee swings (1 weapon)

| Weapon | Base dmg | CD | Radius | Notable |
|---|---|---|---|---|
| **vineWhip** | 15 | 40 | 100×area | Mastery: heals 5% damage dealt |

vineWhip is the synergy goblin — feeds **5 different** synergies/evolutions:
- → vampiricLash (regen_up)
- → thornySwarm (+slothSwarm)
- → seismicWhip (+novaPulse)
- → flamingLash (+napalm)
- → venomLash (+toxicCloud)

This is by far the most build-flexible base weapon. It also means **5 out of 14 synergy/evolution slots depend on vineWhip** — if vineWhip is meta-weak, an entire synergy column dies.

---

## Synergy & Evolution Map

```
napBeam ─┬─ +area_up   ──→ supernovaBeam       (Model A, big AoE-on-impact)
         ├─ +novaPulse ──→ laserNova           (Model B+A hybrid)
         └─ +slothSwarm ─→ orbitalLasers       (drone hybrid)

vineWhip ─┬─ +regen_up   ──→ vampiricLash      (Model D, biggest melee)
          ├─ +slothSwarm ──→ thornySwarm       (drone hybrid)
          ├─ +novaPulse  ──→ seismicWhip       (Model E+B)
          ├─ +napalm     ──→ flamingLash       (Model E+D pool)
          └─ +toxicCloud ──→ venomLash         (Model E+D pool, slows)

slothSwarm ─┬─ +spd_up ──→ orbitalDefense      (drone, indestructible)
            ├─ +napBeam ─→ orbitalLasers       (shared with napBeam)
            └─ +vineWhip → thornySwarm         (shared with vineWhip)

napalm ─┬─ +dmg_up ───────→ hellfire           (Model D, persistent burn)
        ├─ +vineWhip ─────→ flamingLash        (shared)
        └─ +shieldBubble ─→ burningBarrier     (Model C, weaker shield)

novaPulse ─┬─ +cd_down ──→ quantumCollapse     (Model B triple-pulse)
           ├─ +napBeam ──→ laserNova           (shared)
           └─ +vineWhip → seismicWhip          (shared)

shieldBubble ─┬─ +hp_up ──→ aegisMatrix        (Model C, the meta)
              └─ +napalm ─→ burningBarrier     (shared)

bouncingBlade ─ +proj_spd → buzzsawSwarm       (Model A, chains x8)

toxicCloud ─ +vineWhip → venomLash             (shared)

neoBlaster ─ no synergy, no evolution          ← starter weapon
```

**Observations:**
1. **neoBlaster has no progression path.** It stays single-target Model A forever.
2. **toxicCloud only has ONE path** (venomLash, shared with vineWhip). Its evolution slot is empty — there's no `toxicCloud + X → evolved toxic`.
3. **Every Model C (pushback) weapon either has a shield component or is a synergy.** Pushback is locked to one base weapon (shieldBubble) and its derivatives.
4. **vineWhip is the universal connector.** 5 of 7 synergies route through it. If you balance vineWhip you accidentally balance half the synergy ecosystem.

---

## Per-weapon level scaling (S6+)

- Damage per level: `+15% additive` per level beyond 1, capped at lvl 24 → **+360% at lvl 25**
- Area per level: `+5% additive` per level (S5 was +8%), capped at lvl 24 → **+120% at lvl 25**
- Cooldown per level: weapons don't have per-level CD scaling; CD comes from upgrades/forge/passives

**Per-weapon hard caps (S6):**
- `wDmgCap = 1.8×` — forge + upgrades capped here
- `wAreaCap = 1.6×` — same
- These are SEPARATE from `playerDmgCap (4.0×)` and `playerAreaCap (3.0×)` — both apply multiplicatively

A maxed weapon at lvl 25 with full forge + full upgrades does:
```
baseDmg × 4.6 (level) × 1.8 (wDmg) × 4.0 (player) = baseDmg × 33.1
```

For shieldBubble that's `15 × 33.1 = ~496 per tick × 4 ticks/sec × ~4 overlapping = ~7,936 DPS` against any non-tank in the radius. Add area scaling and you cover 480u of damage radius. **That's the actual ceiling.** It's not surprising shield outperforms everything.

For supernovaBeam by comparison: `60 × 33.1 = ~1,986 per hit × ~1.3 hits/sec at min CD = ~2,582 DPS` on a single target. Half the shield's DPS, on one enemy instead of every enemy in 480u.

This is the core balance asymmetry — single-target projectile damage doesn't scale to density the way persistent-tick AoE does.

---

## Cross-references

- Character interactions: [`S7_CHARACTER_AUDIT.md`](./S7_CHARACTER_AUDIT.md)
- Stat-stacking layers (forge, mastery, talents): [`S7_LAYER_AUDIT.md`](./S7_LAYER_AUDIT.md)
- System-level recommendations: [`S7_DESIGN_BRAINSTORM.md`](./S7_DESIGN_BRAINSTORM.md)