# PLAN — ASCENDED PROTOCOL (fixed-length ranked gauntlet)

Status: **PLANNED — not started**
Target: S9+ (own feature gate, not tied to a season formula change)
Full rewrite 2026-07-17 — consolidates all design discussion into one
coherent document. Supersedes all earlier drafts.

---

## 1. One-paragraph summary

A weekly ranked game mode where **every pilot plays the exact same maxxed
loadout** — all meta-progression flattened to a fixed server-side template
— in a **fixed-length 10:00 gauntlet** whose enemy ramp never stops
climbing. The arena skin, enemy roster and modifiers **rotate weekly**,
seeded by `week_id`, identical for everyone. Ten minutes keeps runs
snackable: more attempts per session, a tight anti-cheat window, a fast
"run it back" loop. Score comes only from what you did in the run — kills,
level, elite kills — never from time survived. All OMENX spent inside
Ascended runs feeds a **mode-isolated weekly pool: 80% paid to the
Ascended leaderboard, 20% dev wallet.**

**The pitch:** *"The campaign is free. The arena pays."* Nothing you own
or ever bought follows you into Ascended — same ship, same battlefield,
same 10 minutes for everyone. (What *can* still be bought mid-run, and how
honest we are about that, is §7b.)

---

## 2. Locked design decisions

| Decision | Choice | Why |
|---|---|---|
| Progression | **Full flatten** — server-built template save; the player's real save is never read for run stats | Zero drift, zero "my relic didn't apply" tickets, tune once |
| Relics / NFT / VIP / titles / forge / pool bias | **All OFF** | Level playing field; only cosmetics carry over (visual-only) |
| Run length | **Fixed 10:00 hard cap** (config value, decided 2026-07-17) | Bounded server cost, tight anti-cheat envelope, snackable attempt grinding |
| Difficulty | **Infinite ramp within the window** — starts steep, ends absurd | A maxxed template steamrolls fixed tuning; the ramp always catches up |
| Time in score | **ZERO** — the timer is run length only | S5 `time × 5` lesson: time-scoring rewards passivity |
| Score formula | kills + level² + elite/boss bonus (§6) | Aggression is the only path up the board |
| Rotation | **Weekly**: arena skin + enemy roster + 1–2 modifiers, seeded by `week_id` | Variety without retuning; same combo for everyone all week |
| Economy | **One pool, 80% players / 20% dev** — post-split, fed by ALL OMENX spend anywhere in the game (§7a) | One pool, simple pitch, self-balancing; every purchase grows the prize |
| Revives | Allowed, existing escalation pricing, **1 per run** | A spicy decision under a running clock; feeds the pool |
| Entry cost | **Free to enter**, unlimited attempts, best run counts | Maximum attempts → healthier pool; barrier-free skill showcase |
| Endgame role | **The only OMENX payout in the game** after the Great Split (§12) | One competitive economy instead of five |

---

## 3. The template save ("Ascended Loadout")

Built **server-side** as a synthetic save; versioned (`template_v: 1`) so
future rebalances are explicit and auditable on old leaderboards.

Included (maxed):
- All 10 characters unlocked — player picks freely each run
- All base stats at cap (damage, HP, speed, cooldown, area, XP gain, etc.)
- All weapon upgrade levels at cap
- Full talent tree for the chosen character

Explicitly EXCLUDED / zeroed:
- Relics + prestige relic bonuses, forge augments, pool bias (neutral for
  everyone), NFT perks, VIP bonuses, title effects, admin/global XP buffs,
  squad treasury buffs
- **Hard rule: no per-wallet levers in this mode, ever.** No silent
  multipliers, no staff buffs, no overrides. The mode never reads those
  tables at all — fairness enforced by construction, not by policy.

In-run pickups (XP, magnets, health) work normally — they're part of the
run. Relic **fragments do not drop** (runs credit nothing to the real
save, §7c).

Client plumbing follows the `is_sandbox` precedent: `Game.jsx` receives
`mode: 'ascended'` + the template at run start (mirrored from a shared
`ascendedTemplate.js`; the server stays authoritative at validation time).

---

## 4. Run structure — the 10-minute gauntlet

- **Hard cap 10:00.** Run ends at the horn (a "victory"-style end screen)
  or on death, whichever first. No extension mechanics.
- **Ramp:** reuse the endless scaling loop + DD/HEAT machinery with an
  Ascended curve: starts at roughly "S18 Cosmic" pressure and multiplies
  continuously. Target tuning: **a great pilot dies at ~8–9 min**;
  surviving to 10:00 is a genuine feat, not the norm.
- **The final minutes are the densest** — the run crescendos. Since score
  is kill-driven, the endgame is worth the most points; two horn-survivors
  are separated by how hard they farmed the chaos.
- **Death = final.** One paid revive allowed (escalation tier by minutes
  elapsed, same table as normal mode — late-run deaths land in the
  8–11 min / 15 OMENX tier naturally).
- **Elites/minibosses spawn on a fixed cadence** (e.g. every 1:40) so the
  elite-bonus score term has a predictable, equal supply for everyone.

Tuning workflow: play the template in the Practice Range (Sandbox already
unlocks everything + has time fast-forward) against the Ascended curve
until the 8–9 min death target holds. Curve constants live in one place
(`ascendedRamp.js`, mirrored in validation) — tune once; no per-player
variance means it holds.

---

## 5. Weekly rotation (seeded, deterministic)

Seed = `week_id` (existing ISO logic). Derived deterministically
(hash → index), so client and server agree with zero coordination and no
admin chore. Everyone worldwide gets the same combo all week:

1. **Arena skin** — one of the 20 existing sectors (background, hazards,
   music). Cosmetic borrow only; the sector's own wave tuning is ignored.
2. **Enemy roster** — the borrowed sector's enemy family, so weeks *feel*
   different to fight, not just look different.
3. **1–2 modifiers** from a curated list, e.g.:
   - Elites spawn in pairs
   - Miniboss cadence 1:40 → 1:10
   - Enemy projectiles +25% speed
   - XP gems decay after 5s (forces aggressive collection)
   - "Frenzy finale" — last 2 min density ×1.5
   - No health drops after 7:00

   List starts small (6–8) and grows. Some pairs are excluded (config
   table) so a week can't roll two health-starvation mods together.

Displayed on the lobby page ("THIS WEEK'S PROTOCOL: Supernova sector ·
Paired Elites · Frenzy Finale") and in the Discord weekly post.

---

## 6. Scoring

**No time term. No gold term. No sector/difficulty multipliers. One
formula, forever:**

```
score = kills × K            (backbone — kills/min is the skill measure)
      + level × level × L    (build progress within the run)
      + eliteKills × E       (anti-trash-farming: elites must be worth it)
```

Starting constants (tune in Practice Range before launch): `K = 120`
(matches S6 familiarity), `L = 100`, `E = 2000` per elite/miniboss.

Properties:
- Dying early hurts naturally (dead pilots stop scoring) without paying a
  single point for time itself.
- Playing scared at the map edge earns nothing; the ramp feeds kills to
  whoever farms the density.
- Horn-survivors are separated by kill count; the dense finale prevents ties.
- Weekly modifiers change the *conditions*, never the scoring.

**Anti-cheat is far tighter than normal mode:** fixed template + fixed
window + known ramp = a computable "max plausible kills per minute
elapsed" envelope. Validation **rejects hard** rather than clamping.
Max level reachable in 10 min with template XP gain is knowable → hard
level cap; elite kills are capped by the spawn cadence (a 10-min run
can't contain more than the cadence-derived N).

---

## 7. Economy — the Ascended Pool

### 7a. Spend routing — ALL spend feeds the one pool (locked 2026-07-17)

**No spend tagging at all.** With the legacy pools retired (§12b) there
is exactly one destination — so **every OMENX spent anywhere in the
game** accumulates into the same weekly AscendedPool row. No `pool_scope`
markers, no context routing, no per-source accounting. And because the
switch is a hard cutover at a season rollover (§12e) rather than a
parallel-running sunset, no transition tagging is ever needed either.
The marketing line is free: *"every OMENX spent anywhere grows the
weekly prize pool."*

Reality check on sources: today that means **in-run SKUs + the Pool
Patron top-up** — cosmetics currently have no OMENX pricing (they're
sold via GMT/chests). If OMENX-priced cosmetics ever ship, they'd feed
the pool automatically with zero extra code — that's the point of no
routing.

Still needed:
- `purchaseSku` verifies an open AscendedRun row (§8) before accepting
  **in-run** SKUs (reroll/banish/revive/ult) — that check is anti-abuse
  (no buying revives from the lobby), not pool routing
- Ascended revives use the run's elapsed time for escalation tier and do
  **not** touch the player's normal-mode weekly revive counter

### 7b. Honest framing — in-run spend DOES influence runs

**We do not claim "spending can't influence results." It can.** A mid-run
reroll can land the weapon you needed; a revive turns a death into three
more scoring minutes. Anyone who plays the mode will notice; pretending
otherwise would poison the fairness brand the mode depends on.

What we CAN honestly claim, and what the pitch must say:

1. **You cannot buy a stronger account.** No meta-progression, upgrade,
   relic, NFT or VIP status carries in. Day-one player and 2-year whale
   launch with identical ships.
2. **In-run options are equal-access and bounded.** Same SKUs, same
   prices, same limits for everyone — most importantly **1 revive per
   run, hard**. There is no "spend 500 OMENX for 10 revives" path.
3. **Attempts are free and unlimited, best run counts.** A skilled
   free-runner's 40 attempts are a stronger strategy than a spender's
   revive — the grind path to the top costs nothing.
4. **Spend feeds the prize pool you're competing for.** 80% of every
   in-run OMENX goes back to the board — spenders are literally funding
   the winners.

The honest tagline is **"no pay-for-power *account*, bounded pay-for-
convenience *in the run*"** — not "spend changes nothing."

If launch data shows revive/reroll spend correlating too strongly with
top-10 placement, the escalation levers are (in order of severity):
score-tax on revived runs (e.g. −10%), a "pure run" flag/side-board for
zero-spend runs, or cutting advantage SKUs to revive-only. Decide from
data, not upfront (open item 13).

### 7c. Distribution — 80 / 20 of ALL weekly spend
- **80%** → paid to that week's Ascended leaderboard at rollover
- **20%** → dev side. **Staff payouts now come out of this 20%** (they
  can't sit on top — 80 + staff% + 20 would exceed 100). Worth checking
  the staff % against a 20% ceiling before locking.
- Omen Treasury's 3% platform fee still comes off the top off-code, same
  as everything (footnote in the mode's info panel)

If the pool ever over- or under-fills relative to revenue needs, the
80/20 ratio is a single config knob (`ascendedPayoutConfig`), not a
redesign.

Payout curve: reuse the weekly players pool shape (top-N, decaying
percentages) via a new `ascendedPayoutConfig` AppConfig key — editable
without deploys. Zero-spend week → pool shows 0, distribution no-ops.

### 7d. What runs credit to the real save
**Nothing.** No gold, no fragments, no kills toward squad/war/weekly
counters, no bounty/daily-task progress, no character milestones, no
arena unlocks. The only outputs of an Ascended run are a leaderboard
entry and pool payout eligibility. Same one-way-rejection pattern as
`is_sandbox`, except it DOES write the mode's own score row.

*(Squad/kill-board credit via normalization configs is a Great Split
concern — §12d — not a launch feature.)*

---

## 8. Data model

New entities (admin-only write RLS, house pattern):

**AscendedRun** — open-run registry + anti-abuse anchor
- `wallet_address`, `week_id`, `character_id`, `started_at_ms`,
  `status: active | finished | abandoned`, `revive_used: bool`
- Created by `startAscendedRun`; `purchaseSku` requires an `active` row
  for `context: 'ascended'` spends; closed by score submit. Stale
  `active` rows (> 20 min) auto-expire.

**AscendedScore** — the leaderboard. Deliberately NOT RunScore: keeps the
mode out of every existing leaderboard/cleanup/payout query **by
construction**, not by filter.
- `wallet_address`, `player_name`, `player_title`, cosmetic mirrors
  (same verified-ownership mirroring as RunScore), `character_id`,
  `week_id`, `score`, `kills`, `elite_kills`, `level`, `time_survived`
  (display only), `survived_full: bool`, `revive_used: bool`,
  `template_v`, `modifiers: [..]`
- **Best run per wallet per week** — submit upserts-if-higher, so the
  keep-top-scores cleanup cron never needs to know this entity exists.

**AscendedPool** — one row per `week_id`: `week_id`, `total_spent`,
`distributed: bool`

**AscendedPayoutLog** — mirror of PayoutLog shape, own entity for the
same isolation reason: `week_id`, `wallet_address`, `player_name`,
`amount`, `rank`, `tx_id`

AppConfig keys: `ascendedConfig` (run length, ramp constants version,
enabled kill-switch), `ascendedPayoutConfig` (curve).

---

## 9. Backend functions

| Function | Purpose |
|---|---|
| `startAscendedRun` | Auth → create/refresh `active` AscendedRun, return template + week rotation so client and server agree |
| `saveAscendedScore` | Validate (envelope, §6) → upsert-if-higher into AscendedScore → close AscendedRun. **Zero PlayerSave writes.** |
| `getAscendedLeaderboard` | Week's board + pool size + my best + rotation card |
| `distributeAscendedPool` | Admin/scheduled: freeze board → 80% by curve → OMENX rewards API (same TX machinery as distributeRewards) → AscendedPayoutLog → mark distributed. Idempotent. Launch manual-first, automate once trusted. |
| `purchaseSku` (modify) | In-run SKUs require an active AscendedRun (anti-abuse). ALL OMENX spend accumulates to AscendedPool — no tagging (§7a). Revive tier from run elapsed time, not weekly counters. |
| `checkpointRun` (modify) | Reject `is_ascended` snapshots same as sandbox (10-min runs don't need crash recovery; keeps flushPendingScores clean) |

---

## 10. Client surface

- **Lobby page `/ascended`** (+ PlayCarousel slide): rotation card, live
  pool size, leaderboard top-N + my rank, character picker (all 10),
  LAUNCH button, countdown to weekly rollover.
- **In-run:** distinct premium HUD accent (gold/white "ascended" trim vs
  sandbox's warning-yellow), prominent 10:00 countdown, branded banner
  strip ("ASCENDED PROTOCOL — RANKED · WEEK 2026-W37").
- **End screen:** score breakdown (kills / level / elites), week rank
  achieved, pool share projection if in top-N, "RUN IT BACK" button.
- **GameEngine:** `is_ascended` flag → template stats, disable
  relic/NFT/VIP/forge/bias/title hooks (same seams as the sandbox flag),
  Ascended ramp, hard-stop at cap with horn sequence.

---

## 11. Anti-abuse checklist

- ✅ Template server-authoritative; client copy is render-only
- ✅ Score envelope: max kills/min, hard level cap, elite count cap — reject, don't clamp
- ✅ `context: 'ascended'` spends require an open AscendedRun (no pool-stuffing from outside runs)
- ✅ Upsert-if-higher = duplicate submits naturally idempotent (+ existing 2-min dup fingerprint check)
- ✅ No silent multipliers / staff buffs / per-wallet overrides — the mode never reads those tables
- ✅ Admin wallets may play and rank (pure skill — nothing to grant yourself), but admin self-spend is excluded from pool accumulation, mirroring purchaseSku's existing rule
- ✅ Blacklist/mute checks same as saveScore
- ✅ Kill-switch: `ascendedConfig.enabled = false` hides the lobby + rejects starts

---

## 12. THE GREAT SPLIT — long-term ecosystem (locked 2026-07-17)

**The campaign goes completely free-to-play; ALL competitive OMENX
economy consolidates into Ascended.**

### 12a. The two games

| | **Campaign (Sectors 1–20 + Endless)** | **Ascended Protocol** |
|---|---|---|
| Costs | **100% free.** Gold-only economy — every upgrade, talent, relic, revive, forge roll bought with earned gold. No OMENX power SKUs. | Free entry; bounded in-run OMENX spends (§7b) |
| Pays | Gold + progression + unlocks. **Zero OMENX payouts.** | **The only OMENX payouts in the game.** One pool, 80/20 |
| Purpose | Build your account, learn the game, *earn your Ascension* | Prove your skill, get paid |
| Pay-for-power | Nothing to buy, nothing paid out — moot | No account power buyable; in-run spend bounded + honestly framed (§7b) |

**Free ≠ easy.** The campaign keeps its teeth: difficulty tiers, DD/HEAT
ramp, Outer Galaxy scaling and the gold-grind curve all stay. Removing
OMENX shortcuts *sharpens* the challenge — you can't buy past a wall
anymore, you earn through it. Tuning goal: fun, never a walk in the park.

### 12b. What gets RETIRED (hard switch at season rollover, §12e)
**Nothing weekly/seasonal survives on the campaign side — pools AND
upgrade monetisation both go. No partial keeps.**
- **Weekly players pool** — retired; Ascended weekly pool replaces it
- **Seasonal players pool** — retired (a seasonal Ascended board is a
  possible phase-3+ feature, but that's Ascended, not a campaign pool)
- **Kill pool** — retired; the kill leaderboard survives as a
  bragging-rights board but pays nothing
- **Campaign OMENX power SKUs** — switched off: stat/weapon upgrades,
  talents, revives, fragment express go gold-only (gold prices already
  exist on most dual-currency SKUs) or are removed
- **StaffPayoutAllocationPreview five-slice bar** — collapses to a
  one-pool view; weekly ops overhead drops massively

### 12c. What SURVIVES and how it's funded
| System | New basis |
|---|---|
| **Revenue** | **20% dev share of ALL weekly OMENX spend** (§7c). OMENX sources today: ① Ascended in-run SKUs, ② Pool Patron top-ups. Cosmetics have no OMENX pricing currently (GMT/chests) — they stay a separate revenue line unless OMENX-priced cosmetics ship, in which case they feed the pool automatically. VIP/NFT perks re-scope to campaign conveniences + cosmetic flair (never touching Ascended) |
| **Staff payouts** | Carved out of the dev-side 20% (§7c) — mode-agnostic by construction since all spend lands in one pool |
| **Squad champions** | Fed by normalized Ascended kills (§12d), funded as a slice of the pool's player side (e.g. 80 → 70 individual / 10 squad) |
| **Squad wars / weekly kills / daily goals** | Campaign kills credit at 1.0 forever + normalized Ascended kills (§12d) — squads stay alive wherever members play |
| **Omen Treasury 3%** | Unchanged — off the top of everything |

**Revenue risk: measured and low.** Spend audit (TokenSpendLog,
2026-07-01 → 07-17, 500 rows):
- In-run spend (reroll/revive/banish/ult/xp): **10,651 OMENX** — the
  dominant stream, broad player base, maps 1:1 to what Ascended monetises
- Upgrade spend: 6,560 — **but 3,925 (60%) is one player (Scooby)
  deliberately topping up the pool** because upgrades were the only route
  in; organic upgrade spend ≈ 2,600 over 2.5 weeks and falling

The upgrade economy is already dead as a revenue stream — F2P campaign
formalises reality rather than gambling on it. Upsides stack: F2P is the
biggest possible acquisition lever (more pilots → bigger pool → bigger
prize headlines); cosmetics get first-class investment (machinery already
exists); and pool-toppers like Scooby get a **direct "Pool Patron" top-up
SKU** — donate straight into the prize pool with visible credit, instead
of laundering it through upgrades they don't need.

### 12d. Squad + kill-board bridging (configs, not code forks)
- `ascendedConfig.squad_kill_credit_pct` — Ascended kills × pct → squad
  weekly kills / wars / champions. Start ~0.5, tune from data.
- `ascendedConfig.kill_lb_credit_pct` — same for the personal weekly kill
  board (`weekly_sector_kills` / WeeklyKillSnapshot).
- Campaign kills credit squads at 1.0 forever.

### 12e. Transition — hard switch at a season rollover (no sunset)
No parallel-running period. One clean cutover at an end-of-season
rollover:
1. **Announce ahead of the rollover** — "final season of the old pools"
   is itself a marketing beat; players get a full heads-up window.
2. **At rollover:** old pools pay their final distribution (send-off
   Discord post honouring all-time earners) → campaign OMENX power SKUs
   switch off → campaign goes fully F2P → Ascended pool goes live as the
   only payout, all in the same rollover.
3. **Grandfathering:** nothing clawed back — every upgrade/talent/relic
   ever bought stays. Early spenders keep a permanently stronger campaign
   account; it costs nothing since the campaign no longer pays out.
4. **Top-spender comms:** personally flag the change to known whales
   before the public post.

Ascended itself can soft-launch earlier in the season (staff testing /
no pool, per §14 Phase 1) so the mode is proven before it becomes the
only payout on cutover day.

### 12f. No solvency fallback needed — the pool can't fail
**Campaign pools and upgrade SKUs never return, and no fallback is
required.** The pool is a fixed percentage of actual spend — it pays out
80% of whatever came in, so it is solvent by construction. A quiet week
just means a smaller prize, never a shortfall.

The only lever worth having is a growth lever if the headline number
feels small: push the Pool Patron SKU, introduce OMENX-priced cosmetics
(which feed the pool automatically, §7a), or seed a dev top-up for a
promo week. §12b retirements still ship as config flips (pool % → 0,
SKU disabled flag) purely as an emergency brake; the legacy code gets
hard-deleted one full season after the switch.

---

## 13. Open items (decide before build)

1. Payout curve top-N (suggest: mirror weekly players pool initially)
2. Which in-run SKUs are available in Ascended (reroll/banish/revive/ult assumed)
3. Elite spawn cadence + `E` constant (Practice Range tuning session)
4. Weekly #1 cosmetic reward — "the Ascended" title flair (phase 2?)
5. Ascended unlock gate (aspirational endgame — e.g. beat Sector 10 — vs open to all)
6. Squad kill normalization starting values (§12d)
7. Which season rollover the switch (§12e) lands on — Ascended should soft-launch earlier that season
8. VIP/NFT perk re-scope list — exactly which perks survive as campaign conveniences (§12c)
9. Squad champions slice of the pool (§12c)
10. Pool Patron SKU details — pricing tiers, "patron" credit surface (§12c)
11. Seasonal Ascended board (best-week-sum) — phase 3+, yes/no
12. In-run spend-vs-placement monitoring: which metric triggers the §7b escalation levers, and which lever first

## 14. Build phases

- **Phase 1 — Core loop:** entities + `startAscendedRun` + template/ramp
  in engine + `saveAscendedScore` + basic lobby/leaderboard. Pool
  accumulates (purchaseSku routing) but no distribution yet. Ship behind
  `ascendedConfig.enabled` for staff-only testing.
- **Phase 2 — Money:** `distributeAscendedPool` + payout preview in admin
  + AscendedPayoutLog viewer + Discord post integration.
- **Phase 3 — Polish:** modifier pool expansion, end-screen flourish,
  weekly #1 title flair, PlayCarousel slide art.

Tuning gate between Phase 1 and 2: at least one full internal week where
the 8–9 min death target and the score envelope hold up.