# OMENX Spend Collapse — Full Audit (2026-07-01)

**This is the actual audit.** The other 6 docs describe the systems. This
one answers the question that matters: *why is OMENX spend falling off a
cliff while gold spend is climbing, and what do we do about it?*

Without OMENX spend the game shuts down. That's the frame.

**Companion docs (S8 folder):**
- `PLAN_REVIVE_AND_FRAGMENTS.md` — locked ships for §7A + §7B.
- `PLAN_SANDBOX_TEST_PLAY.md` — retention companion (addresses the -51% active-player collapse).

---

## 1. The numbers

Aggregated from `TokenSpendLog` + `GoldSpendLog` (live DB, 2026-07-01).
`GoldSpendLog` entries older than ~10 days have been purged by
`scheduledPurgeOldSpendLogs`, so the gold column only exists from W25
onwards — but the OMENX collapse trend is clean.

| Week | OMENX spent | Active players | OMENX / active | Unique OMENX spenders | Gold spent | Gold spenders |
|---|---:|---:|---:|---:|---:|---:|
| W21 (2026-05-19) | **43,007** | 63 | **683** | 51 | (purged) | — |
| W22 (2026-05-26) | 36,132 | 55 | 657 | 43 | (purged) | — |
| W23 (2026-06-02) | 43,885 | 49 | **896** ← peak | 39 | (purged) | — |
| W24 (2026-06-09) | 20,733 | 44 | 471 | 39 | (purged) | — |
| **W25 (2026-06-16) — S7 LAUNCH** | **14,052** | 41 | **343** | 34 | 71,045,187 | 31 |
| W26 (2026-06-23) | 18,584 | 40 | 465 | 33 | 76,478,651 | 35 |
| W27 (2026-06-30, partial) | 9,553* | 31 | 308 | 28 | 23,985,886 | 21 |

*W27 is only 1 day in. Extrapolated to full week: ~66,800 OMENX — still down.*

**Headline:**
- OMENX weekly spend: **43k → 14k** in 5 weeks. **-67%.**
- OMENX per active player: **683 → 343**. **-50%.** ← this is what matters
- Active players: **63 → 31**. **-51%.** ← this is the OTHER thing that matters
- Gold spend since W25: **71M / 76M / 24M** per week (W27 partial). Massive.

**Both curves are down.** Fewer players AND each player spending less OMENX.

---

## 2. Where the OMENX spend went — category breakdown

Split every OMENX spend into 3 buckets:

- **Consumables** = `ingame-revive`, `-reroll`, `-banish`, `-xp-buff`, squad-ults
- **Progression** = `stat`, `weapon`, `talent`, `bias-respec`, `talent-respec`
- **Cosmetics** = skins/trails/kill-effects

| Week | Consumables | Progression | Cosmetics | Cons. % | Prog. % |
|---|---:|---:|---:|---:|---:|
| W21 | 17,525 | **21,127** | 313 | 41% | **49%** |
| W22 | 24,300 | 11,802 | 0 | 67% | 33% |
| W23 | **27,952** | 15,263 | 630 | 64% | 35% |
| W24 | 11,913 | 8,820 | 0 | 57% | 42% |
| W25 | 9,553 | **4,499** | 0 | 68% | **32%** |
| W26 | 10,157 | 8,417 | 0 | 55% | 45% |
| W27 | 2,723 | 6,830 | 0 | 29% | 71% |

**Two important reads:**

### 2a. Progression OMENX collapsed hardest

W21 = 21,127 OMENX on stats/weapons/talents. W25 = **4,499**. **-79%.**

This is the dangerous one. Consumables are a run-by-run impulse — they'll
come back with engagement. Progression spend is *conviction*: "I'm invested
in this account, I'll spend OMENX to skip grind." When players stop paying
to advance permanent upgrades, they're telling us **the grind is no longer
attractive to shortcut**. Either because:
- The gold path is now competitive (see §3),
- Or they've reached the cap and there's nothing left to buy,
- Or they've disengaged and don't care to progress.

### 2b. Cosmetics OMENX is functionally zero — **AND THIS IS NOW BY DESIGN**

Only 2 weeks (W21, W23) had any cosmetic spend at all — both under 650 OMENX
total. Per the locked cosmetics rework (`COSMETICS_REWORK.md` in the design
folder, 2026-06-26), this is **intentional and permanent**: the entire
cosmetic category is moving off OMENX. Standard cosmetics become GMT-only
"Support the Devs" donations (flat 15 GMT per item, real-money) at GMT
launch; the new Epic/Mythic chest cosmetics are OmenX **platform** VIP
Chest rewards (real-money purchases on the OmenX side, dropped via
webhook), not sold directly for OMENX in-app. **Cosmetics as an OMENX
sink no longer exist and shouldn't be planned around.** More in §4.

### 2c. Progression spenders (unique wallets) fell off a cliff

| Week | Total OMENX spenders | Consumers only | Progression spenders |
|---|---:|---:|---:|
| W21 | 51 | 46 | **20** |
| W22 | 43 | 43 | 11 |
| W23 | 39 | 38 | 12 |
| W24 | 39 | 38 | **6** |
| W25 | 34 | 33 | **5** |
| W26 | 33 | 31 | 6 |
| W27 | 28 | 27 | **1** |

Progression spenders went from **20 → 1**. This is essentially "a
handful of whales" — and the rest of the base has stopped buying
progression entirely. If those 1-6 whales quit, progression OMENX = 0.

---

## 3. Gold vs OMENX purchases — the substitution problem

`spendGold/entry.ts` and `purchaseSku/entry.ts` both grant the same
permanent upgrades. Every upgrade is dual-priced:

| Upgrade | Gold | OMENX | Gold-per-OMENX ratio |
|---|---:|---:|---:|
| Stat/weapon lvl 1 | 1,000 | 5 | 200 |
| Stat/weapon lvl 5 | 16,000 | 80 | 200 |
| Talent T1 | 1,000 | 10 | 100 |
| Talent T3 | 16,000 | 40 | 400 |
| Skin tier 1 | 5,000 | 5 | **1,000** |
| Trail epic | 20,000 | 20 | **1,000** |

**Cosmetics are 5× cheaper per OMENX than progression is.** That's fine
for whale acquisition BUT combined with §3a below, it means the OMENX
price point is only compelling when the player is **gold-poor**.

### 3a. Gold farming has become too productive

Look at how much gold is now sloshing through the economy:

| Week | Gold spent | Astral | Relic prestige | Weapon/Stat/Talent | Squad treasury |
|---|---:|---:|---:|---:|---:|
| W25 | 71.0M | 10.7M | **39.5M** | 13.0M | 7.7M |
| W26 | 76.5M | **25.4M** | 30.0M | 12.6M | 8.4M |
| W27 (partial) | 24.0M | 1.3M | 12.0M | 9.6M | 1.1M |

31 gold-spenders in W25 spending **71M gold** = **2.3M gold per player per week**.

At the current 200 gold/OMENX ratio for progression upgrades, that's
**11,500 OMENX-equivalent per gold-spender per week** — buried in gold spend.

The reason OMENX progression died: **players can now farm enough gold to
buy every permanent upgrade in a couple of days.** The OMENX shortcut is
irrelevant. See these signals:

- **Relic prestige is 30-40M gold/week.** Prestige only exists in S6+, and
  it's now the biggest gold sink. That means whales are moving gold into
  prestige, which does nothing for OMENX flow.
- **Astral Lab pulled 25M gold in W26.** This is deliberate design as the
  "endless gold sink" — good — but it's soaking gold that could have been
  a reason to buy OMENX for shortcuts if it didn't exist.
- **Squad Treasury pulled 7-8M/week.** Similar story — new gold sink, but
  it doesn't route through OMENX at all.

**Diagnosis:** We built out the gold economy (Astral, Prestige, Treasury,
Forge) faster than we built OMENX-only demand. Every new gold sink pulls
whale attention away from OMENX purchases.

---

## 3b. The reroll–pool-bias interaction — where OMENX health actually lives

Before moving on, a critical finding from cross-referencing `TokenSpendLog`
against `PlayerSave.poolBiasAllocations` for the last 5 weeks (W23–W27):

**Reroll is the single largest OMENX consumable line item.** Every week
except W25:
- W21: reroll = 8,902 / 17,525 consumable OMENX = **51%**
- W23: reroll = 18,446 / 27,952 = **66%**
- W26: reroll = 7,924 / 10,157 = **78%**

If reroll spend collapses, the last healthy OMENX bucket collapses with it.

### Actual reroll volumes (de-aggregated from daily rows)

`TokenSpendLog` rows are aggregated per wallet per day. At 2 OMENX/reroll,
`amount / 2` = actual reroll count. Real numbers over the last 6 weeks:

| Week | OMENX | **Rerolls** | Rerollers | Avg rerolls/wallet/week | Avg OMENX/wallet/week |
|---|---:|---:|---:|---:|---:|
| W22 | 12,992 | **6,496** | 33 | 197 | 394 |
| W23 | 18,446 | **9,223** | 29 | **318** | **636** |
| W24 | 7,086 | 3,543 | 25 | 142 | 283 |
| W25 | 5,556 | 2,778 | 21 | 132 | 265 |
| W26 | 7,924 | 3,962 | 21 | 189 | 377 |
| W27 (partial) | 2,118 | 1,059 | 16 | 66 | 132 |

**These numbers reframe the whole reroll picture:**
- The average engaged reroller does **190+ rerolls per week**, not per run.
- **Top whale did 4,989 lifetime rerolls.** Top 3 all above 3,000.
- **Daily row-size distribution:** 30% of rows are **51+ rerolls in a
  single day** (151 out of 500 rows). Another 17% are 21-50/day. Nearly
  half of daily reroll behaviour is "hammering the button in one sitting".

### The counter-intuitive finding: pool bias is *driving* reroll spend, not replacing it

Pool bias was designed to reduce the "3 bad choices at level-up" problem by
letting players push specific weapons/stats higher in the upgrade pool
(`poolBias.js` — `+10% weight per allocated point`). The intuition was
that heavy bias users would need to reroll *less* because their pool is
already tuned toward what they want.

The data shows the opposite: **85-90% of all rerollers every week have
bias allocated**, and the biggest rerollers overlap heavily with the
heaviest bias whales. Pool bias hasn't reduced reroll demand — it has
coincided with, and possibly *enabled*, the highest-spending reroll
behaviour we have.

### Two competing readings

**Reading A — "Bias is a whale marker, not a substitute for reroll."**
Heavy bias allocation is a signal that the player is an engaged
optimiser. They allocated 60+ points because they care about optimal
builds. That same personality is the one who will reroll aggressively
when a level-up doesn't offer their biased target — bias raised their
*expectation* of getting the right upgrade, so a missed roll feels worse
and gets rerolled. Bias didn't fix the reroll problem; it made rerolling
feel more justified.

**Reading B — "Bias multiplier is too weak to obviate reroll."**
+10% weight per point sounds significant but at 20 points allocated to
one weapon (=3× weight), you still see it in only ~35% of level-ups
against the 20+ other pool entries. That's not enough to feel "my pool
is tuned" — it's still a probabilistic scatter. So players allocate,
still don't see the target enough, and reroll to force it.

**Both are probably true.** Either way, the important business fact is:

> **Pool bias is not a substitute for reroll — it's a *complement* to it.
> Heavy bias users are our reroll whales.**

### Bias respec spend is negligible

`bias-respec` (10 OMENX to clear all allocations) shows up **7 times
total** across W21–W27. Players allocate and never rethink. This means:
- The escalating gold-respec cost curve (`GOLD_RESPEC_TIERS = [2000,
  4000, 8000, 16000]`) is not a meaningful sink. Only 17 out of 105
  saves have EVER respec'd (16%), and only 6% have done it more than once.
- The OMENX respec at 10 OMENX is essentially unused. Priced too high
  relative to the perceived benefit of a rethink? Or players just never
  want to rethink? The data can't distinguish, but either way the SKU
  isn't producing revenue.

### What this means for interventions

Anything that reduces the "3 bad choices" friction — including well-
intentioned buffs to pool bias — will directly cannibalise our biggest
consumable line. Specifically:

- **Pick 2 / Pick All (recommendation §7A) directly threatens reroll
  spend — worse than initially thought.** A heavy-bias whale rerolls
  **200-600 OMENX per week** (100-300 individual rerolls). At 8 OMENX
  for Pick 2, a whale who would otherwise chain 5 rerolls on one
  level-up chasing their biased target now pays 8 once instead of 10 —
  and eliminates the *next* 4 rerolls too, because they take everything
  they wanted. Pick 2 doesn't just fail to be additive; on the biggest
  spenders it's probably a **~40% net cut** to reroll revenue on those
  level-ups. Pick All at 15 OMENX for all 3 is worse.
- **Buffing bias multiplier (10% → 15% per point) would likely REDUCE
  OMENX spend**, not increase it. Bias is currently a whale marker; make
  it more effective and it starts actually reducing the "missed target"
  frustration that drives rerolls.
- **The real question is whether reroll demand SHOULD be this high.** A
  well-designed level-up pool with a working bias system shouldn't need
  a whale mashing 300 rerolls in a week. **30% of daily reroll rows are
  51+ rerolls in a single sitting** — that's not "chasing a target",
  that's compulsive-loop behaviour. Two readings:
  1. **Positive:** it's fun and lucrative — the dopamine of "one more
     roll" is our best per-player OMENX generator by a wide margin.
     Don't touch it, ship additive sinks elsewhere.
  2. **Cautionary:** 51+ rerolls/day is a UX / anti-fatigue red flag.
     Players hammering that hard often burn out fast — could be a
     contributor to the -51% actives collapse (§5). Worth a designer
     eye on whether the loop is genuinely fun or attritionally
     rewarding.
  Either way, don't casually kneecap it.

**Bottom line:** reroll + bias are a coupled system generating over
half of our healthy OMENX bucket, and the per-whale figures are much
higher than we thought. Do not add "Pick 2 / Pick All" or buff pool
bias without a clear replacement sink lined up, or we accelerate the
very collapse we're trying to arrest.

---

## 4. Cosmetics have moved out of the OMENX economy entirely

The old assumption in §7 of the first draft — "sell more cosmetics for
OMENX" — is dead. Per the locked design (`COSMETICS_REWORK.md`,
`VIP_CHESTS.md` in the design folder) cosmetics are now a **real-money-only
category**, split into two rails:

### 4a. Standard cosmetics → GMT "Support the Devs" donations

All existing Armoury cosmetics (trails, kill FX, character skins) are
being **repositioned** as a flat-15-GMT donation tier at GMT launch. Until
GMT ships, purchase buttons are disabled ("Coming soon"). Every OMENX and
gold cosmetic SKU in `skuMap.js` will be replaced by a single GMT SKU per
item.

**Consequence:** The 313 / 630 OMENX cosmetic weeks (W21 / W23) are not
just "flat" — they're the tail end of a category that's being deleted
from the OMENX economy on purpose. Standard cosmetics will never
contribute to OMENX spend again.

### 4b. Chest cosmetics → OmenX VIP Chests (real-money via platform)

The new 20-item Epic/Mythic chest catalogue (13 Epic + 7 Mythic, all
generated + code-integrated as of 2026-06-27) is not for sale in-app.
Players open OmenX **platform** VIP Chests (Bronze → Elite, 15 → 750 GMT
each, some tiers also charging OMENX), OmenX rolls the loot table
platform-side, and a webhook grants the cosmetic to our PlayerSave. **No
OMENX changes hands in our purchase flow for these** — the OMENX chest
tiers charge (Silver 100, Gold 200, Platinum 300, Diamond 500, Legend
1000, Elite 1500) settle on the **OmenX platform**, not our
`TokenSpendLog`.

**Consequence:** Chest OMENX spend will appear as **new external revenue
to OmenX**, likely visible only in the dev-portal Revenue tab, not in our
weekly `TokenPool.total_spent`. Our internal OMENX spend number will
stay flat on cosmetics forever.

### 4c. What this means for the audit

The "OMENX per active player" figure in §1 is **structurally never going
back to 683 via cosmetics**. Cosmetic OMENX is retired as a lever.
Everything else in this doc — progression, consumables, prestige, gold
sinks — is what's actually available to tune.

There's also a nuance worth naming: chest OMENX (Silver+ tiers) is real
OMENX being spent — just not in our books. If we care about total OMENX
demand across the ecosystem, chests are a huge new sink. If we care about
**our weekly reward pool** (which is funded from `TokenSpendLog`, i.e.
in-app spend only), chests contribute zero. Those are two different
metrics and both matter — see §7.

---

## 5. Why active player count fell 51%

W21 = 63 actives, W27 = 31 actives. This is the multiplier on the
per-player collapse. Suspected causes:

1. **S6 → S7 launch on W25 (2026-06-16).** Should have been a spike, not a
   dip. Patch notes cover shield nerf, HP curve, HEAT bonus, and the new
   kill leaderboard. But the launch WEEK (W25) saw:
   - 41 actives (down from 44)
   - 14,052 OMENX (down from 20,733)
   No visible bump. Suggests S7 either wasn't compelling enough OR players
   who dominated S6 with shield builds churned before trying the new meta.

2. **Meta rebalance without new content.** S7 patch notes explicitly say
   "No save wipe. No relic reset. Just balance." — but there's also **no
   new characters, no new sectors, no new weapons, no new cosmetics that
   the whole player base can chase**. Balance-only patches don't drive
   player return.

3. **OMENX pool re-split (W25).** Weekly score payout dropped from 20% → 15%
   of spend. Top-30 earners saw their weekly OMENX prize drop by ~25%.
   That's a direct disincentive to top players (documented risk in the
   re-split doc, §"Top-player backlash"). Combined with the meta shakeup,
   the top of the leaderboard may have partially disengaged.

4. **No S8 tease.** No visible "coming next" hook. If players finish
   prestiging in S7, they have no forward path.

---

## 6. The real diagnosis — plain language

**We accidentally built a game where gold farming is the fun part and
OMENX is barely necessary.**

- The gold economy has THREE endgame sinks (Astral, Prestige, Treasury) all
  added in S6+. They're deep, expensive, and *feel like progress*.
- The OMENX economy has ONE compelling category (in-run consumables) that
  players use reflexively during a run but doesn't scale.
- Progression OMENX purchases died because gold farming outpaces the
  OMENX-progression price curve.
- Cosmetic OMENX purchases died because gold is a valid alternative and
  the top cosmetics aren't even sold for OMENX.
- Player count dropped 51% because S7 launched with no new content, only
  balance changes + a payout REDUCTION for top earners.

The revenue system is upside-down: the assets that USE OMENX (consumables)
have no aspiration, and the assets that generate aspiration (permanent
upgrades, cosmetics, prestige) can all be bought with farmed gold or aren't
sold at all.

---

## 7. Recommended interventions, ranked by expected impact

**Ground rule:** cosmetics are off the table as an OMENX lever (see §4).
Every intervention below targets **progression, consumables, or gold-sink
rebalance** — the three levers that actually route through
`TokenSpendLog`.

### Immediate (this week)

**⚠️ Order matters — the reroll–bias interaction (§3b) changes the
priority of what to ship first. Pick 2 / Pick All is no longer the safe
lead.**

**A. Ship the Revive escalation + weekly cap.** Currently 4 OMENX flat.
The engine already fires the death prompt (verified at
`GameEngine.js:673`). Just needs a time-based cost curve (4 → 8 → 15 →
25 OMENX past 5/10/25 min) and a weekly cap. ~0.5 day. **Zero
cannibalisation risk** — it targets endless whales who currently pay
4 OMENX to save a 45-minute run, and simply charges more where the
value delivered is highest. This is the cleanest ship. **Locked in
`PLAN_REVIVE_AND_FRAGMENTS.md`.**

**B. Ship the OMENX → Star Fragments express lane.** **Locked pricing:
10 OMENX = 15 fragments (batched purchases only).** Full spec + revenue
math in `PLAN_REVIVE_AND_FRAGMENTS.md`.

**C. HOLD on Pick 2 / Pick All.** Per §3b, reroll is 50-78% of our
consumable OMENX and heavy-bias players (our whales) already spend
~45 OMENX/run on rerolls chasing the biased target. A Pick 2 at 8 OMENX
that consumes ONE level-up is likely revenue-neutral; Pick All at 15 for
3 picks is probably net negative vs the current 3-4 chained rerolls per
missed target. Do NOT bundle A+B+C in one patch.

### Short-term (next 1-2 weeks)

**D. Add an OMENX "instant prestige" shortcut.** Prestige currently costs
7.5M gold + 500 fragments per relic level. That's ~32 casual weeks per
relic. Add an OMENX button: pay 30 OMENX per PL to skip a level. A
completionist whale fully prestiging 5 relics × 5 levels = 750 OMENX per
account. This is the single biggest untapped **progression** sink.

**E. Rebalance Astral Lab cost curve upward.** Current 1.4× growth per
pull is generous — 25M gold pulled through it in W26 alone. Bump to 1.5×
so gold sits in accounts longer. Whales sitting on gold are more likely
to consider OMENX progression shortcuts than whales who just emptied
their bank.

**F. Squad-Wide Buffs funded with OMENX.** Extend the existing
`Squad.active_buff_tier` field (currently gold-treasury-funded) to
accept an OMENX-funded activation path. 200-500 OMENX per week for a
squad-wide effect. Creates social pressure to donate — a category that
currently exists only in gold (7-8M/week going to gold treasury alone).

### Medium-term (next 2-4 weeks)

**G. Ship an S8 tease + a genuinely new content drop.** Balance patches
don't retain. Active player count has halved. Even one new character or
one new sector reactivates the player base. Nothing in this audit's
recommendations matters if the active count keeps falling — you need
players *before* you have anyone to sell OMENX to. **See
`PLAN_SANDBOX_TEST_PLAY.md` for the S8 retention hook.**

**H. Refresh the daily OMENX-featured shop.** A daily rotating "featured
item" that's OMENX-only and time-limited (24h). Rotates existing
consumable SKUs — no new content needed. Creates a daily reason to log
in AND to hold OMENX.

**I. Battle Pass (deferred to S8).** Marco confirmed BP is roadmapped but
not launching with chests. Once designed, a 500 OMENX season pass is a
massive OMENX anchor — this is the single biggest structural sink on the
horizon.

### Structural (harder, higher upside)

**J. Reconsider the W25 weekly-score pool cut.** Going from 20% → 15% of
spend was intended to fund the kill pool AND extend runway. Active
players fell 51% since. If top earners partially disengaged in response
to the ~25% weekly-prize haircut, the lost future spend outweighs the 5%
saved. Consider restoring to 18% score + 5% kills as a mid-season
correction.

**K. VIP Chest promotion inside the app.** Chest cosmetics don't fund
our OMENX pool, BUT chest **purchases** are real OMENX revenue on the
OmenX platform side (Silver+ tiers charge 100-1500 OMENX per open). A
Wardrobe teaser card ("Open a chest to unlock this →") converts our
in-app engagement into platform revenue. Doesn't hit `TokenSpendLog` but
lifts our overall OmenX-ecosystem contribution, which is what OmenX
uses to weight future platform features / promotion / VIP-tier lists.

**L. OMENX-only relic slots or perks.** Right now every permanent upgrade
is dual-priced. A single "exclusive" perk tree accessible only via OMENX
(e.g. a 6th relic slot; an OMENX-only pilot title tier that isn't a
chest reward) creates a category gold can never touch. Same principle
as the Battle Pass but shipped as smaller pieces.

---

## 8. What to watch weekly

Simple dashboard I recommend building (all queries already possible against
existing entities):

1. `OMENX spend / active player` — top-line health metric. Target: hold ≥ 500.
2. `OMENX progression spenders / week` — target: > 15 (was 20 pre-collapse).
3. `OMENX consumable spenders / week` — the still-healthy bucket. Watch
   for drop.
4. `Gold spend / OMENX spend ratio` — currently gold is doing ALL the
   work on permanent upgrades. Target: bring this ratio down by making
   gold sinks slower (Astral 1.4× → 1.5×) or OMENX progression paths
   cheaper (Pick 2, Pick All, revive cap, prestige shortcut).
5. `Active player count 7d MAA` — target: back to 55+ within 4 weeks.
6. **NEW when chests ship:** OmenX platform revenue tab (chest sales
   attributed to Cosmic Sloths). Not in our DB — check dev portal.

If any of 1-3 drop again next week without action, escalate.

---

## 9. The single most important sentence

**Gold has three deep endgame sinks. OMENX has one healthy bucket
(in-run consumables) and its progression + cosmetic buckets have been
neutralised by design.** The fix is to build more compelling
consumables and progression shortcuts (§7 A–F) — cosmetics are no
longer a lever we own for our internal pool, they belong to the OmenX
platform now.