# Doc 2 — In-Run Upgrades & Growth

Everything the player picks or triggers during a run: level-up choices,
passive stacking, weapon scaling, mastery, evolutions, synergies, in-run
stat caps, difficulty scaling, DD, character talents.

Files: `game/UpgradeSystem.js`, `game/WeaponSystem.js`, `game/Constants.js`,
`game/EnemySpawner.js`, `game/PickupSystem.js`.

## 1. Level-up curve

`levelUp` (`UpgradeSystem.js` line 102-141):
```
xpRequired[n+1] = floor(xpRequired[n] * 1.15 + 25)
```
Per level, engine also bumps:
- `player.maxHp` +1% (capped `2000` on S6, sector-scaled `getS7HpCapForSector` on S7)
- `player.damageMult` +0.01 (capped 5.0)
- `player.armor` +0.1 (capped 30)
- HP refill of 15% max HP

`MAX_WEAPON_LEVEL` = 20 (S5) / **25 (S6+)**, `WEAPON_SLOT_CAP = 6` (S6+).

## 2. Level-up choice pool

Weighted draw from `UPGRADES` (`Constants.js` line 195-216). 3 choices
generated per level-up.

**Rarity table** (`UpgradeSystem.js` line 149-154):

| Rarity | Weight | Passive mult | Weapon +levels |
|---|---|---|---|
| Common | 60 | ×1 | +1 |
| Rare | 25 | ×1.5 | +2 |
| Epic | 10 | ×2 | +3 |
| Legendary | 5 | ×3 | +5 |

- Bias rarity bump: +1% chance per allocated pool-bias point on that target, cap 10%.
- S6+ autobalance: pushes >4 weapons + ≤2 passives toward passives (weapons ×0.6, passives ×1.6);
  pushes ≤2 weapons + ≥3 passives toward weapons (×1.4). Evolutions exempt.
- Weapon-slot cap enforced from S6+: once at 6/6, only level-ups for owned weapons offered.

`MAX_PASSIVE_LEVEL = 5` (line 184). Once every passive is capped + every weapon owned + banished,
the pool falls back to `OVERCHARGE_FILLERS` (S6+ line 16-23) — cheap uncapped stat picks
(`+3% dmg`, `+1 armor`, `+30 HP`, `-2% cd`, `+5% gold`, `+1 luck`).

## 3. Evolutions

`EVOLUTIONS` (`Constants.js` line 185-193). Base weapon + specific passive.
Gated on `EVOLUTION_MIN_BASE_LEVEL = 8` (S6+). S5 has no gate.

| Base | Passive | Evolved |
|---|---|---|
| napBeam | area_up | supernovaBeam |
| vineWhip | regen_up | vampiricLash |
| slothSwarm | spd_up | orbitalDefense |
| napalm | dmg_up | hellfire |
| novaPulse | cd_down | quantumCollapse |
| shieldBubble | hp_up | aegisMatrix |
| bouncingBlade | proj_spd | buzzsawSwarm |

## 4. Synergies

`SYNERGIES` (`Constants.js` line 111-119). Two component weapons fuse:

| A | B | Result |
|---|---|---|
| napalm | shieldBubble | burningBarrier |
| napBeam | novaPulse | laserNova |
| vineWhip | slothSwarm | thornySwarm |
| napBeam | slothSwarm | orbitalLasers |
| vineWhip | novaPulse | seismicWhip |
| napalm | vineWhip | flamingLash |
| toxicCloud | vineWhip | venomLash |

Evolutions check runs BEFORE synergies (line 376) so a base isn't consumed
by a synergy before its evolution has a chance to fire.

## 5. In-run stat caps

Applied when a weapon fires (`WeaponSystem.js` line 91-104):

| Cap | S5 | S6+ |
|---|---|---|
| `player.areaMult` | 4.0 | **3.0** |
| `player.damageMult` | 5.0 | **4.0** |
| Per-weapon `wAreaMult` (from mastery table) | 2.0 | **1.6** |
| Per-weapon `wDmgMult` | 2.0 | **1.8** |
| Per-level area scaling | 0.08/lvl | **0.05/lvl** |

Level scaling: `dmg *= 1 + min(19|24, level-1) * 0.15`.

Projectile-speed→damage bonus (line 115-122): projectile weapons get up to
+50% damage from projSpeedMult, capped so alone it can't double damage.

## 6. Weapon mastery + tier stacking

`getWeaponStatsAndMastery` (`Constants.js` line 596-675). Reads permanent /
weekly / seasonal upgrade rows + forge augments:

```
STACK_FACTOR = 0.5   // S6+ — weekly + seasonal contribute half as much as permanent
dmgLvl  = perm.damage  + (week.damage  + season.damage)  * STACK_FACTOR
areaLvl = perm.area    + (week.area    + season.area)    * STACK_FACTOR
cdLvl   = perm.cooldown+ (week.cooldown+ season.cooldown)* STACK_FACTOR

forgeDmg  = 0.15/0.35/0.60 for damage_1/2/3      (tier3 × 1.5 on Outer Galaxy overforge)
forgeArea = 0.15/0.35/0.60 for area_1/2/3
forgeCd   = 0.10/0.20/0.35 for cd_1/2/3

dmgMult  = 1 + dmgLvl  * 0.1  + forgeDmg
areaMult = 1 + areaLvl * 0.1  + forgeArea
cdMult   = 1 - cdLvl   * 0.05 - forgeCd
```

**"Mastered"** requires PERMANENT 5/5/5 on the base weapon OR all three T3
forge augments. Grants a per-weapon secondary effect (see `WEAPONS[].masteryDesc`).

Evolved/synergy weapons inherit from parent(s) via `EVOLUTION_PARENT` (line 577-594):
- Direct evolutions inherit from 1 parent.
- Synergies inherit from BOTH parents (max of each stat) — investing in either
  source is rewarded but can't double-stack.

## 7. Character talents

`CHARACTER_TALENTS` (`Constants.js` line 342-432). Each character has 5 talents
across 3 tiers: T1 (free) → T2 (choose A or B) → T3 (locked to the chosen path).
Server enforces prereqs per-tree in `spendGold` (`TALENT_PREREQS` line 52-63).

## 8. Character mastery (shared + signature)

`CHARACTER_MASTERY_LEVELS` (line 488-494) — same for every character:

| Lvl | Kills | Title | Bonus |
|---|---|---|---|
| 1 | 0 | Cadet | none |
| 2 | 2,000 | Star Runner | +5% Speed |
| 3 | 5,000 | Void Reaper | +10% Damage |
| 4 | 10,000 | Nebula Warden | +15% Area |
| 5 | 25,000 | Cosmic Overlord | −10% Cooldown |

`CHARACTER_MASTERY_SIGNATURE` (line 501-542) adds per-character T6 (50k kills)
and T7 (100k kills) with a stat and an ability boost.

## 9. Enemy tiers, HP, damage, spawn scaling

`ENEMIES` (`Constants.js` line 239-336). 14 tiers (T1-T14) + 7 bosses:
- **T1** — HP 8-14, dmg 5-8 (starter zones)
- **T10** — HP 420-480, dmg 120-130 (S9-S10)
- **T14** — HP 2400-2800, dmg 310-330 (S16-S20 mythic apex)
- **Bosses** — HP 6000 (Kraken) to 22000 (Pulsar Guardian). XP 700-1700.

**Sector spawn HP/dmg multiplier** (`EnemySpawner.js` line 372-373):
```
progress    = time / arenaDuration
sectorScale = Outer Galaxy: OUTER_GALAXY_HP_MULT[sectorNum]      (see below)
              Inner Galaxy: Math.pow(1.2, arenaIndex)
              Endless:      Math.pow(1.12, arenaIndex)
hpMult   = (1 + 2.1*progress^1.6) * difficulty.enemyHpMult  * sectorScale
dmgMult  = (1 + 1.6*progress^1.4) * difficulty.enemyDmgMult * sectorScale
```

**Outer Galaxy HP multipliers**:

| Sector | S6 (line 23-26) | S7+ (line 27-30) |
|---|---|---|
| S11 | 13.55 | 2 |
| S12 | 21.03 | 3 |
| S13 | 32.51 | 4 |
| S14 | 50.44 | 5 |
| S15 | 78.17 | 6 |
| S16 | 121.13 | 7 |
| S17 | 187.70 | 8 |
| S18 | 290.90 | 9 |
| S19 | 450.85 | 10 |
| S20 | 698.79 | 11 |

**S7 flattened this dramatically** — S20 mob HP went from ~2.5M to ~11× base
(so a T14 with 2800 base × 3.1 (progress) × 1.5 (cosmic clamp) × 11 = ~143k
HP endgame mob). This is why the score `bonusMult` was also halved (S20 3.5 → 2).

**Bosses on S11+** use `OUTER_GALAXY_HP_MULT * 0.3` (line 197-205) so a S20
boss lands around ~5min kill time on median DPS.

## 10. Elite spawns

`EnemySpawner.js` line 382-416. Base 1% chance rising with progress to ~5%
after 60s. Elite = higher-tier mob with:
- HP × 2.5 base × hpMult
- dmg × 1.5 base × dmgMult
- radius × 1.15 (down from 1.4× since S7 Outer Galaxy)
- XP × 4
- Gold bonus `+2` on kill

**S6+ elite DD boost**: when DD spawn mult > 1, elite chance scales with it
(capped at DD's own 2.0× ceiling on dominant runs).

## 11. Difficulties

`DIFFICULTIES` (`Constants.js` line 14-19):

| Difficulty | xpMult | goldMult | enemyHpMult | enemyDmgMult | hazardChance | speedMult |
|---|---|---|---|---|---|---|
| easy | 0.5 | 0.5 | 0.7 | 0.6 | 0 | 0.85 |
| normal | 1.0 | 1.0 | 1.0 | 1.0 | 0 | 1.0 |
| hard | 2.0 | 2.0 | 1.5 | 1.5 | 0.05 | 1.1 |
| cosmic | 3.0 | 3.0 | 2.5 | 2.5 | 0.15 | 1.25 |

Outer Galaxy Cosmic uses a tightened spread of **1.5×** (both HP and dmg,
`EnemySpawner.js` line 209-211, 368-370) — the no-overlap rule needs it
compressed so every sector's Normal beats previous sector's Cosmic.

## 12. Relics (in-run stat boosters from fragments)

`RELICS` (`Constants.js` line 434-440), `RELIC_RARITIES` (line 442-448):

| Relic | Stat | Values L1-L5 | Frag cost / lvl |
|---|---|---|---|
| Cosmic Dice | luck | +1/2/3/4/5 | 2 |
| Midas Core | goldMult | +10/20/30/40/50% | 3 |
| Knowledge Drive | xpMult | +10/20/30/40/50% | 3 |
| Blood Chalice | regen | +0.2/0.4/0.6/0.8/1.0 | 4 |
| Annihilation Core | damageMult | +5/10/15/20/25% | 5 |

L1→L5 total = 2+3+3+4+5 = 17 fragments × sum(1..5) = 15 × cost. Actually cost per level
is FLAT (`fragmentCost`), so L1→L5 = 5 × fragmentCost. Damage core = 25 frags to max.

## 13. Prestige (post-max L5 relic scaling)

`prestigeRelic/entry.ts`. PL0→PL5 per relic, +5% to the stat value at each PL.

Cost per PL (line 42): `[500K, 1M, 1.5M, 2M, 2.5M]` gold + **100 frags flat per PL**.
Total per relic to fully prestige: 7.5M gold + 500 frags.

## 14. Observations

1. **S7 Outer Galaxy HP curve is very flat.** Going from 13.55→2 at S11 and
   698→11 at S20 is a ~64× reduction on the top end. Combined with the halved
   score `bonusMult`, S20 clears should be much more achievable now — probably
   the intended direction, but worth measuring how many players actually reach
   S20 vs S6. If Cosmic S20 is now too easy, the lever is in `OUTER_GALAXY_HP_MULT_S7`.

2. **`STACK_FACTOR = 0.5` is doing heavy lifting.** Triple-maxed
   (perm+weekly+seasonal 5/5/5) weapon damage = `1 + (5 + (5+5)*0.5) * 0.1 =
   2×` before forge, capped at 1.8× on S6+. Old 0.66 stack factor produced
   ~4.7× DPS on Tijckers' run. Current 0.5 caps it around 3.5× — much closer
   to permanent-only (2.5×). Feels right, keep as-is unless we see whales
   dominating again.

3. **Elite XP = ×4 is a huge exponent driver.** Every elite gives 4× the XP
   of a normal same-tier mob. On DD-heavy runs (S6+ elite boost) this scales
   even further. This is the primary "in the zone" reward — good design.

4. **Passive cap = 5 per id.** With 11 passive `UPGRADES`, absolute max is 55
   passive picks per run before OVERCHARGE_FILLERS kick in. In practice players
   see ~30-40 level-ups per long run, so the cap rarely binds outside endless.

5. **Level-up XP curve `xpRequired * 1.15 + 25`** is quite gentle. At L30 that's
   `25 * 1.15^29 ≈ 1400` XP to level. A T1 mob is 1 XP, elite T1 is 4 XP, so
   ~350 mobs per level at that stage. In practice players are on higher tiers
   by then. Fine.

6. **`MAX_WEAPON_LEVEL 25` + 7 weapon slots.** A "master everything" S6+ endless
   player can theoretically hold 6 weapons all at lvl 25 with perm 5/5/5. That's
   the intended endgame — no lever needed unless we want to reduce the ceiling.

7. **Character mastery T7 signature abilities feel valuable.** Bribe cost
   `5g→3g` (Synthbeats), decoy CD `20s→14s` (HoloDrift), phase-shift chance
   `15%→25%` (Glitch), execute threshold `20%→30% HP` (NeonVortex) — all
   noticeable. Good design; no changes needed.

8. **Character talent T3 "path B" bonuses are stat-heavy and lack ability
   modifiers.** E.g. `pan_3b` = "+60 Max HP" (Pandy Path B). Compare to
   `pan_3a` = "+25% Damage" — the offence path scales its damage output while
   the defence path just piles on HP. Path B feels less exciting past midgame.
   Consider replacing some Path B T3s with defensive **triggers** ("+5s
   invulnerability on <20% HP, 60s CD") — not urgent but a polish target.

9. **Boss HP scaling on Outer Galaxy = mob multiplier × 0.3** was tuned when
   mob mult was S6 numbers (S20 = 698 × 0.3 = 209.4× boss HP). Now on S7 it's
   11 × 0.3 = 3.3× base HP → S20 Pulsar Guardian = 22k × 3.3 ≈ 73k HP. That's
   very kill-able (60s median DPS ~10k = ~7s TTK). Worth double-checking
   S20 boss actually feels like a finale on S7 — the 0.3 factor might now
   want to be 0.5 or 0.6 to keep it climactic.

10. **`WEAPON_SLOT_CAP = 6` is genre standard, working well.** Synergies (2→1)
    give the "consolidate to unlock evolution slots" push — good design tension.