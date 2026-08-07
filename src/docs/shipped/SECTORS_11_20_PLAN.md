# Sectors 11–20 — Design Draft

## Current state (sectors 1–10)

| # | Arena id      | Name             | Duration | Effect       |
|---|---------------|------------------|----------|--------------|
| 1 | station       | Azure Expanse    | 3:00     | neon_rain    |
| 2 | asteroid      | Mystic Cosmos    | 3:30     | fog          |
| 3 | nebula        | Ethereal Nebula  | 4:00     | fog          |
| 4 | void          | Crimson Void     | 4:30     | none         |
| 5 | plasma        | Solar Storm      | 5:00     | solar_flare  |
| 6 | crystal       | Emerald Galaxy   | 5:30     | neon_rain    |
| 7 | moon          | Shattered Core   | 6:00     | fog          |
| 8 | blackhole     | Abyssal Vortex   | 6:30     | solar_flare  |
| 9 | mothership    | Turquoise Drift  | 7:00     | neon_rain    |
| 10| dimension     | Rainbow Rift     | 7:30     | solar_flare  |

Each playable on Easy / Normal / Hard / Cosmic (defined in `DIFFICULTIES`). Tier 10 enemies + bosses spawn at the high end. Duration grows +30s per sector.

---

## Sectors 11–20 — concept table

Continuing **+30s per sector** (8:00 → 12:30). Endgame tier — sectors 11-15 = post-game, 16-20 = mythic/prestige tier. Effects rotate the existing 4 (`neon_rain` / `fog` / `solar_flare` / `none`) so we don't need new engine code on day one.

Background art is **uploaded and ready** (URLs below). Enemy sprites + boss sprite pending.

| #  | Arena id        | Name                  | Duration | Effect       | Theme / hook | Background |
|----|-----------------|-----------------------|----------|--------------|--------------|------------|
| 11 | galactic_core   | The Galactic Core     | 8:00     | fog          | Dust-choked Milky Way heart — the gate to the post-game tier. Slower spawns, larger tank mobs (Frost Wyrm / Lava Blob mix). | [MilkyWay_Starfield](https://media.base44.com/images/public/69de258a7e072380b89d66e3/069d2b286_MilkyWay_Starfield.png) |
| 12 | pillars         | Pillars of Creation   | 8:30     | neon_rain    | Hubble-style nebula pillars. Heavy ranged mix (Chain Eye / Crystal Vortex) — punishes glass cannons. | [Nubula_Pillars](https://media.base44.com/images/public/69de258a7e072380b89d66e3/5e69ed395_Nubula_Pillars.png) |
| 13 | saturnian       | Saturnian Reach       | 9:00     | none         | Field of ringed worlds + drifting asteroids. Rock Fragment / Stellar Starfish density spike. Clean visual — no effect — to read the chaos. | [Ringed_planets](https://media.base44.com/images/public/69de258a7e072380b89d66e3/28e6f3f01_Ringed_planets.png) |
| 14 | andromeda       | Andromeda's Edge      | 9:30     | fog          | Pristine spiral arms. Spawn density +10%, smaller swarm mobs only — pure DPS check. | [Spiral_Galaxy](https://media.base44.com/images/public/69de258a7e072380b89d66e3/4300cbae0_Spiral_Galaxy.png) |
| 15 | painters_spiral | The Painter's Spiral  | 10:00    | solar_flare  | Marbled blue-gold cosmic painting. Whispering Void / Ribbon Phantom heavy — ethereal, surreal tier. | [Majestic_spiral](https://media.base44.com/images/public/69de258a7e072380b89d66e3/b2890294e_Majestic_spiral.png) |
| 16 | harmony         | Harmony Drift         | 10:30    | neon_rain    | Cyan-pink aurora streaks. First mythic-tier arena. Mixed-tier spawns (random t7–t10). | [Harmony](https://media.base44.com/images/public/69de258a7e072380b89d66e3/04713b746_Harmony.png) |
| 17 | chromatic       | Chromatic Tides       | 11:00    | fog          | Pink/teal/orange swirling clouds. Cosmic Ray Fish / Plasma Jelly Swarm — fast and chaotic. | [Swirling_nebulae](https://media.base44.com/images/public/69de258a7e072380b89d66e3/8717e0950_Swirling_nebulae.png) |
| 18 | stormfront      | Stormfront Nebula     | 11:30    | solar_flare  | Cyan lightning-burst nebula. Thunder Sphere / Frost Specter heavy. Electric chaos. | [Cosmic_Storm](https://media.base44.com/images/public/69de258a7e072380b89d66e3/c0893d46c_Cosmic_Storm.png) |
| 19 | supernova       | Supernova Heart       | 12:00    | solar_flare  | Pink-cyan supernova rays. Only tier 8-10 mobs spawn — no trash. Best XP/gold rate in the game. | [SuperNova_Burst](https://media.base44.com/images/public/69de258a7e072380b89d66e3/c6b90fc36_SuperNova_Burst.png) |
| 20 | devourer        | The Devourer          | 12:30    | none         | Black hole consuming a planet. Mythic finale. Anchors the **NEW BOSS** (sprite pending). Optional: spawn 1 existing boss alongside the new one for true endgame flex. | [Cosmic_BlackHole](https://media.base44.com/images/public/69de258a7e072380b89d66e3/9161fafb4_Cosmic_BlackHole.png) |

---

## Implementation notes (when ready to build)

1. **Drop into `ARENAS` in `game/Constants.js`** — same shape as existing entries. Need 10 new background images uploaded to base44 storage.
2. **Spawn tables** — `EnemySpawner.js` already weights spawns by sector index. ✅ **Tier cap raised** — the 20 new mob sprites add fresh tiers above 10. Suggested:
   - **Tier 11** — Asteroid Crab, Cosmic Jellyfish, Galaxy Mantis, Spectral Mothlet, Star Scarab Beetle, Void Bat, Void Eel, Shadow Mantling (the new T6-T8 entries get bumped up)
   - **Tier 12** — Nebula Octopus, Nebula Scorpion, Aurora Moth, Galaxy Wasp (former T6-T8 elites)
   - **Tier 13** — Aurora Serpent, Comet Ray, Nebula Serpent, Plasma Raptor, Void Shark (former T9s)
   - **Tier 14** — Cosmic Manta Ray, Nebula Panther, Plasma Wyrm (former T10 elites — true endgame mythics)
   - Sectors 11-15 = mix of T8-T12, sectors 16-20 = T11-T14 only (no more trash mobs in the mythic tier). Rebalance the tier-mapping table further down once we wire this up.
3. **Hub UI (`pages/Hub`)** — split into two tabs:
   - **Inner Galaxy** — sectors 1-10 (existing post-game tier)
   - **Outer Galaxy** — sectors 11-20 (new endgame + mythic tier)
   - Tab control sits above the sector grid. Default tab = Inner Galaxy on first visit; remember last-selected tab in localStorage so endgame players land back on Outer Galaxy.
   - Outer Galaxy tab should have a subtle distinct visual treatment (e.g. cosmic glow on the tab itself, or a "★ NEW" badge if the player hasn't unlocked anything in it yet) so the new content is discoverable.
4. **Bestiary / Lore** — ✅ **Locked: ship all 20 new mob entries on day one** with new ids (e.g. `t11_asteroid_crab`, `t14_plasma_wyrm`). New tier 11-14 entries in `Constants.js` + matching lore lines in `Lore.js` + Bestiary card rendering. Existing 30-mob roster stays untouched (still spawns in S1-S10). Boss pool: ✅ **random rotation across all 7 bosses** in S11-S19 (existing 6 + Pulsar Guardian eligible everywhere), Pulsar Guardian **guaranteed spawn on S20** as the mythic finale anchor.
5. **Effects** — ✅ **New effects requested** (Outer Galaxy deserves to *feel* different from Inner Galaxy). First pass spec — separate engine ticket but blocking for full mythic feel:
   - `ion_storm` — periodic horizontal lightning sweeps that briefly slow the player and reveal a screen-edge crackle (suggested for S18 Stormfront Nebula)
   - `void_pulse` — rhythmic dark-energy contractions from screen center, drag the camera inward visually, increase enemy speed during pulse (suggested for S20 The Devourer)
   - `eclipse_dim` — periodic light/dark cycle where visibility drops to ~30% for 4s every 20s (suggested for S15 Painter's Spiral or S17 Chromatic Tides)
   - `gravity_well` — subtle pull toward random screen point that drifts every 8s, affects player + projectiles + pickups (suggested for S11 Galactic Core or S13 Saturnian Reach)
   - `aurora_drift` — soft directional wind pushing all entities slowly (suggested for S16 Harmony Drift)
   - Reuse existing 4 for the remaining sectors so we don't need 10 new effects on day one. Pick which 4-5 ship at launch when we build.
6. **Difficulty curve** — ✅ **Locked: Strict no-overlap. Stock difficulty tier multipliers. Insane endpoint is intentional.**

   Players faceroll S1-S10 today — that baseline is irrelevant for tuning Outer Galaxy. The meaningful comparison is **S10 Cosmic** (the current top tier players have mastered) — Outer Galaxy is built to dwarf it.

   **The rule (every sector):** Sector N Normal HP/dmg > Sector (N-1) Cosmic HP/dmg.

   - **Outer Galaxy tier spread tightened**: Cosmic = **1.5× Normal** inside Outer Galaxy (vs stock 2.5× in Inner Galaxy). Tighter spread is what mathematically allows every sector's Normal to top the previous sector's Cosmic without exponential explosion. Inner Galaxy (S1-S10) tier spread untouched.
   - **Per-sector base growth**: **1.55×** (just above Cosmic mult so the no-overlap rule holds). Each sector's Normal sits a hair above the previous sector's Cosmic.
   - **S11 Normal kicks off just above S10 Cosmic** (1.05× vs 1.00×) — the dramatic jump is at the Inner→Outer wall AND every step inside Outer Galaxy.
   - **Implementation**: in `EnemySpawner.js`, override the existing `Math.pow(1.2, arenaIndex)` with the lookup table below for S11+. S1-S10 untouched.

   Difficulty multiplier per sector — anchored to S10 Cosmic = 1.0× (the meaningful baseline, since S1 Normal is a walk in the park):

   | Sector | Normal (vs S10 Cosmic) | Hard | Cosmic | Note |
   |--------|------------------------|------|--------|------|
   | 10 | 0.40× (= S10 Normal) | 0.60× | **1.00× (S10 Cosmic)** | stock anchor |
   | 11 | 1.05× | 1.31× | 1.58× | first Outer wall |
   | 12 | 1.63× | 2.03× | 2.44× | |
   | 13 | 2.52× | 3.15× | 3.78× | |
   | 14 | 3.91× | 4.89× | 5.87× | |
   | 15 | 6.06× | 7.57× | 9.09× | mid-Outer wall |
   | 16 | 9.39× | 11.74× | 14.09× | |
   | 17 | 14.55× | 18.19× | 21.83× | |
   | 18 | 22.55× | 28.18× | 33.83× | |
   | 19 | 34.95× | 43.69× | 52.42× | |
   | 20 | 54.17× | 67.71× | **81.25×** | mythic finale |

   **Sanity check on the rule:** S11N (1.05) > S10C (1.00) ✓ — S12N (1.63) > S11C (1.58) ✓ — S15N (6.06) > S14C (5.87) ✓ — S20N (54.17) > S19C (52.42) ✓. Holds every step by construction.

   **Reality check — near-impossible at S20 by design:**
   - S11 Cosmic = 1.58× S10 Cosmic. The first wall — top players can clear with current builds.
   - S15 Cosmic = ~9× S10 Cosmic. Mid-Outer wall, demands maxed talents + relics + augments.
   - S20 Cosmic = **81× S10 Cosmic**. Near-impossible struggle. Cap lifts (next section) make it theoretically clearable for the absolute peak players, but most attempts die before the boss.

   The tighter Cosmic-vs-Normal spread inside Outer Galaxy (1.5× instead of 2.5×) means picking Cosmic over Normal is a meaningful but not dramatic step. The real progression is **across sectors**, not within them — exactly as you wanted.

   ✅ **Score formula contribution — escalating bonus multiplier on S15+** so the climb pays off even when kill rate drops at high sectors. Existing S6 formula (`sectorIdx × 8,000` + victory `sectorIdx × 15,000`) still applies; on top, the `sectorScore + victoryBonus` total gets multiplied by:

   | Sector | Bonus multiplier |
   |--------|------------------|
   | S1-S10 | 1× (stock — no change) |
   | S11-S14 | **1.5×** *(bumped 2026-06-04 — was 1×, players struggling to beat S10 highs on early Outer Galaxy)* |
   | S15-S17 | 2× |
   | S18-S19 | 2.5× |
   | S20 | **3.5×** |

   This compensates for the fact that DPS ratio drops at S15+ (kill rate falls, so kill-count score falls). Without it, S20 Cosmic would score LOWER than S10 Cosmic — which would defeat the whole climb. The escalating bonus turns reaching the wall into the reward. S11-S14 also gets a smaller 1.5× boost because kill rates drop the moment you cross the Inner→Outer wall (tighter Cosmic spread + harder enemies), and without it players were finishing S11-S14 runs with lower scores than their S10 Cosmic PB.

   **Implementation**: one added line in `functions/saveScore.js` after `victoryBonus` is computed:
   ```js
   const bonusMult = sectorIdxForBonus >= 19 ? 3.5
                   : sectorIdxForBonus >= 17 ? 2.5
                   : sectorIdxForBonus >= 14 ? 2
                   : sectorIdxForBonus >= 10 ? 1.5
                   : 1;
   const scaledBonus = (sectorScore + victoryBonus) * bonusMult;
   ```
   Easy/Normal/Hard/Cosmic still pays more *naturally* via more kills + higher level reached + longer survival time — same as Inner Galaxy.

   **Anchor: ACTUAL RunScore data (queried 2026-06-03)**

   Top 11 S10 Cosmic (arena_id `dimension`) runs all in the **1.50M-1.58M** band. The peak:
   - **Waeoo** — 1,578,100 score, **9,585 kills, level 47**, 7:09 survival, SynthBeats
   - **Texxy** — 1,574,200 score, 9,310 kills, level 50, 7:07 survival, NovaByte

   Formula verification: `9585 × 120 = 1,150,200 + 47² × 100 = 220,900 + 9 × 8000 = 72,000 + 9 × 15000 = 135,000 = 1,578,100` ✓ exact match.

   **Score composition at the peak**:
   - Kills: 1.15M (**73%**)
   - Level²: 221k (**14%**)
   - Sector + victory bonus: 207k (**13%**)

   **Critical insight: players aren't past level 50.** Sector runs are 7:30 max and the XP curve outpaces what mobs can pay back in that window — level plateaus at 45-50 even on optimised builds. So in projections, **level barely moves between S10 and S20**; the longer durations buy more kills, not more level.

   - Endless top runs already at 10M (Battle Toad, 73-min run) — endless is sandbox, NOT recalibrated here per Texxy's call

   **🔒 Kill → score is sacred.** Score formula stays `kills × 120` flat — no caps, no diminishing returns, no per-sector kill nerfs, no kill-rate penalty in Outer Galaxy. Every kill is worth the same 120 points whether it's a tier-1 swarm mob in S1 or a tier-14 elite in S20. More kills = more score, full stop. The cap lifts + longer durations + +10% spawn density on S15-S20 are specifically designed to let strong players rack up MORE kills per run, not fewer.

   **saveScore.js changes required**: extend `ARENA_ORDER` (10→20) + `ARENA_DURATIONS` map + add the 4-line `bonusMult` block above + bump `SCORE_HARD_CEILING` 10M→25M. That's it.

   **Honest score projections — math-checked against real S10 Cosmic baseline (Waeoo: 9,585 kills, level 47, 1.58M)**:

   DPS ratio = damageMult cap / enemy HP multiplier. S10 Cosmic baseline = 6.0 (cap 6 / HP 1.0). Kill rate scales linearly with DPS ratio.

   | Run | DPS ratio | Kill rate | Kills (duration) | Level | Bonus (mult) | **Total** |
   |-----|-----------|-----------|------------------|-------|--------------|-----------|
   | S10 Cosmic (Waeoo, real) | 6.0 | 22/sec | 9,585 (7:09) | 47 | 207k (1×) | **1.58M** ✓ |
   | S11 Cosmic projected | 6.3 | 23/sec | ~13k (8:00) | ~50 | 215k (1×) | ~2.0M |
   | S15 Cosmic projected | 3.3 | 12/sec | ~7k (10:00) | ~50 | 644k (2×) | ~2.0M |
   | S20 Cosmic projected | 0.99 | 3.6/sec | ~2.7k (12:30) | ~55 | 1,530k (3.5×) | **~2.2M** |

   **Clear climb**: every Outer Galaxy sector beats S10 (1.58M). S20 is the peak (~2.2M) — top whales can pick their path (farm S11-S12 fast for ~2M, or grind S20 for the badge + ~2.2M flex). Kill-rate drop at S15+ is real but the escalating bonus compensates.

   🔒 **Kill → score is sacred.** Score formula stays `kills × 120` flat — no caps, no diminishing returns, no per-sector kill nerfs. Every kill is worth 120 whether it's a tier-1 swarm mob in S1 or a tier-14 elite in S20. The bonus multiplier is on the sector+victory portion only, NOT on kill score.

   **`SCORE_HARD_CEILING` bump: 10M → 25M.** Endless is *already* clipping the 10M ceiling on legit long sessions. Outer Galaxy realistic peak is ~2.2M (S20 Cosmic), but a god-tier endless tail could push 7-10M. 25M gives comfortable headroom + future-proofs against the bonus mult inflating S20 scores higher than projected.
7. **Rewards** —
   - **Gold drops: FLAT at sector 10 values** for all of sectors 11-20. Player economy already has a surplus; we do NOT want to inflate gold further with the new content. Implementation: clamp `goldDropMult` at sector index 10's value when computing drops for sectors 11+.
   - **XP scaling**: keep XP drops scaling with the new exponential difficulty curve — players need the XP to level mid-run to survive the HP walls, and XP doesn't feed the persistent economy.
   - **No bonus reward multipliers** for the new tier — the prestige comes from the challenge + cosmetic/title rewards (TBD), not gold/XP inflation.
8. **Unlocks** — ✅ **Locked: per-character chain, any-difficulty clear unlocks next sector** (matches existing S1-S10 behavior exactly). Sector 11 unlocks for a character once they've cleared Sector 10 on *any* difficulty. Each character grinds their own ladder through the Outer Galaxy — 10 chars × 10 sectors = a long-term roster goal. No bulk unlock, no shortcut, no Normal-only gate (consistency with S1-S10 wins over restrictiveness).

9. **Character roster access (NFT + non-NFT)** — ✅ **No new unlock gates needed**:
   - **NFT holders**: already get instant access to every character via `NFTPerks.js` + `_am` suffix normalization in `nftNameNormalize.js`. Outer Galaxy adds nothing here.
   - **Non-NFT via kill milestones**: top milestone is 160k total kills = full 10-char roster. Outer Galaxy *accelerates* kill counts (a S20 Cosmic run can do 8-10k kills), so anyone reaching S11+ will have long since unlocked everything. ✅ Already handled.
   - **Outer Galaxy chase reward**: ✅ **Locked option (a) — nothing extra**. Outer Galaxy is *purely about score and bragging rights*, not a new currency/unlock track. Keeps the design honest: harder content = bigger leaderboard number, period. Cosmetic rewards can be a later patch ticket if Texxy wants them, but they're not blocking launch.

---

## Asset status

- ✅ **Backgrounds** — all 10 uploaded (URLs in table above)
- ✅ **Enemy sprites** — all 20 uploaded (roster below)
- ✅ **New boss sprite** — Pulsar Guardian uploaded ([sheet](https://media.base44.com/images/public/69de258a7e072380b89d66e3/83baa9440_Pulsar_Guardian_Sheet.png)) — 5×5 / 25-frame format matches existing bosses

### Boss: Pulsar Guardian

- **Visual**: Armored juggernaut, black plating with molten orange-gold cracks, glowing yellow pulsar core in its chest, flame-spike crown.
- **Sprite format**: 5 rows × 5 cols = 25 frames (same as existing bosses → `frameCount: 25, animationSpeed: 0.12`).
- **Suggested id**: `boss_pulsar_guardian`
- **Suggested stats** (slot above Nexus Annihilator as the new endgame king):
  - hp ~22000, speed 0.7, damage 110, radius ~150, xp 1700
  - weakSide: `back` — "Attack from behind" (pulsar core is shielded from the front)
- **Lore hook** (Bestiary): *"The last sentinel of a collapsed star. Its core still pulses with the rhythm of a sun long dead, and its rage radiates outward in waves of pure stellar fury."*
- **Sector role**: ✅ **Locked** — Pulsar Guardian joins the **shared boss pool** alongside the existing 6. It anchors S20 (its pulsar core being consumed by the black hole = lore tie) but is also eligible to spawn in sectors 11-19 via the existing boss rotation. Gives the new art maximum visibility instead of locking it to a single sector.

### Enemy roster — 20 new sprites

All sheets follow the existing 4×4 / 16-frame format. Suggested tier assignments below assume **Option C themed-per-sector** distribution (recommended). Final tier + stats need balance tuning when we implement.

| # | Name | Visual | Suggested tier | Sheet URL |
|---|------|--------|----------------|-----------|
| 1 | Asteroid Crab | Blue armored crab, glowing eyes | T8 tank | [Asteroid_Crab](https://media.base44.com/images/public/69de258a7e072380b89d66e3/d058a4791_Asteroid_Crab_Sheet.png) |
| 2 | Aurora Moth | Green-purple iridescent moth | T6 swarm | [Aurora_Moth](https://media.base44.com/images/public/69de258a7e072380b89d66e3/f3a323dae_Aurora_Moth_Sheet.png) |
| 3 | Aurora Serpent | Cyan-purple celestial dragon | T9 elite | [Aurora_Serpent](https://media.base44.com/images/public/69de258a7e072380b89d66e3/a982ba85c_Aurora_Serpent_Sheet.png) |
| 4 | Comet Ray (phoenix form) | Fiery orange/cyan-winged spirit | T9 ranged | [Comit_Ray](https://media.base44.com/images/public/69de258a7e072380b89d66e3/c9ca34e78_Comit_Ray_Sheet.png) |
| 5 | Cosmic Jellyfish | Blue-pink starry jellyfish | T7 floater | [Cosmic_Jellyfish](https://media.base44.com/images/public/69de258a7e072380b89d66e3/93adad41e_Cosmic_Jellyfish_Sheet.png) |
| 6 | Cosmic Manta Ray | Galaxy-skinned manta, large | T10 elite | [Cosmic_Manta_Ray](https://media.base44.com/images/public/69de258a7e072380b89d66e3/aa4cd6eb7_Cosmic_Manta_Ray_Sheet.png) |
| 7 | Galaxy Mantis | Blue-teal mantis insect | T7 ranged | [Galaxy_Mantis](https://media.base44.com/images/public/69de258a7e072380b89d66e3/a0c3ffe18_Galaxy_Mantis_Sheet.png) |
| 8 | Galaxy Wasp | Purple cosmic wasp w/ stinger | T6 ranged | [Galaxy_Wasp](https://media.base44.com/images/public/69de258a7e072380b89d66e3/1779a4a15_Galaxy_Wasp_Sheet.png) |
| 9 | Nebula Octopus | Purple-cyan starry octopus | T8 elite | [Nebula_Octopus](https://media.base44.com/images/public/69de258a7e072380b89d66e3/78215c244_Nebula_Octopus_Sheet.png) |
| 10 | Nebula Panther | Purple flaming feline stalker | T10 elite | [Nebula_Panther](https://media.base44.com/images/public/69de258a7e072380b89d66e3/37f8125b9_Nebula_Panther_Sheet.png) |
| 11 | Nebula Scorpion | Purple-pink scorpion | T8 ranged | [Nebula_Scorpion](https://media.base44.com/images/public/69de258a7e072380b89d66e3/9a42c9c27_Nebula_Scorpion_Sheet.png) |
| 12 | Nebula Serpent | Purple-cyan flame dragon | T9 elite | [Nebula_Serpent](https://media.base44.com/images/public/69de258a7e072380b89d66e3/2f0782efb_Nebula_Serpent_Sheet.png) |
| 13 | Spectral Mothlet (variant of Neon Mothra) | Small pink/teal butterfly | T6 swarm | [neon_mothra v2](https://media.base44.com/images/public/69de258a7e072380b89d66e3/da4b6bf5a_neon_mothra_sheet.png) |
| 14 | Plasma Raptor | Fiery orange/cyan raptor | T9 fast | [Plasma_Raptor](https://media.base44.com/images/public/69de258a7e072380b89d66e3/7a54d1f3f_Plasma_Raptor_Sheet.png) |
| 15 | Plasma Wyrm | Orange-blue fiery wyrm | T10 elite | [Plasma_Wyrm](https://media.base44.com/images/public/69de258a7e072380b89d66e3/68e0a16db_Plasma_Wyrm_Sheet.png) |
| 16 | Star Scarab Beetle | Blue armored beetle | T7 swarm | [Star_Scarab_Beetle](https://media.base44.com/images/public/69de258a7e072380b89d66e3/150bb4721_Star_Scarab_Beetle_Sheet.png) |
| 17 | Void Bat | Purple cosmic bat | T6 swarm | [Void_Bat](https://media.base44.com/images/public/69de258a7e072380b89d66e3/d6da65840_Void_Bat_Sheet.png) |
| 18 | Void Eel | Dark teal/purple eel | T7 fast | [Void_Eel](https://media.base44.com/images/public/69de258a7e072380b89d66e3/b9f304545_Void_Eel_Sheet.png) |
| 19 | Shadow Mantling (variant of Void Manta) | Small dark manta | T7 fast | [void_mantra v2](https://media.base44.com/images/public/69de258a7e072380b89d66e3/ec5f8466f_void_mantra_sheet.png) |
| 20 | Void Shark | Purple cosmic shark | T9 fast | [Void_Shark](https://media.base44.com/images/public/69de258a7e072380b89d66e3/33a8cf065_Void_Shark_Sheet.png) |

### Filename collisions — resolved as NEW VARIANTS

Two uploads share filenames with existing T3/T4 sprites (different URL hashes, so they're independent files). Confirmed as **new high-tier variants** (not art refreshes):
- `Spectral Mothlet` (new T6) — uses hash `da4b6bf5a_neon_mothra_sheet.png`. Existing T4 `t4_mothra` (hash `23d933892`) remains untouched.
- `Shadow Mantling` (new T7) — uses hash `ec5f8466f_void_mantra_sheet.png`. Existing T3 `t3_manta` (hash `9842135cf`) remains untouched.

When we implement, we'll give these new enemies distinct ids (e.g. `t6_spectral_mothlet`, `t7_shadow_mantling`) so they don't collide with the existing entries.

### Sector → enemy mapping (draft — themed Option C)

Pairing each new arena with 2 signature mobs from the roster above. Existing tier-appropriate mobs still spawn alongside for variety.

| Sector | Signature mobs |
|--------|----------------|
| 11 — The Galactic Core       | Asteroid Crab, Star Scarab Beetle |
| 12 — Pillars of Creation     | Aurora Moth, Galaxy Wasp |
| 13 — Saturnian Reach         | Cosmic Jellyfish, Nebula Octopus |
| 14 — Andromeda's Edge        | Galaxy Mantis, Spectral Mothlet |
| 15 — The Painter's Spiral    | Aurora Serpent, Cosmic Manta Ray |
| 16 — Harmony Drift           | Nebula Scorpion, Shadow Mantling |
| 17 — Chromatic Tides         | Nebula Serpent, Comet Ray |
| 18 — Stormfront Nebula       | Plasma Raptor, Plasma Wyrm |
| 19 — Supernova Heart         | Nebula Panther, Void Shark |
| 20 — The Devourer            | **Pulsar Guardian** (boss) + Cosmic Manta Ray + Plasma Wyrm rotation |

## Player power cap lifts (locked)

To match the Outer Galaxy ramp (S20 Cosmic = ~14,125× S10 Cosmic), the existing S6 player-stat ceilings in `GameEngine.js` (lines 316-324) are massively raised on Outer Galaxy sectors. Without this, fully-built whales hit the existing 6.0× damage / 4.0× area walls and have ZERO chance of clearing even S12.

### Sector-scaled ceilings (in-run only — does not affect S1-S10 balance)

Caps tuned so the DPS ratio stays familiar at S11 (~6.3, similar to S10 Cosmic), drops to ~3.3 at S15 (kills get noticeably slower), and crashes to **~1.0 at S20** (every kill is a fight — real struggle). The escalating bonus multiplier on S15+ scores compensates for the kill-rate drop so the climb still pays off.

| Cap | S1-S10 (today) | S11 | S13 | S15 | S17 | S20 |
|-----|----------------|-----|-----|-----|-----|-----|
| `damageMult` ceiling | 6.0 | 10.0 | 18.0 | 30.0  | 50.0  | **80.0**  |
| `areaMult` ceiling   | 4.0 | 5.0  | 6.0  | 8.0   | 10.0  | 12.0  |
| `xpMult` ceiling     | 5.0 | 9.0  | 14.0 | 20.0  | 28.0  | 40.0  |
| `goldMult` ceiling   | 8.0 | 8.0  | 8.0  | 8.0   | 8.0   | 8.0   | ← unchanged (Outer Galaxy gold stays flat per the rewards rule)

❌ **cooldownMult cap lift dropped from plan** — `GameEngine.updateWeapons` already enforces `Math.max(0.35, this.player.cooldownMult)` per weapon, so lifting the constructor clamp would be dead code unless we ALSO patch the per-weapon line. Not worth touching the per-weapon path (anti-Overcharge protection) just for marginal cooldown gains in Outer Galaxy. Existing 0.35 floor stays everywhere.

**DPS ratio math** (cap / enemy HP multiplier, anchored to S10 Cosmic = 6.0):
- S11 Cosmic: 10 / 1.58 = **6.3** — feels like S10 Cosmic. First-sector welcome wall.
- S15 Cosmic: 30 / 9.09 = **3.3** — kills take ~2× as long as S10C. Noticeable struggle.
- S20 Cosmic: 80 / 81.25 = **0.99** — every kill is a fight. Real struggle. ~10% the relative damage output of S10 Cosmic.

S11-S12 plays similar to S10 Cosmic at higher numbers. S13-S15 demands optimised builds. S16-S19 punishes any imperfection. S20 is "everything goes right OR you die" — what near-impossible feels like.

### Scaling formula (per sector index)

Lookup table per sector — code skeleton at the end of this section.

### Two quality-of-life cap lifts on Sector 11+

1. **Vampiric Lash heal cap**: 5% → **10% Max HP per swing** on Outer Galaxy sectors. Currently useless against S15+ enemy damage; this brings sustain builds back into viability.
2. **Forge augment stacking**: allow **2 augments of the same stat per weapon** on Outer Galaxy sectors (so a whale can stack `damage_3` twice = +120% instead of +60% on their endgame weapon).

### What stays untouched

- **`STACK_FACTOR` 0.5 / 0.66** (weapon mastery + passive stats + talents) — these protect the S1-S10 leaderboard from the May 2026 stacking exploits. Don't touch.
- **Per-level growth caps in `levelUp()`** (5.0 dmg / 2000 HP / 30 armor / weapon level 20 / passive level 5) — these protect against Overcharge spam in 90-min endless. Don't touch.
- **NFT perks at 15%** — tied to whale spend; bumping invites complaints. Don't touch.

### Implementation note

Single ~20-line block in `GameEngine.js` constructor that replaces the existing 4-line clamp when `this.arena` is sectors 11-20. Sector index is the only gate; everything else stays exactly as-is. Fully reversible.

```js
// Pseudo — final code in implementation pass. Lookup-table per sector.
// cooldownMult intentionally omitted — 0.35 floor stays everywhere (dead code otherwise).
const OUTER_GALAXY_CAPS = {
    // sectorIdx: { dmg, area, xp }
    11: { dmg: 10,  area: 5,  xp: 9  },
    12: { dmg: 14,  area: 5,  xp: 11 },
    13: { dmg: 18,  area: 6,  xp: 14 },
    14: { dmg: 23,  area: 7,  xp: 17 },
    15: { dmg: 30,  area: 8,  xp: 20 },
    16: { dmg: 38,  area: 9,  xp: 24 },
    17: { dmg: 50,  area: 10, xp: 28 },
    18: { dmg: 62,  area: 11, xp: 33 },
    19: { dmg: 70,  area: 11, xp: 36 },
    20: { dmg: 80,  area: 12, xp: 40 },
};

const sectorIdx = ARENAS.findIndex(a => a.id === this.arena.id) + 1;
const outer = OUTER_GALAXY_CAPS[sectorIdx];
if (this._isS6 && outer) {
    this.player.damageMult = Math.min(outer.dmg,  this.player.damageMult);
    this.player.areaMult   = Math.min(outer.area, this.player.areaMult);
    this.player.xpMult     = Math.min(outer.xp,   this.player.xpMult);
    // cooldownMult untouched — per-weapon code in updateWeapons enforces 0.35 floor.
    // goldMult stays at 8.0 — Outer Galaxy doesn't inflate gold.
} else if (this._isS6) {
    // existing S1-S10 clamps — unchanged
    this.player.damageMult = Math.min(6.0, this.player.damageMult);
    this.player.areaMult   = Math.min(4.0, this.player.areaMult);
    this.player.xpMult     = Math.min(5.0, this.player.xpMult);
    this.player.cooldownMult = Math.max(0.35, this.player.cooldownMult);
}
this.player.goldMult = Math.min(8.0, this.player.goldMult);
```

## Spawn density per sector (locked)

Density scales mildly on top of the exponential HP/dmg curve — keeps the screen reading-friendly while still ramping pressure:

| Sectors | Spawn density |
|---------|---------------|
| 11–14   | baseline (same as S10) |
| 15–20   | +10% spawn density |

(Replaces the earlier "+25% on S14" note — too punishing on top of the 1.2× HP ramp.)

## Implementation & Rollout Strategy — Seamless Player Experience

**Silent rollout (no maintenance required).** The Outer Galaxy content is deployed behind sector-index gates — meaning the new arenas, enemies, and balance logic ship in the code but are mathematically unreachable by players until the Hub UI update lands.

**Phased deployment (recommended):**
1. **Backend + Engine pass (day 1–2)**: Code merges for Constants.js (10 new ARENAS + 20 new enemies + Pulsar Guardian), GameEngine.js cap-lifts, EnemySpawner.js difficulty lookup table, saveScore.js (ARENA_ORDER extension + bonus mult), all behind sector-index checks. Game still boots and plays normally — no visible change.
2. **Frontend rollout (day 3, the "launch moment")**: Hub page ships with Inner/Outer Galaxy tab split. Inner Galaxy tab is the default. Players who've cleared S10 suddenly see "Outer Galaxy" tab become available (gated by their save data). First player action = first visibility.
3. **No downtime, no "coming soon" banner, no maintenance window.** The content was invisibly live the whole time; the UI is just the moment it becomes reachable.

**Player experience:**
- **Casual players** (still grinding S1–S10): Nothing changes. Their default tab is Inner Galaxy. They see the Outer Galaxy tab but it says "locked — clear Sector 10 first."
- **Endgame players** (S10 clear): Log in, Hub now has the Outer Galaxy tab available by default (or remembered from their last session). Click it → S11 awaits. First S11 run feels like stepping through an invisible wall that was built weeks ago.
- **Day-1 launch message** (Discord post): Brief "Outer Galaxy unlocked" announcement. No hype, just factual — "if you've beaten S10, head to the Hub and check the Outer Galaxy tab." Players discover the 10-sector ladder naturally.

**Technical safety:**
- All 5 arenas + 20 mobs + 1 boss are shipped as new entries in Constants.js (no edits to existing T1–T10 roster — zero risk of breaking S1–S10 spawn logic).
- Difficulty lookup tables apply only to `sectorIdx >= 11` (check at the top of EnemySpawner functions).
- Score bonus multiplier is conditional on `sectorIdxForBonus >= 15` in saveScore.js.
- Cap-lifts are gated by `if (this._isS6 && OUTER_GALAXY_CAPS[sectorIdx])` — S1–S10 caps untouched.
- RunScore creation is untouched except for the `ARENA_ORDER` extension (existing logic walks it naturally).
- **No player data migration, no backfill, no flag resets.** Just code, live immediately.

**Day-1 launch checklist:**
- [ ] Backend + Engine merge (Constants, GameEngine, EnemySpawner, saveScore)
- [ ] Frontend merge (Hub UI tabs + localStorage persist)
- [ ] Post launch Discord message (brief, matter-of-fact tone)
- [ ] Monitor first 24h: watch for 429s on RunScore creation, cap-lift edge cases, any logic gaps in the difficulty lookup (should be none, but runtime is the real test)
- [ ] If hotfix needed: code is in, feature is live, just adjust numbers in the lookup table or cap thresholds and redeploy

---

## Status — ✅ READY TO IMPLEMENT

Difficulty + cap + score curves locked (audit 2026-06-03). All 5 unverified claims confirmed by direct code read (2026-06-03). Boss spawn pattern locked (option a, S12/S14/S16/S18/S20 only). Rollout strategy planned for seamless silent deployment.

### ✅ Verified in code 2026-06-03
- **`SCORE_HARD_CEILING = 10_000_000`** in `functions/saveScore.js` line 82 — assumption holds, bump to 25M is a one-line edit.
- **`ARENA_ORDER`** is a simple array in `saveScore.js` line 87 (10 arena ids). **`ARENA_DURATIONS`** is a `{id: seconds}` map at lines 94-97. Both extend trivially to 20 entries.
- **`unlockedArenasByCharacter` self-heal** confirmed in `saveScore.js` lines 470-475 — `for (let i = 0; i <= idx + 1; i++)` walks `ARENA_ORDER` directly, so extending the array auto-extends the unlock chain. No code change needed there.
- **Top kill milestone is `160000`** in `game/CharacterUnlocks.js` line 18 (and mirrored in `saveScore.js` line 106). Full 10-char roster unlocked at 160k kills — Outer Galaxy players will have long since hit this.
- **S6 cap-clamp block** confirmed in `game/GameEngine.js` — single `if (this._isS6) { ... }` block clamping `damageMult`/`goldMult`/`areaMult`/`xpMult` + `cooldownMult` floor at 0.35. `updateWeapons` per-weapon `Math.max(0.35, this.player.cooldownMult)` confirms the dead-code finding — lifting the constructor `cooldownMult` floor without ALSO patching the per-weapon line would do literally nothing. Plan stays correct: don't touch it.

### 🧹 Optional cleanup at implementation
**Dead NG+ write in `saveScore.js` lines 481-483.** NG+ was removed from the game, so `s.newGamePlusUnlocked = true` writes a flag nothing reads anymore. Once `ARENA_ORDER` is extended to 20 entries, the trigger moves S10 → S20 — but it's a no-op either way. Recommend deleting the dead `else if (idx === ARENA_ORDER.length - 1)` branch entirely while we're in the file. Trivial 3-line cleanup, zero gameplay impact.



### Constants & data
1. **`game/Constants.js`** — append 10 new `ARENAS` entries (S11-S20) with backgrounds from the table above. Append 20 new tier 11-14 enemy entries with new ids. Append Pulsar Guardian to the boss pool (7th entry, sprite sheet 5×5/25-frame).
2. **`game/Lore.js`** — append lore lines for the 20 new mobs + Pulsar Guardian.

### Backend (saveScore.js)
3. **`functions/saveScore.js`** — 4 minimal edits:
   - Extend `ARENA_ORDER` array from 10 → 20 ids
   - Extend `ARENA_DURATIONS` map with the 10 new durations (8:00 → 12:30)
   - Bump `SCORE_HARD_CEILING` from 10M → 25M
   - Add escalating bonus multiplier on `sectorScore + victoryBonus` (S15-S17: 2×, S18-S19: 2.5×, S20: 3.5×)
   - ✅ Kill score, level² score, etc. auto-scale — existing kill-driven lines pick up the new sectors naturally
   - ✅ `unlockedArenasByCharacter` self-heal already walks `ARENA_ORDER` → automatically extends (NEEDS VERIFICATION at implementation — claim from audit, not directly read from code)

### Engine
4. **`game/GameEngine.js`** — sector-scaled cap-lift block in constructor (~20 lines, see "Player power cap lifts" — cooldownMult NOT lifted, dead code). Vampiric Lash heal cap 5%→10% on S11+. Forge augment stacking allows 2-of-same on S11+.
5. **`game/EnemySpawner.js`** — replace `Math.pow(1.2, arenaIndex)` for S11+ with the locked difficulty lookup table (S11 base 1.05 → S20 base 54.17). Raise tier cap to 14. Spawn density +10% on S15-S20. Boss pool rotation: random across 7 bosses for S12/S14/S16/S18; Pulsar Guardian guaranteed on S20.
   - ✅ **Sector boss spawn pattern — LOCKED: option (a)**. Match current Inner Galaxy cadence — bosses on indexes [11,13,15,17,19] = sectors **S12, S14, S16, S18, S20** only. Odd-indexed Outer Galaxy sectors (S11, S13, S15, S17, S19) ship boss-free, same as today's S1/S3/S5/S7/S9. Keeps the `isBossArena` check unchanged (just extend the index array) and avoids the engineering cost of designing 5 extra boss encounters.
   - 🔮 **Follow-up ticket**: "random boss on any sector" mechanic is a separate design pass. Once that lands, every Outer Galaxy sector (odd indices included) gets a boss via the new system. Outer Galaxy ships with option (a) until then.
6. **Arena effects** — pick 4-5 of the 5 proposed new effects (`ion_storm`, `void_pulse`, `eclipse_dim`, `gravity_well`, `aurora_drift`) and implement in the effects layer. Remaining sectors reuse existing 4.

### Frontend
7. **`pages/Hub`** — Inner/Outer Galaxy tab split. localStorage remembers last-selected tab. Outer Galaxy tab gets cosmic-glow treatment + "★ NEW" badge if player has zero S11+ clears.
8. **Bestiary page** — auto-picks up the 20 new mob entries from Constants/Lore. No layout work expected.

### NOT changing (confirmed by audit)
- `STACK_FACTOR` (0.5 / 0.66) — protects S1-S10 leaderboard, untouched
- Per-level growth caps in `levelUp()` — anti-Overcharge, untouched
- NFT perks at 15% — whale-tied, untouched
- Character unlock chain — NFT instant + 160k-kill milestone roster already covers Outer Galaxy players
- Gold drops in S11-S20 — flat at S10 values (rewards rule)
- Endless / raid / meteor score formulas — sandbox, untouched

**Effort estimate**: ~1 focused implementation pass for items 1-3 + 7 (the "must-ship" core). Items 4-5 are the medium pass. Item 6 (new effects) is the longest tail — recommend shipping with **2 new effects + 8 reused** at launch, then patching in the other 2-3 over the following weeks.