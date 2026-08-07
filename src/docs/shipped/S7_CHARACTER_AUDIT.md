# S7 Character Audit — Build axes and AFK affinity

Code refs: `game/Constants.js` (`CHARACTERS`, `CHARACTER_TALENTS`, `CHARACTER_MASTERY_SIGNATURE`), `game/CharacterMechanics.js`, `game/GameEngine.js` (character-specific damage hooks), `game/EnemyAI.js` (per-character on-kill / on-hit triggers).

Every character: base stat sheet, signature mechanic, build axis they push toward, recommended weapons, and **AFK affinity** — how much their kit rewards or punishes standing still.

---

## Base stat overview

| Character | HP | Spd | Arm | dmgM | cdM | areaM | mag | projM | gold | xp | luck | Cost |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| NeoByte | 140 | 3.0 | 5 | 1.10 | 0.90 | 1.00 | 72 | 1.00 | 1.0 | 1.0 | 0 | starter |
| Pandypaws | 220 | 2.5 | 10 | 1.00 | 1.15 | 1.25 | 60 | 0.85 | 1.0 | 1.0 | 0 | 1k |
| NovaByte | 95 | 3.0 | 3 | 1.35 | 1.05 | **1.55** | 72 | 1.00 | 1.0 | 1.0 | 0 | 2k |
| Glitch | 75 | **3.6** | 3 | **1.50** | 0.80 | 0.85 | 48 | 1.20 | 1.0 | 1.0 | 2 | 4k |
| HoloDrift | 110 | 2.9 | 4 | 1.00 | 0.95 | 1.05 | **144** | 1.00 | 1.0 | **1.35** | 1 | 6k |
| CodeBreaker | 90 | 3.1 | 4 | 0.70 | **0.60** | 1.00 | 72 | 1.00 | 1.0 | 1.0 | 3 | 8k |
| DataPhantom | 125 | 3.0 | 7 | 1.15 | 0.95 | 1.00 | 72 | **1.60** | 1.0 | 1.0 | 0 | 10k |
| NeonVortex | **50** | 3.2 | 3 | **2.00** | 1.50 | 0.70 | 72 | **2.00** | 1.0 | 1.0 | 0 | 15k |
| SynthBeats | 100 | 3.0 | 4 | 0.90 | 1.00 | 1.00 | 84 | 1.00 | **1.50** | 1.0 | 2 | 20k |
| SkyByte | 90 | 3.5 | 3 | 1.20 | 0.90 | 1.20 | 72 | 1.30 | 1.0 | 1.0 | 0 | 25k |

Bold = top-2 in that column. CodeBreaker and Glitch have the most extreme cooldown stats (and Glitch the highest damage). NeonVortex is a glass-cannon outlier.

---

## Signature mechanic + build axis

### NeoByte — Banner Commander
- **Mechanic** (`CharacterMechanics.js:5`): Banner every 15s, 10s life, 150u radius. While inside: +30% damage AND +30% effective cooldown (`updateWeapons` multiplies dt by 1.3).
- **T7 mastery**: banner +50% stronger (1.45× CD/dmg) AND +33% radius (200u).
- **Build axis:** stand inside the banner → fire 30% faster → re-deploy when it expires.
- **AFK affinity: VERY HIGH.** Banners are stationary. You park on top of one until it expires.
- **Recommended weapons:** anything cooldown-sensitive — shieldBubble (more bubble overlap), drones (drone count scales w/ cooldown ticks), pulse AoEs.

### Pandypaws — Heavy Mechanic
- **Mechanic** (`EnemyAI.js:64`): 5% chance on non-boss kill to drop scrap pickup (+0.1 armor, max 10).
- **T7 mastery**: scrap drop rate doubled (10%).
- **Built-in**: highest HP (220), highest armor (10), lowest projectile speed (0.85). 1.15 cdM penalty.
- **Build axis:** tank-and-spank. AoE area is 1.25× base.
- **AFK affinity: HIGH.** Slow + tanky + area-focused → kill zone playstyle.
- **Recommended weapons:** burningBarrier / aegisMatrix (synergy with high HP). Pool weapons (high area). Avoid projectile builds (projM 0.85 = damage penalty).

### NovaByte — Demolitions
- **Mechanic** (`EnemyAI.js:53`): 10% chance on non-boss kill to trigger chain explosion (100u radius, 20 base damage).
- **T7 mastery**: chain rate doubled (20%).
- **Built-in**: highest area (1.55), lowest HP (95). Glass cannon AoE.
- **Build axis:** maximize area, snowball the chain explosions through density.
- **Augment `nova_nuke`**: boss-spawn nova burst (7% boss maxHp). Anti-boss spike.
- **AFK affinity: HIGH.** Chain explosions cascade from kills you make passively via persistent AoE.
- **Recommended weapons:** novaPulse → quantumCollapse, AoE pools.

### Glitch — Stealth Assassin
- **Mechanic** (`GameEngine.js:596`): 15% chance when hit to phase shift (2s invuln). T7 mastery: 25%.
- **Stats**: 75 HP / 1.5 dmgM / 0.8 cdM / 3.6 spd. Fastest character. Lowest HP tier-2.
- **Build axis:** kite + burst. High speed, low HP, mid area.
- **Augment `glt_phase`**: 10% on-hit phase. Stacks with base. With both → ~24% dodge.
- **Augment `glt_copy`**: spawns decoys (HoloDrift-style).
- **AFK affinity: LOW-MED.** Doesn't reward standing still mechanically, but doesn't punish it either.
- **Recommended weapons:** Single-target high-damage — supernovaBeam, buzzsawSwarm. Glitch builds around damageMult, not density.

### HoloDrift — Engineer
- **Mechanic** (`CharacterMechanics.js:25`): Decoy every 20s (14s at T7), 100hp, 15s life, taunts non-boss enemies in 600u.
- **Stats**: 144 magnet (2× normal), 1.35 xpMult.
- **Build axis:** XP/loot scavenger. Decoy redirects enemies → player free to position.
- **Augment `holo_revive`**: 1× per run revive at 10% HP + 3s i-frames.
- **AFK affinity: HIGH.** Decoy is literally "stand behind it." The kit was designed for positional play but mechanically reads as AFK-friendly.
- **Recommended weapons:** anything (kit doesn't push a weapon class). Synergize with Greedy XP/gold loadouts.

### CodeBreaker — Cyber Hacker
- **Mechanic** (`CharacterMechanics.js:42`): Every 10s (7s at T7), hack up to 3 nearby non-boss enemies in 400u. Hacked enemies attack their allies, slowly bleed out.
- **Stats**: 0.7 dmgM, **0.6 cdM (lowest in game)**, 3 luck.
- **Build axis:** Cooldown-stacked weapon swarm + crowd disruption. Low base damage forced by lowest CD.
- **AFK affinity: VERY HIGH.** Hack creates infighting that thins waves without player input. Lowest CD = densest AoE field.
- **Recommended weapons:** shieldBubble (fastest CD compounds), drones.

### DataPhantom — Strategic Hacker
- **Mechanic** (`EnemyAI.js:399`): Enemies within 150u get "leeched" — speed cut 30%, player gains 2s (3.5s T7) speed boost.
- **Stats**: 7 armor (tied for highest), 1.6 projM, 1.15 dmgM.
- **Build axis:** Projectile speed → damage bonus build (`PROJECTILE_WEAPONS` set in WeaponSystem gives +30% dmg at 1.6 projM).
- **Augment `dat_ghost`**: 5s i-frames at run start.
- **AFK affinity: MED.** Leech requires enemies CLOSE — you naturally let them approach.
- **Recommended weapons:** Single-target projectiles (DataPhantom's projM bonus is direct DPS gain). neoBlaster + supernovaBeam path is strongest.

### NeonVortex — Elite Sniper
- **Mechanic** (`GameEngine.js:1357`): Execute non-boss, non-elite, non-T7+ enemies below 20% HP (30% T7). Spawns 3 railgun shards.
- **Stats**: **50 HP (lowest)**, 2.0 dmgM (highest), 1.5 cdM (highest penalty), 0.7 areaM, 2.0 projM (highest).
- **Build axis:** Glass-cannon single-target. Tier-7+ enemies and bosses ignore execute → late-sector clear depends on raw damage.
- **AFK affinity: LOW-MED.** Fragile, needs to kite. But high projM + execute snowball means once a build comes online it can kill at range.
- **Recommended weapons:** supernovaBeam (proj speed → damage), buzzsawSwarm. Avoid AoE pools (areaM 0.7 penalty).

### SynthBeats — Diplomat
- **Mechanic** (`GameEngine.js:585`): Bribe death — costs `5 + 2×incoming damage` gold per dodge, 3s cooldown. T7: base cost 3g.
- **Stats**: 1.5 goldMult (highest), 2 luck, 84 magnet.
- **Build axis:** gold-funded survivability + luck-driven crit/drops.
- **In endless**: gets 10% gold drop rate from kills (vs 0% for all others) — kit-specific endless economy.
- **AFK affinity: MED.** Bribe pays for AFK survivability if gold is flowing. But cooldown forces SOME mobility.
- **Recommended weapons:** Anything. Luck-driven build → Cosmic Dice relic → more nukes.

### SkyByte — Ace Pilot
- **Mechanic** (`CharacterMechanics.js:65`): Sonic Boom charges while moving (max 100, T7 max 200 "Hypercharge"). Releases on stop/direction-change for AoE damage. Decays 15/sec while still.
- **Stats**: 3.5 spd (2nd fastest), 1.3 projM, 1.2 dmgM, 1.2 areaM. Solid all-rounder.
- **Augment `sky_ace`**: 3s invuln on level-up.
- **Augment `sky_twin`**: every blaster shot fires twin lasers (6 lasers if blaster mastered).
- **AFK affinity: MED-LOW.** Sonic Boom is the ONLY mechanic in the game that explicitly requires movement. The decay penalty for standing still is real. **SkyByte's kit is the closest thing the game has to an anti-AFK design.**
- **Recommended weapons:** anything. neoBlaster gets best leverage from sky_twin.

---

## AFK affinity summary (THIS is the key meta-shaping table)

| Tier | Characters | Why |
|---|---|---|
| **Very High** | NeoByte, CodeBreaker | Banner / hack reward stationary play and feed AoE damage models |
| **High** | Pandypaws, NovaByte, HoloDrift | Tank/area/decoy kits naturally support kill-zone play |
| **Medium** | DataPhantom, SynthBeats, Glitch | Mechanics neutral to position |
| **Medium-Low** | NeonVortex | Glass cannon needs kiting but range covers it |
| **Low** | SkyByte | Sonic Boom REQUIRES movement, charge decays when still |

**Observation: 5 of 10 characters actively reward AFK play. Only 1 (SkyByte) punishes it.**

Anubis's complaint about the meta is structurally rooted in character design — not just shield bubble. Banners, decoys, hacks, scrap drops, chain explosions ALL trigger passively while standing still. The shield is the most visible symptom but the kits were designed around stationary mechanics.

---

## Talent paths — every character has A/B branching

Code ref: `Constants.js` `CHARACTER_TALENTS`.

Each character has 5 talents in 3 tiers: T1 baseline → T2A/T2B (mutually exclusive) → T3A/T3B (exclusive). Total per-character investment: T1 + 1×T2 + 1×T3 = 3 talents per loadout, but you only pick ONE branch.

| Character | Path A theme | Path B theme |
|---|---|---|
| NeoByte | Offence (+15% dmg, -12% CD) | Bulwark (+40 HP, +5 armor) |
| Pandypaws | Crusher (+20% area, +25% dmg) | Wall (+0.6 regen, +60 HP) |
| NovaByte | Nuker (+25% area, +25% dmg) | Sapper (-12% CD, +20% projSpd) |
| Glitch | Crit (+5% crit, +30% dmg) | Evasion (+15% spd, +3 luck) |
| HoloDrift | Greed (+40 magnet, +30% gold) | Warden (+3 armor, +0.5 regen) |
| CodeBreaker | Overclock (-12% CD, +20% projSpd) | Miner (+20% gold, +3 luck) |
| DataPhantom | Marksman (+20% dmg, +25% projSpd) | Wraith (+3 armor, +50 HP) |
| NeonVortex | Executioner (+20% dmg, +30% dmg) | Gravity (+25% area, +60 magnet) |
| SynthBeats | Tycoon (+20% gold, +2 luck) | Maestro (-12% CD, +30% area) |
| SkyByte | Carpet Bomber (+25% area, +25% dmg) | Dogfighter (+15% spd, +3 armor) |

**Stacking rules (`GameEngine.js:81-95`):**
- Permanent talents: 1.0× value
- Weekly talents (same ID): 0.66× (S6+)
- Seasonal talents (same ID): 0.66× (S6+)
- Same talent ID across tiers dedups — only counted once

Max stack on a single talent ID is `1.0 + 0.66 + 0.66 = 2.32×` — well below S5's old 3.0× ceiling. This is why "triple-maxed" whales were nerfed on the S5→S6 transition.

---

## Mastery tiers 1-7 (per character)

Code ref: `Constants.js` `CHARACTER_MASTERY_LEVELS` + `CHARACTER_MASTERY_SIGNATURE`.

Shared tiers 1-5 (apply to every character):
| Tier | Kills | Bonus |
|---|---|---|
| 1 | 0 | — |
| 2 | 2,000 | +5% speed |
| 3 | 5,000 | +10% damage |
| 4 | 10,000 | +15% area |
| 5 | 25,000 | -10% cooldown |
| 6 | **50,000** | per-character (multi-stat) |
| 7 | **100,000** | per-character (ability boost) |

ALL unlocked tiers stack (not just the highest). At T5 you have +5% spd, +10% dmg, +15% area, -10% CD cumulative.

T6 character-specific examples:
- NeoByte: +10% to ALL stats (speedMult, damageMult, areaMult, cooldownMult, magnetRange, xpMult, goldMult)
- Pandypaws: +50 HP, +3 armor
- NovaByte: +15% dmg, +15% area
- NeonVortex: +25% dmg, +25% projSpeed

T7 ability boosts (mechanical, not stat):
- NeoByte: banner +50% stronger, +33% radius
- Pandypaws: scrap drop 5%→10%
- NovaByte: chain explosion 10%→20%
- Glitch: phase shift 15%→25%
- HoloDrift: decoy CD 20→14s
- CodeBreaker: hack CD 10→7s
- DataPhantom: phantom boost 2→3.5s
- NeonVortex: execute threshold 20%→30%
- SynthBeats: bribe base cost 5g→3g
- SkyByte: sonic boom charges 33% faster + unlocks Hypercharge

**These tier 7 boosts are huge mid-late game power spikes.** They're the carrot at 100k kills per character. Anubis-tier players have all of these unlocked.

---

## Cross-references

- Weapon-by-weapon catalog: [`S7_WEAPON_AUDIT.md`](./S7_WEAPON_AUDIT.md)
- Passive / relic / forge stacking: [`S7_LAYER_AUDIT.md`](./S7_LAYER_AUDIT.md)
- System-level recommendations: [`S7_DESIGN_BRAINSTORM.md`](./S7_DESIGN_BRAINSTORM.md)