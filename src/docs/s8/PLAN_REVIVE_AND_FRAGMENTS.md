# OMENX Sinks — Immediate Ships (2026-07-01)

**Scope:** the two sinks we're actually building next. Every other lever
from the collapse audit is parked. This doc holds the specs, the numbers,
and the combined revenue picture so we don't have to re-derive them each
time we tweak a value.

**Companion docs:**
- `AUDIT_OMENX_COLLAPSE.md` — full diagnosis + all levers.
- `PLAN_SANDBOX_TEST_PLAY.md` — S8 retention companion (see §"S8 launch coordination" below).

---

## S8 launch coordination — retention alongside monetisation

Both sinks in this doc are **monetisation** levers: they pull more OMENX
out of players who are already here. Neither of them addresses the
audit's other headline finding — **active players fell 63 → 31 (-51%)**.
Extracting more from a shrinking base only works for so long.

**Sandbox / Test Play Mode** (spec in `PLAN_SANDBOX_TEST_PLAY.md`) is
the retention companion. It was originally scoped as an OMEN-public-
launch onboarding tool but the same build serves the S8 returning-
player problem better than any balance patch:

- Lapsed players who churned around W25 (shield nerf) can dust off
  their old build risk-free before committing to a real run — removes
  the "I don't remember how to play anymore" bounce.
- Reframes S8 messaging: without sandbox, S8 patch notes read as
  *taking* (revive costs more, here's a way to buy fragments).
  With sandbox they read as *giving* — "try anything, then chase
  the leaderboard". The launch announcement lands very differently.
- Feeds the two monetisation sinks downstream: player uses sandbox →
  commits to a real cool build → dies at 10 min → the new 15-OMENX
  revive is a save-my-build moment, not a cash grab.

**Ship-together package for S8:**

| Feature | Type | Effort | Purpose |
|---|---|---|---|
| Revive escalation | Monetisation | 0.5d | Charge fairly for late-run saves |
| Fragment express lane | Monetisation | 0.5d | Give whales a new anchor spend |
| Sandbox / Test Play | Retention | ~5d | Bring lapsed players back + soften onboarding |

**Sandbox risk to name:** could marginally reduce revive spend if
players perfect builds in sandbox first and die less in real runs.
Realistically small — real-run randomness kills more often than build
ignorance — but worth watching in the week-4 monitoring pass.

**Sandbox is a design call, not a monetisation decision.** ~5 days of
dev during S8 crunch is real budget; product should confirm what else
on the S8 roadmap slides if all three ship together. See sandbox doc
for the full spec.

---

## Baseline we're trying to move

| Week | Total OMENX | Revive OMENX | Notes |
|---|---:|---:|---|
| W23 (2026-06-02) | 43,885 | 3,572 | Peak |
| W25 (S7 launch) | 14,052 | 1,928 | Collapse |
| W26 | 18,584 | 1,276 | |
| W27 (partial) | 9,553 | 384 | 1 day in — extrapolates to ~2.7k |

**Target:** stabilise weekly total OMENX above **20,000** across the base
of ~30-40 active weekly players. The two sinks below are our first attempt.

---

## Sink 1 — Revive Escalation + Weekly Cap

### Current state (verified against live data)

- SKU: `ingame-revive`, currently **4 OMENX flat**.
- Trigger: engine already fires the death-revive prompt
  (`GameEngine.js:673`), no new hook needed.
- **Storage note:** `TokenSpendLog` rows are aggregated **per wallet per
  day** to save DB space, so `amount / 4` = actual revive count for that
  day. Numbers below are already de-aggregated.

**Live data — last 5 weeks (500 daily rows examined):**

| Week | OMENX | Revives | Unique wallets | Avg revives/wallet/week |
|---|---:|---:|---:|---:|
| W23 | 3,572 | **893** | 37 | **24.1** |
| W24 | 2,376 | 594 | 35 | 17.0 |
| W25 | 1,928 | 482 | 31 | 15.5 |
| W26 | 1,276 | 319 | 27 | 11.8 |
| W27 (partial) | 384 | 96 | 25 | 3.8 |

- **Avg reviver dies 12-24× per week** and pays 4 OMENX each time.
- **Top 3 lifetime revivers:** 368 / 296 / 260 revives — real whales.
- **Daily row-size distribution** (i.e. revives-per-day-per-wallet):
  - 1 revive/day: 156 rows (31%)
  - 2-3/day: 143 rows (29%)
  - 4-5/day: 72 rows (14%)
  - 6-10/day: 72 rows (14%)
  - **11+/day: 57 rows (11%)** ← this is where a cap actually bites

**~26% of daily rows are 6+ revives in a single day.** With
one-revive-per-run enforced, that means 6+ separate runs in a single
day, each ending in a paid revive — this is dedicated grinding, not
chain-reviving one long run.

**Player-week distribution** (155 revive-active player-weeks over the
last 6 weeks):
- **64 (41%) had 10+ revives in the week** — would hit a 10/wk cap.
- **47 (30%) had 15+ revives** — would hit a 15/wk cap.
- **32 (21%) had 20+ revives** — would hit a 20/wk cap.

A 10/week cap binds on **41% of revive-active player-weeks** — much
harder than initially assumed. This changes the revenue math below.

**RunScore/revive mismatch — explained:** initial audit flagged top
revivers with 40-125 weekly revives against 0 matching RunScore rows.
This is expected: RunScore is pruned to top-5 per player for DB space,
so the 40+ non-top-5 runs those revivers played simply aren't in the
table anymore. One-revive-per-run is enforced — the revenue math stands.

### The proposal (locked)

Time-based cost curve so late-run revives — where the value delivered is
highest — cost more. **Tuned for sector runs**, which are 82% of all
runs and where the score-leaderboard chasers (our OMENX whales) live.
Sector runs cap at **~12:30** — pricing has to fit that ceiling.

| Run time at death | Cost | Rationale |
|---|---:|---|
| 0-4 min | **4 OMENX** | Unchanged — early revives stay a soft impulse buy. |
| 4-8 min | **8 OMENX** | Mid-run. Real investment now. |
| 8-11 min | **15 OMENX** | Deep sector run — score is climbing, losing it hurts. |
| 11 min+ / endless-any | **25 OMENX** | End-of-sector podium save or a genuine endless-tier death. |

- **Weekly cap: 15 revives per player per week** (see cap-size sensitivity below).
- Cap resets on ISO week rollover (piggyback on existing weekly reset).
- Death prompt shows the price BEFORE the click — no surprise charges.

### Why these numbers

- **4 → 8 → 15 → 25** roughly matches the tier structure we already use
  for banish (2 / 4 / 6 OMENX) — familiar shape, higher ceiling.
- **Sector-run reality check:** live data (500-run sample) shows sector
  deaths cluster at **40% 0-5min / 25% 5-10min / 35% 10-12.5min** — the
  10-12.5min bucket is huge and directly maps to "I was about to
  finish a leaderboard-worthy sector run and one hit ended it". That's
  exactly the moment worth 15+ OMENX to a score chaser.
- Endless runs (18% of all runs) contribute a real but small 25min+
  tail — 7% of endless runs reach 25min+. Top tier still exists but
  isn't where the volume lives.
- 15/week cap trims the 30% of revive-active weeks that hit 15+
  revives without punishing normal engaged players.

### Revenue estimate

Baseline against W26: 27 revivers, **319 revives**, 1,276 OMENX
(all at flat 4 OMENX). Avg 11.8 revives per active reviver per week.

**Bucket split — grounded in live data.** Sector runs are 82% of the
mix, endless is 18%. Applying real death-time distributions from a
500-run sample:

- Sector deaths (~82% of revive volume): 40% at 0-4min / 25% at 4-8min
  / 35% at 8-11min (very small 11-12:30 tail).
- Endless deaths (~18% of revive volume): 33% at 0-5min / 37% at 5-10min
  / 23% at 10-25min / 7% at 25min+.

Weighted blend of all revive volume by cost tier:
- **4 OMENX tier (0-4min):** 39%
- **8 OMENX tier (4-8min):** 26%
- **15 OMENX tier (8-11min sector / 10-25min endless):** 33%
- **25 OMENX tier (11min+ sector podium / 25min+ endless):** 2%

**Cap-size sensitivity:**

| Cap | Player-weeks capped | Est. revives/wk | Est. OMENX/wk | Delta vs 1,276 |
|---|---:|---:|---:|---:|
| 10/wk | 41% | 180 | ~1,641 | +29% |
| **15/wk** | **30%** | **235** | **~2,143** | **+68%** |
| 20/wk | 21% | 270 | ~2,462 | +93% |
| No cap | 0% | 319 | ~2,908 | +128% |

**Recommendation:** ship with **15/week** as the cap. It trims the
compulsive-grind top tail (30% of weeks capped) but delivers
meaningfully more revenue than the 10/week option. The 20/week option
is close to uncapped and doesn't meaningfully protect anyone.

Top-whale ceiling at 15/wk: 15 × 25 = **375 OMENX/week/whale** (rare —
the 25 tier barely fires); realistic whale ceiling ~200 OMENX/week.

### Locked spec (post-tuning)

- 4 / 8 / 15 / 25 OMENX by run-time bucket (4 / 8 / 11 min breakpoints,
  tuned for the 12:30 sector-run ceiling).
- **Weekly cap: 15 revives per player per week.** (Trims the top 30%
  of revive-active player-weeks — the dedicated 15+ separate-run
  grinders — without capping normal engaged players.)
- One revive per run (already enforced by engine — confirm before ship).
- Price shown in death prompt before purchase.
- Cap counter stored on `PlayerSave.weekly_revive_count` + companion
  `weekly_revive_week_id` (same pattern as `weekly_sector_kills`).
- ~0.5 day dev in `purchaseSku`, `GameEngine.js`, and the death modal.


### Zero cannibalisation risk

Revive doesn't overlap with any other OMENX sink — it's a distinct
death-only interaction. Safe to ship first.

---

## Sink 2 — Fragment Express Lane

### Current state

- Star Fragments are the input to Astral Lab relic prestige (500 frags +
  7.5M gold per PL step).
- In-game route: kill Elite mobs (drop rate ~1-3% per kill) OR gold-
  convert in Forge (capped at **30 fragments/day**, rate ~130 gold each).
- **Live inventory check:** 52 active relic owners hold an average of
  **~4,100 fragments each** on hand. Whales are grinding daily but the
  30/day cap forces them to slow-drip.

### Segment sizes (active players, last 14 days)

| Segment | Count |
|---|---:|
| 🐋 Whale prestigers (5+ PL steps completed) | **9** |
| Deep prestigers (2-4 PL) | 11 |
| Light prestigers (1 PL) | 2 |
| Relic owners, no prestige yet | 30 |
| Have crafted a relic (total) | **52** |

### The proposal (locked)

- **10 OMENX = 15 fragments (batched purchases only)** — 0.67
  OMENX/fragment.
- **Weekly cap: 600 fragments / 400 OMENX per player.**
- Bypasses the 30/day Forge cap (the whole point — target the cap-hit
  whales).

### Why these numbers (against 4-week season cadence)

- 1 week at cap = **1 PL step + 20%** of the next — real, visible
  progression from one week of play.
- 4 weeks at cap (one full season) = **~5 PL steps** — a full relic's
  worth of prestige from OMENX alone. Satisfying season-long grind.
- Full 25-step prestige via OMENX only = **~5 seasons** — aspirational
  but has a finite endpoint.
- Priced above the 65k gold-equivalent floor (500 × 130g) so fragments
  aren't being sold below their in-game grind rate.
- Priced below the eventual 30-OMENX PL-skip SKU (audit §7D) so the
  premium path stays premium.

### Revenue estimate

Adoption model tiered by prestige depth:

| Scenario | Adoption pattern | Cap buyers | Partial buyers | **Weekly OMENX** | vs 14k baseline |
|---|---|---:|---:|---:|---:|
| Conservative | Only whales max out; light interest elsewhere | 9 | 9 | **~5,400** | +39% |
| Realistic | New shiny sink pulls broader adoption | 14 | 21 | **~9,800** | **+70%** |
| Optimistic | Heavy uptake if promoted in patch notes | 19 | 38 | **~15,200** | **+109%** |

Absolute theoretical maximum: 52 relic owners × 400 OMENX = **20,800
OMENX/week ceiling.** You can't over-earn from this sink — it's
naturally bounded by the size of the prestige-eligible base.

### Locked spec

- SKU: `ingame-star-fragments` (new).
- Batch size: 15 fragments per purchase.
- Weekly cap: 40 batches (= 600 frags / 400 OMENX).
- Cap counter: `PlayerSave.weekly_fragment_batches` + `weekly_fragment_batches_week_id`.
- Server grant in `purchaseSku`:
  `saveData.relicFragments += 15` per batch.
- UI: Astral Lab / Forge — new "Buy Fragments" button next to the
  existing gold-convert row. Disabled with "Weekly cap reached" tooltip
  when maxed.
- ~0.5 day dev.

### Zero cannibalisation risk

Doesn't overlap with revive, reroll, banish, or any progression SKU.
Substitutes ONLY for the gold-convert grind in Forge, which is a
low-value gold sink (~130g/frag × 30/day = 3,900 gold/day removed —
trivial vs the 76M/week gold spend we see).

---

## Combined weekly OMENX projection

Both sinks stack on top of the current W26 baseline of 18,584 OMENX/week.
Revive delta at 15/week cap = new total (~2,143) − current (1,276) =
**+867**.

| Scenario | Revive delta | Fragments (new) | **New total OMENX/week** | vs W26 | vs W23 peak (43.9k) |
|---|---:|---:|---:|---:|---:|
| Conservative | +867 | ~5,400 | **~24,851** | **+34%** | 57% |
| Realistic | +867 | ~9,800 | **~29,251** | **+57%** | 67% |
| Optimistic | +867 | ~15,200 | **~34,651** | **+86%** | 79% |

**Fragments now carry the vast majority of the revenue lift** — the
revive escalation has been progressively de-scoped as constraints
surfaced (endless-tier deleted, cap tightened, one-revive-per-run
bounding). Revive is now primarily a *pricing hygiene* intervention
(charging appropriately for late-run saves) rather than a major
revenue lever. That's fine — the sink still delivers +67% category
lift, but our expectations should sit with fragments.

Realistic combined case (~29.3k/week) recovers ~67% of the W23 peak —
without touching player count. If the S8 tease / new content in the
audit §7G lifts actives back to 50-60/week, both sinks scale
proportionally and we're back above W23 levels.

---

## What to ship first

1. **Revive escalation** (day 1 — protected, tiny scope, no risk).
2. **Fragment express lane** (day 2 — bigger revenue lever).

Ship together in the same patch. Announce as "OMENX gets meaningful
things to buy again" in patch notes.

---

## What to monitor after ship

Week 1 targets:

- Total OMENX/week ≥ **24,000** (up from 18,584 — hitting conservative
  combined case).
- Revive SKU: ≥ **25 unique buyers** (matches current baseline — cap
  shouldn't drop the buyer count, only trim the top tail).
- Revive OMENX ≥ **2,000** (vs 1,276 current — validates escalation
  is working even after cap trims volume).
- Fragment SKU: ≥ **6 unique buyers** in first week (conservative floor).
- No support tickets about the revive cap being unfair.

Week 4 targets:

- Total OMENX/week ≥ **29,000** (hitting realistic combined case).
- Fragment SKU cap-hitters: ≥ **8** (whale segment fully adopted).
- Prestige actions (`prestigeRelic` calls) up ≥ 30% — validates that
  the express lane is *enabling* more prestige, not just extracting
  OMENX from stalled grinders.
- Revive cap-hitters (players hitting 15/week): **5-8 expected**
  (matches the 30% of revive-active weeks we see today at 15+ revives).

If week 1 undershoots on the fragment SKU, first move is to loosen the
cap to 800 frags/week (not to drop the price — the price is anchored
to the gold-convert floor).